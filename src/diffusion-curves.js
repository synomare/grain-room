import {sample} from './pixels.js';

export const CURVE_ANALYSIS_EDGE=320;
export const CURVE_RENDER_EDGE=512;
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const luma=q=>q[0]*.2126+q[1]*.7152+q[2]*.0722;

export function curveGuide(a,w,h,edge=CURVE_ANALYSIS_EDGE){
 const factor=Math.min(1,edge/Math.max(w,h)),gw=Math.max(1,Math.round(w*factor)),gh=Math.max(1,Math.round(h*factor)),sx=w/gw,sy=h/gh;
 const rows=new Float64Array(gw*h*3),rgb=new Float64Array(gw*gh*3);
 for(let y=0;y<h;y++)for(let x=0;x<gw;x++){
  const left=x*sx,right=(x+1)*sx;
  for(let xx=Math.floor(left);xx<Math.ceil(right);xx++){const weight=(Math.min(right,xx+1)-Math.max(left,xx))/sx/255,i=(y*w+Math.min(w-1,xx))*4,j=(y*gw+x)*3;for(let c=0;c<3;c++)rows[j+c]+=a[i+c]*weight;}
 }
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
  const top=y*sy,bottom=(y+1)*sy;
  for(let yy=Math.floor(top);yy<Math.ceil(bottom);yy++){const weight=(Math.min(bottom,yy+1)-Math.max(top,yy))/sy,i=(Math.min(h-1,yy)*gw+x)*3,j=(y*gw+x)*3;for(let c=0;c<3;c++)rgb[j+c]+=rows[i+c]*weight;}
 }
 return {rgb,w:gw,h:gh};
}
function gaussian(rgb,w,h,sigma=1){
 const radius=Math.ceil(sigma*3),weights=Float64Array.from({length:2*radius+1},(_,i)=>Math.exp(-.5*((i-radius)/sigma)**2)),sum=weights.reduce((a,b)=>a+b,0),tmp=rgb.slice(),out=rgb.slice();
 for(let j=0;j<weights.length;j++)weights[j]/=sum;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let v=0;for(let k=-radius;k<=radius;k++)v+=rgb[(y*w+clamp(x+k,0,w-1))*3+c]*weights[k+radius];tmp[(y*w+x)*3+c]=v;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let v=0;for(let k=-radius;k<=radius;k++)v+=tmp[(clamp(y+k,0,h-1)*w+x)*3+c]*weights[k+radius];out[(y*w+x)*3+c]=v;}
 return out;
}

// Di Zenzo color gradient: dominant eigenvector/eigenvalue of the 2x2
// RGB derivative tensor. Equal-luma chromatic boundaries remain detectable.
export function colorEdges(rgb,w,h,detail=55){
 const smooth=gaussian(rgb,w,h),mag=new Float64Array(w*h),nx=mag.slice(),ny=mag.slice(),thin=mag.slice();
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  let xx=0,xy=0,yy=0;
  for(let c=0;c<3;c++){
   const at=(dx,dy)=>smooth[((y+dy)*w+x+dx)*3+c];
   const dx=(at(1,-1)+2*at(1,0)+at(1,1)-at(-1,-1)-2*at(-1,0)-at(-1,1))/8;
   const dy=(at(-1,1)+2*at(0,1)+at(1,1)-at(-1,-1)-2*at(0,-1)-at(1,-1))/8;
   xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;
  }
  const i=y*w+x,angle=.5*Math.atan2(2*xy,xx-yy);nx[i]=Math.cos(angle);ny[i]=Math.sin(angle);mag[i]=Math.sqrt(Math.max(0,(xx+yy+Math.sqrt((xx-yy)**2+4*xy*xy))/2));
 }
 const high=.008+.18*((100-detail)/100)**2,low=high*.4,mask=new Uint8Array(w*h),queue=[];
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
  const i=y*w+x,m=mag[i],a=sample(mag,w,h,x-nx[i],y-ny[i],0,1),b=sample(mag,w,h,x+nx[i],y+ny[i],0,1);
  if(m>=low&&m>=a&&m>b){thin[i]=m;if(m>=high){mask[i]=1;queue.push(i);}}
 }
 for(let k=0;k<queue.length;k++){const i=queue[k],x=i%w,y=Math.floor(i/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,j=yy*w+xx;if(xx>0&&xx<w-1&&yy>0&&yy<h-1&&!mask[j]&&thin[j]>0){mask[j]=1;queue.push(j);}}}
 return {mask,mag,nx,ny,smooth};
}

function neighbors(mask,w,h,i){
 const x=i%w,y=Math.floor(i/w),out=[];
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(dx||dy){const xx=x+dx,yy=y+dy;if(xx<0||xx>=w||yy<0||yy>=h)continue;const j=yy*w+xx;if(!mask[j])continue;
  // Ignore the redundant diagonal when an orthogonal route exists.
  if(dx&&dy&&(mask[y*w+xx]||mask[yy*w+x]))continue;out.push(j);
 }return out;
}
export function traceEdgeChains(mask,w,h){
 const visited=new Set(),chains=[],adj=Array.from({length:mask.length},(_,i)=>mask[i]?neighbors(mask,w,h,i):[]),edgeKey=(i,j)=>Math.min(i,j)*mask.length+Math.max(i,j);
 function trace(start,next){const chain=[start];let previous=start,current=next;visited.add(edgeKey(start,next));
  for(let k=0;k<mask.length;k++){chain.push(current);if(current===start||adj[current].length!==2)break;const n=adj[current][0]===previous?adj[current][1]:adj[current][0];if(visited.has(edgeKey(current,n)))break;visited.add(edgeKey(current,n));previous=current;current=n;}
  chains.push(chain);
 }
 for(let i=0;i<mask.length;i++)if(adj[i].length!==2)for(const j of adj[i])if(!visited.has(edgeKey(i,j)))trace(i,j);
 for(let i=0;i<mask.length;i++)for(const j of adj[i])if(!visited.has(edgeKey(i,j)))trace(i,j);
 return chains;
}
export function simplifyPolyline(points,tolerance){
 if(points.length<3)return points.slice();const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;const stack=[[0,points.length-1]];
 while(stack.length){const [a,b]=stack.pop(),p=points[a],q=points[b],dx=q[0]-p[0],dy=q[1]-p[1],den=dx*dx+dy*dy;let best=tolerance*tolerance,id=-1;
  for(let i=a+1;i<b;i++){const r=points[i],t=den?clamp(((r[0]-p[0])*dx+(r[1]-p[1])*dy)/den):0,d=(r[0]-p[0]-t*dx)**2+(r[1]-p[1]-t*dy)**2;if(d>best){best=d;id=i;}}
  if(id>=0){keep[id]=1;stack.push([a,id],[id,b]);}
 }
 return points.filter((_,i)=>keep[i]);
}
// Chord-length Hermite rounding. This is an independent geometry approximation,
// not the least-squares Bezier fitting stage of Orzan et al.
export function roundCurvePolyline(vertices){
 const closed=vertices.length>3&&Math.hypot(vertices[0][0]-vertices.at(-1)[0],vertices[0][1]-vertices.at(-1)[1])<1e-9;
 const v=closed?vertices.slice(0,-1):vertices,count=v.length,out=[];
 const tangent=i=>{const a=v[closed?(i-1+count)%count:Math.max(0,i-1)],b=v[closed?(i+1)%count:Math.min(count-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);return len?[dx/len,dy/len]:[0,0];};
 for(let j=0;j<(closed?count:count-1);j++){
  const p=v[j],q=v[(j+1)%count],len=Math.hypot(q[0]-p[0],q[1]-p[1]),a=tangent(j),b=tangent((j+1)%count),steps=Math.max(1,Math.ceil(len/.65));
  for(let k=0;k<steps;k++){const t=k/steps,t2=t*t,t3=t2*t,A=2*t3-3*t2+1,B=t3-2*t2+t,C=-2*t3+3*t2,D=t3-t2;out.push([A*p[0]+B*a[0]*len*.8+C*q[0]+D*b[0]*len*.8,A*p[1]+B*a[1]*len*.8+C*q[1]+D*b[1]*len*.8]);}
 }
 out.push((closed?v[0]:v.at(-1)).slice());return out;
}
export function extractCurves(guide,{detail=55,length=15,smooth=35}={}){
 const {rgb,w,h}=guide,edge=Math.max(w,h),edges=colorEdges(rgb,w,h,detail),chains=traceEdgeChains(edges.mask,w,h),curves=[];
 for(const chain of chains){
  const positions=chain.map(i=>{
   const x=i%w,y=Math.floor(i/w),a=sample(edges.mag,w,h,x-edges.nx[i],y-edges.ny[i],0,1),b=edges.mag[i],c=sample(edges.mag,w,h,x+edges.nx[i],y+edges.ny[i],0,1),den=a-2*b+c,offset=Math.abs(den)>1e-12?clamp(.5*(a-c)/den,-.5,.5):0;
   return [x+.5+offset*edges.nx[i],y+.5+offset*edges.ny[i]];
  });
  let arc=0,score=0;for(let j=1;j<positions.length;j++){arc+=Math.hypot(positions[j][0]-positions[j-1][0],positions[j][1]-positions[j-1][1]);score+=edges.mag[chain[j]];}
  if(arc<2+length/100*edge*.08||positions.length<3)continue;
  const simplified=simplifyPolyline(positions,.12+smooth/100*1.9),points=[];if(simplified.length<2)continue;
  const vertices=roundCurvePolyline(simplified);
  // Color attributes are sampled densely on the simplified geometry, rather
  // than merely assigning one pair to an entire chain.
  for(let j=1;j<vertices.length;j++){
   const p=vertices[j-1],q=vertices[j],dx=q[0]-p[0],dy=q[1]-p[1],len=Math.hypot(dx,dy);if(len<1e-10)continue;
   const steps=Math.max(1,Math.ceil(len/1.5)),nx=dy/len,ny=-dx/len;
   for(let k=0;k<steps;k++){
    const t=k/steps,x=p[0]+t*dx,y=p[1]+t*dy,left=[],right=[];
    for(let c=0;c<3;c++){left.push(sample(rgb,w,h,x-.5+2*nx,y-.5+2*ny,c,3));right.push(sample(rgb,w,h,x-.5-2*nx,y-.5-2*ny,c,3));}
    points.push({x:x/edge,y:y/edge,left,right});
   }
  }
  if(!points.length)continue;const end=vertices.at(-1),last=points.at(-1),first=points[0],closed=Math.hypot(end[0]/edge-first.x,end[1]/edge-first.y)<1e-9;
  points.push({x:end[0]/edge,y:end[1]/edge,left:(closed?first:last).left.slice(),right:(closed?first:last).right.slice()});
  const side=points.reduce((s,p)=>s+luma(p.left)-luma(p.right),0);if(side<0){points.reverse();for(const p of points)[p.left,p.right]=[p.right,p.left];}
  curves.push({points,score:score/Math.max(1,positions.length-1)*arc,length:arc/edge});
 }
 curves.sort((a,b)=>b.score-a.score);return {curves:curves.slice(0,1200),edge,aspect:w/h,mean:[0,1,2].map(c=>{let s=0;for(let i=c;i<rgb.length;i+=3)s+=rgb[i];return s/(w*h);}),rawChains:chains.length};
}

export function editCurveColors(curves,{jump=100,paper=0}={}){
 return curves.map(curve=>({...curve,points:curve.points.map(p=>{
  const left=[],right=[];for(let c=0;c<3;c++){const mean=(p.left[c]+p.right[c])/2,d=(p.left[c]-p.right[c])*jump/200;left[c]=clamp(mean+d)*(1-paper/100)+paper/100;right[c]=clamp(mean-d);}
  return {...p,left,right};
 })}));
}

// Edge-centered Poisson least squares: min sum_edges (u_j-u_i-g_ij)^2,
// with fixed off-curve RGB sources. A jump crossing a pixel-center edge
// contributes its full difference, rather than a sampled normal component.
export function rasterizeCurves(curves,w,h,sourceEdge=CURVE_ANALYSIS_EDGE){
 const edge=Math.max(w,h),fixed=new Uint8Array(w*h),colors=new Float64Array(w*h*3),counts=new Uint32Array(w*h),owner=new Int32Array(w*h).fill(-1),side=new Int8Array(w*h);
 const gx=new Float64Array(w*h*3),gy=gx.slice(),jxCount=new Uint16Array(w*h),jyCount=jxCount.slice(),distance=2*edge/sourceEdge;
 function source(x,y,color,id,s){
  const xx=Math.round(x-.5),yy=Math.round(y-.5);if(xx<0||xx>=w||yy<0||yy>=h)return;const i=yy*w+xx;
  if(fixed[i]===2)return;if(owner[i]!==-1&&(owner[i]!==id||side[i]!==s)){fixed[i]=2;counts[i]=0;colors.fill(0,i*3,i*3+3);return;}
  fixed[i]=1;owner[i]=id;side[i]=s;counts[i]++;for(let c=0;c<3;c++)colors[i*3+c]+=color[c];
 }
 for(let id=0;id<curves.length;id++){
  const points=curves[id].points;
  for(let k=1;k<points.length;k++){
   const p=points[k-1],q=points[k],x0=p.x*edge,y0=p.y*edge,dx=(q.x-p.x)*edge,dy=(q.y-p.y)*edge,len=Math.hypot(dx,dy);if(len<1e-12)continue;
   const nx=dy/len,ny=-dx/len,steps=Math.max(1,Math.ceil(len*2));
   for(let j=0;j<steps;j++){const t=(j+.5)/steps,left=p.left.map((v,c)=>v*(1-t)+q.left[c]*t),right=p.right.map((v,c)=>v*(1-t)+q.right[c]*t);source(x0+t*dx+distance*nx,y0+t*dy+distance*ny,left,id,1);source(x0+t*dx-distance*nx,y0+t*dy-distance*ny,right,id,-1);}
   if(Math.abs(dy)>1e-12){
    for(let y=Math.max(0,Math.ceil(Math.min(y0,y0+dy)-.5));y<=Math.min(h-1,Math.floor(Math.max(y0,y0+dy)-.5));y++){
     const t=(y+.5-y0)/dy;if(t<0||t>=1)continue;const x=x0+t*dx,ix=Math.floor(x-.5);if(ix<0||ix>=w-1)continue;const i=y*w+ix;jxCount[i]++;
     for(let c=0;c<3;c++)gx[i*3+c]+=((p.left[c]-p.right[c])*(1-t)+(q.left[c]-q.right[c])*t)*Math.sign(dy);
    }
   }
   if(Math.abs(dx)>1e-12){
    for(let x=Math.max(0,Math.ceil(Math.min(x0,x0+dx)-.5));x<=Math.min(w-1,Math.floor(Math.max(x0,x0+dx)-.5));x++){
     const t=(x+.5-x0)/dx;if(t<0||t>=1)continue;const y=y0+t*dy,iy=Math.floor(y-.5);if(iy<0||iy>=h-1)continue;const i=iy*w+x;jyCount[i]++;
     for(let c=0;c<3;c++)gy[i*3+c]+=((p.left[c]-p.right[c])*(1-t)+(q.left[c]-q.right[c])*t)*-Math.sign(dx);
    }
   }
  }
 }
 for(let i=0;i<w*h;i++)if(fixed[i]===1)for(let c=0;c<3;c++)colors[i*3+c]/=counts[i];else fixed[i]=0;
 // Several distinct crossings on the same graph edge cannot be resolved by
 // this lattice. Sum their signed jumps; keep the count for diagnostics.
 return {w,h,fixed,colors,gx,gy,jxCount,jyCount};
}

export function solveCurvePoisson(grid,mean=[.5,.5,.5],initial=null,{iterations=1600,tolerance=1e-7}={}){
 const {w,h,fixed,colors,gx,gy}=grid,n=w*h,degree=new Uint8Array(n),rgb=new Float64Array(n*3),diagnostics=[];
 if(!fixed.some(v=>v)){fixed[0]=1;for(let c=0;c<3;c++)colors[c]=mean[c];}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)degree[y*w+x]=(x>0)+(x+1<w)+(y>0)+(y+1<h);
 function multiply(v,out){for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(fixed[i]){out[i]=0;continue;}let s=degree[i]*v[i];if(x&& !fixed[i-1])s-=v[i-1];if(x+1<w&&!fixed[i+1])s-=v[i+1];if(y&&!fixed[i-w])s-=v[i-w];if(y+1<h&&!fixed[i+w])s-=v[i+w];out[i]=s;}}
 for(let c=0;c<3;c++){
  const b=new Float64Array(n),u=b.slice(),r=b.slice(),z=b.slice(),p=b.slice(),ap=b.slice();let free=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x;if(fixed[i])continue;free++;let v=-(x+1<w?gx[i*3+c]:0)+(x?gx[(i-1)*3+c]:0)-(y+1<h?gy[i*3+c]:0)+(y?gy[(i-w)*3+c]:0);
   for(const j of [x?i-1:-1,x+1<w?i+1:-1,y?i-w:-1,y+1<h?i+w:-1])if(j>=0&&fixed[j])v+=colors[j*3+c];b[i]=v;u[i]=initial?initial[i*3+c]:mean[c];
  }
  multiply(u,ap);let rz=0,residual=0;
  for(let i=0;i<n;i++)if(!fixed[i]){r[i]=b[i]-ap[i];z[i]=r[i]/degree[i];p[i]=z[i];rz+=r[i]*z[i];residual+=r[i]*r[i];}
  let iteration=0;
  while(iteration<iterations&&residual>tolerance*tolerance*Math.max(1,free)){
   multiply(p,ap);let pap=0;for(let i=0;i<n;i++)pap+=p[i]*ap[i];if(pap<=1e-30)break;const alpha=rz/pap;let next=0;residual=0;
   for(let i=0;i<n;i++)if(!fixed[i]){u[i]+=alpha*p[i];r[i]-=alpha*ap[i];z[i]=r[i]/degree[i];next+=r[i]*z[i];residual+=r[i]*r[i];}
   const beta=next/rz;for(let i=0;i<n;i++)if(!fixed[i])p[i]=z[i]+beta*p[i];rz=next;iteration++;
  }
  // Recompute the actual equation residual; CG's recurrence is not evidence
  // that the final field satisfies the original equations.
  multiply(u,ap);residual=0;for(let i=0;i<n;i++)if(!fixed[i])residual+=(b[i]-ap[i])**2;
  const rmsResidual=Math.sqrt(residual/Math.max(1,free));
  for(let i=0;i<n;i++)rgb[i*3+c]=fixed[i]?colors[i*3+c]:u[i];diagnostics.push({iterations:iteration,rmsResidual,converged:rmsResidual<=tolerance*1.001});
 }
 return {rgb,w,h,diagnostics};
}

export function reconstructCurves(model,w,h,p={}){
 const edge=Math.min(CURVE_RENDER_EDGE,Math.max(w,h)),aspect=w/h,rw=Math.max(1,Math.round(edge*(aspect>=1?1:aspect))),rh=Math.max(1,Math.round(edge*(aspect>=1?1/aspect:1))),curves=editCurveColors(model.curves,p);
 let initial=null,coarseDiagnostics=null;
 if(edge>192){const scale=128/edge,cw=Math.max(1,Math.round(rw*scale)),ch=Math.max(1,Math.round(rh*scale)),coarse=solveCurvePoisson(rasterizeCurves(curves,cw,ch,model.edge),model.mean);initial=new Float64Array(rw*rh*3);for(let y=0;y<rh;y++)for(let x=0;x<rw;x++)for(let c=0;c<3;c++)initial[(y*rw+x)*3+c]=sample(coarse.rgb,cw,ch,(x+.5)*cw/rw-.5,(y+.5)*ch/rh-.5,c,3);coarseDiagnostics=coarse.diagnostics;}
 const grid=rasterizeCurves(curves,rw,rh,model.edge),solution=solveCurvePoisson(grid,model.mean,initial);return {...solution,grid,coarseDiagnostics};
}

export function renderCurveImage(a,w,h,solution,{soften=0}={}){
 const out=new Uint8ClampedArray(a.length);
 const sigma=soften/100*3*Math.max(1,Math.max(solution.w,solution.h)/CURVE_ANALYSIS_EDGE),rgb=sigma>.01?gaussian(solution.rgb,solution.w,solution.h,sigma):solution.rgb;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;for(let c=0;c<3;c++)out[i+c]=255*sample(rgb,solution.w,solution.h,(x+.5)*solution.w/w-.5,(y+.5)*solution.h/h-.5,c,3);out[i+3]=255;}return out;
}

let cached=null;
const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
export function prepareDiffusionCurves(a,w,h,p){
 const guide=curveGuide(a,w,h),key=[p.detail??55,p.length??15,p.smooth??35].join('/');
 if(!cached||cached.key!==key||cached.guide.w!==guide.w||cached.guide.h!==guide.h||!same(cached.guide.rgb,guide.rgb))cached={key,guide,model:extractCurves(guide,p),solutions:new Map()};
 const model=cached.model,edge=Math.min(CURVE_RENDER_EDGE,Math.max(w,h)),aspect=w/h,solutionKey=[edge,aspect,p.jump??100,p.paper??0].join('/');
 if(!cached.solutions.has(solutionKey)){
  const solution=reconstructCurves(model,w,h,p);if(cached.solutions.size>=3)cached.solutions.delete(cached.solutions.keys().next().value);cached.solutions.set(solutionKey,solution);
 }
 return {model,solution:cached.solutions.get(solutionKey)};
}
export function diffusionCurves(a,w,h,p){return renderCurveImage(a,w,h,prepareDiffusionCurves(a,w,h,p).solution,p);}
