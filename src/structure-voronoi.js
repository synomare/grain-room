import {grid,at} from './research-math.js';
import {hash,clamp,sample} from './pixels.js';

export function pointTree(points,ids=points.map((_,i)=>i),depth=0){
 if(!ids.length)return null;const axis=depth%2;ids.sort((a,b)=>points[a][axis]-points[b][axis]||a-b);const mid=ids.length>>1,id=ids[mid];
 return {id,point:points[id],axis,left:pointTree(points,ids.slice(0,mid),depth+1),right:pointTree(points,ids.slice(mid+1),depth+1)};
}
export function nearestPair(tree,x,y){
 let first=-1,second=-1,d1=Infinity,d2=Infinity;
 function visit(node){if(!node)return;const dx=x-node.point[0],dy=y-node.point[1],d=dx*dx+dy*dy;
  if(d<d1||(d===d1&&node.id<first)){d2=d1;second=first;d1=d;first=node.id;}else if(d<d2||(d===d2&&node.id<second)){d2=d;second=node.id;}
  const delta=node.axis?dy:dx;visit(delta<0?node.left:node.right);if(delta*delta<=d2)visit(delta<0?node.right:node.left);
 }visit(tree);return {first,second,d1,d2};
}
export function lloydStep(points,density,w,h){
 const tree=pointTree(points),sums=points.map(()=>[0,0,0]);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=nearestPair(tree,x,y).first,rho=density[y*w+x],s=sums[j];s[0]+=rho*x;s[1]+=rho*y;s[2]+=rho;}
 return points.map((p,i)=>sums[i][2]>0?[sums[i][0]/sums[i][2],sums[i][1]/sums[i][2]]:[...p]);
}
export function fault(a,w,h,p){
 const g=grid(a,w,h,160),W=g.w,H=g.h,rho=new Float32Array(W*H),count=Math.min(p.cells,W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,dx=at(g.l,W,H,x+1,y)-at(g.l,W,H,x-1,y),dy=at(g.l,W,H,x,y+1)-at(g.l,W,H,x,y-1);rho[i]=.08+g.l[i]*.7+Math.min(1,Math.hypot(dx,dy)*3);}
 let points=[];
 for(let k=0;k<count;k++){
  let x=0,y=0;for(let j=0;j<12;j++){x=hash(k,j*2,p.seed)*(W-1);y=hash(k,j*2+1,p.seed)*(H-1);if(hash(k,j+43,p.seed)*1.78<at(rho,W,H,x,y))break;}
  points.push([x,y]);
 }
 for(let k=0;k<p.relax;k++)points=lloydStep(points,rho,W,H);
 const tree=pointTree(points),out=new Uint8ClampedArray(a.length),unit=Math.sqrt(W*H/count),shift=p.fracture/100*unit*2,gap=p.gap/100*unit*.3;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const gx=(x+.5)*W/w-.5,gy=(y+.5)*H/h-.5,{first:j,second:k,d1,d2}=nearestPair(tree,gx,gy),[cx,cy]=points[j],other=points[k]||points[j],span=Math.hypot(other[0]-cx,other[1]-cy),edge=span>1e-7?(d2-d1)/(2*span):unit;
  const coverage=clamp((edge-gap)*w/W+.5,0,1),theta=(hash(j,19,p.seed)-.5)*p.fracture/100*.8,co=Math.cos(theta),si=Math.sin(theta),sx=(cx+(gx-cx)*co-(gy-cy)*si+(hash(j,23,p.seed)-.5)*shift)*w/W,sy=(cy+(gx-cx)*si+(gy-cy)*co+(hash(j,29,p.seed)-.5)*shift)*h/H;
  const rim=Math.exp(-Math.max(0,edge-gap)/(unit*.12+.01))*p.bevel/100,normal=span>1e-7?((other[0]-cx)*-.6+(other[1]-cy)*-.8)/span:0,shade=.85+.2*hash(j,31,p.seed)+rim*normal*.7,i=(y*w+x)*4;
  for(let c=0;c<3;c++){const v=sample(a,w,h,sx,sy,c)*shade+Math.max(0,normal)*rim*65;out[i+c]=coverage*v+(1-coverage)*(5+c*1.5);}out[i+3]=255;
 }return out;
}
