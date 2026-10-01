import {hash,clamp,sample} from './pixels.js';
import {grid,at,blur} from './research-math.js';
// Kim et al. Eqs. 10-13: omit the shared count term, cancelled by min/max normalization.
export function chargePotential(x,y,points){let v=0;for(const p of points)v-=.5/Math.hypot(x-p.x,y-p.y);return v;}
export function normalizedWeights(potentials,eta){const lo=Math.min(...potentials),hi=Math.max(...potentials),d=hi-lo;return potentials.map(v=>d<1e-12?1:Math.pow((v-lo)/d,eta));}
export function growDischarge(w,h,photo,{steps=1800,seeds=8,eta=2,memory=1,seed=17}={}){
 const points=[],occupied=new Int32Array(w*h).fill(-1),candidates=new Map();
 const addNeighbors=(p,index)=>{for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const x=p.x+dx,y=p.y+dy,key=y*w+x;if(x<0||x>=w||y<0||y>=h||occupied[key]>=0||candidates.has(key))continue;candidates.set(key,{x,y,parent:index,potential:chargePotential(x,y,points)});}};
 for(let j=0;j<seeds;j++){
  let best=null,score=-1;for(let k=0;k<32;k++){const x=Math.floor(hash(j*32+k,11,seed)*w)%w,y=Math.floor(hash(j*32+k,12,seed)*h)%h,key=y*w+x;if(occupied[key]>=0)continue;const s=hash(k,j+44,seed)*Math.exp(memory*(photo[key]-.5));if(s>score){best={x,y,parent:-1,mass:1};score=s;}}
  if(best){occupied[best.y*w+best.x]=points.length;points.push(best);}
 }
 points.forEach(addNeighbors);
 for(let t=points.length;t<Math.min(steps,w*h);t++){
  if(!candidates.size)break;let lo=Infinity,hi=-Infinity;for(const q of candidates.values()){lo=Math.min(lo,q.potential);hi=Math.max(hi,q.potential);}
  let total=0;const range=hi-lo;for(const q of candidates.values()){q.weight=(range<1e-12?1:Math.pow((q.potential-lo)/range,eta))*Math.exp(memory*(photo[q.y*w+q.x]-.5));total+=q.weight;}
  let target=hash(t,918,seed)*total,chosen;for(const q of candidates.values()){target-=q.weight;if(target<=0){chosen=q;break;}}if(!chosen)chosen=candidates.values().next().value;
  const p={x:chosen.x,y:chosen.y,parent:chosen.parent,mass:1},key=p.y*w+p.x,index=points.length;candidates.delete(key);occupied[key]=index;points.push(p);
  for(const q of candidates.values())q.potential-=.5/Math.hypot(q.x-p.x,q.y-p.y);
  addNeighbors(p,index);
 }
 for(let i=points.length-1;i>=0;i--)if(points[i].parent>=0)points[points[i].parent].mass+=points[i].mass;
 return points;
}
export function dendrite(a,w,h,p){
 const size=p.scale,g=grid(a,w,h,size),photo=blur(g.l,g.w,g.h,2),points=growDischarge(g.w,g.h,photo,{steps:p.growth*24,seeds:p.seeds,eta:p.eta/100,memory:p.memory/25,seed:p.seed}),out=new Uint8ClampedArray(a.length),span=Math.max(w,h),unit=span/Math.max(g.w,g.h),coverage=new Float32Array(w*h),height=new Float32Array(w*h).fill(-Infinity),rgb=[0,1,2].map(()=>new Float32Array(w*h));
 const colors=g.rgb.map(v=>blur(v,g.w,g.h,3));
 for(const q of points){
  if(q.parent<0)continue;const parent=points[q.parent],x0=(q.x+.5)*w/g.w,y0=(q.y+.5)*h/g.h,x1=(parent.x+.5)*w/g.w,y1=(parent.y+.5)*h/g.h,dx=x1-x0,dy=y1-y0,den=dx*dx+dy*dy||1;
  const radius=unit*(.07+p.width/100*.48)*Math.pow(q.mass,.12+p.taper/100*.22),r1=unit*(.07+p.width/100*.48)*Math.pow(parent.mass,.12+p.taper/100*.22),col=[q,parent].map(q=>[0,1,2].map(c=>at(colors[c],g.w,g.h,q.x+p.shift*.18,q.y-p.shift*.12)*255)),pad=Math.max(radius,r1)+1;
  for(let y=Math.max(0,Math.floor(Math.min(y0,y1)-pad));y<=Math.min(h-1,Math.ceil(Math.max(y0,y1)+pad));y++)for(let x=Math.max(0,Math.floor(Math.min(x0,x1)-pad));x<=Math.min(w-1,Math.ceil(Math.max(x0,x1)+pad));x++){
   const t=clamp(((x+.5-x0)*dx+(y+.5-y0)*dy)/den,0,1),distance=Math.hypot(x+.5-x0-t*dx,y+.5-y0-t*dy),r=radius+(r1-radius)*t,alpha=clamp(r+.5-distance,0,1),i=y*w+x,score=r-distance;
   if(alpha>0&&score>height[i]){height[i]=score;coverage[i]=alpha;const shade=1+p.relief/100*(Math.sqrt(Math.max(0,1-(distance/r)**2))*.7-.35);for(let c=0;c<3;c++)rgb[c][i]=(col[0][c]*(1-t)+col[1][c]*t)*shade;}
  }
 }
 for(let i=0;i<w*h;i++){const k=i*4,alpha=coverage[i];for(let c=0;c<3;c++){const background=p.paper*2.55*(1-p.ghost/100)+a[k+c]*p.ghost/100;out[k+c]=background*(1-alpha)+rgb[c][i]*alpha;}out[k+3]=255;}
 return out;
}
