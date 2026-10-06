import Delaunator from 'delaunator';
import {clamp,hash} from './pixels.js';
export const dotDefaults={size:3.2,iterations:16,tolerance:60,power:110,detail:50,spread:115,hollow:0,jitter:65,mode:0,paper:100,photo:0,amount:100};
// Pixel coordinates; sub-nanopixel rounding keeps coincident generators unique.
export function dotUnique(points,w,h){const seen=new Set(),out=[];for(const p of points){const x=Math.round(clamp(p[0],0,w)*1e9)/1e9,y=Math.round(clamp(p[1],0,h)*1e9)/1e9,key=x+','+y;if(!seen.has(key)){seen.add(key);out.push([x,y]);}}return out;}
export function dotClip(poly,nx,ny,mx,my){const out=[];for(let k=0;k<poly.length;k++){const a=poly[k],b=poly[(k+1)%poly.length],da=nx*(a[0]-mx)+ny*(a[1]-my),db=nx*(b[0]-mx)+ny*(b[1]-my),inside=da<=0;if(inside)out.push(a);if(inside!==(db<=0)){const q=da/(da-db);out.push([a[0]+q*(b[0]-a[0]),a[1]+q*(b[1]-a[1])]);}}return out;}
export function dotCells(input,w,h){
 const points=dotUnique(input,w,h),n=points.length,sets=Array.from({length:n},()=>new Set());
 if(n>1){
  const mesh=Delaunator.from(points);
  for(let k=0;k<mesh.triangles.length;k+=3)for(let e=0;e<3;e++){const i=mesh.triangles[k+e],j=mesh.triangles[k+(e+1)%3];sets[i].add(j);sets[j].add(i);}
  if(!mesh.triangles.length){
   let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;for(const p of points){xmin=Math.min(xmin,p[0]);xmax=Math.max(xmax,p[0]);ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]);}
   const axis=xmax-xmin>=ymax-ymin?0:1,ids=points.map((_,i)=>i).sort((a,b)=>points[a][axis]-points[b][axis]||a-b);
   for(let k=1;k<n;k++){sets[ids[k]].add(ids[k-1]);sets[ids[k-1]].add(ids[k]);}
  }else{
   // A nearly collinear generator can be omitted by triangulation. Its planes
   // must constrain BOTH cells; a one-sided fallback double-counts pixels.
   const missing=sets.map((s,i)=>s.size?-1:i).filter(i=>i>=0);
   for(const i of missing)for(let j=0;j<n;j++)if(j!==i){sets[i].add(j);sets[j].add(i);}
  }
 }
 const neighbours=sets.map(s=>[...s].sort((a,b)=>a-b)),polygons=points.map((p,i)=>{let poly=[[0,0],[w,0],[w,h],[0,h]];for(const j of neighbours[i]){const q=points[j];poly=dotClip(poly,q[0]-p[0],q[1]-p[1],(p[0]+q[0])/2,(p[1]+q[1])/2);if(!poly.length)break;}return poly;});
 return{points,neighbours,polygons};
}
// Cocircular cells can meet at a vertex without sharing a Delaunay edge.
// Walk only equal-distance edges to find the globally lowest tied index.
function dotOwns(g,i,x,y){const p=g.points[i],d=(x-p[0])**2+(y-p[1])**2;let ties=null;for(const j of g.neighbours[i]){const q=g.points[j],dd=(x-q[0])**2+(y-q[1])**2;if(dd<d||(dd===d&&j<i))return false;if(dd===d)(ties??=[]).push(j);}if(ties){const seen=new Set([i,...ties]);for(let k=0;k<ties.length;k++)for(const j of g.neighbours[ties[k]]){if(seen.has(j))continue;seen.add(j);const q=g.points[j],dd=(x-q[0])**2+(y-q[1])**2;if(dd<d||(dd===d&&j<i))return false;if(dd===d)ties.push(j);}}return true;}
export function dotRows(poly,w,h,visit){if(!poly.length)return;let low=Infinity,high=-Infinity;for(const p of poly){low=Math.min(low,p[1]);high=Math.max(high,p[1]);}for(let y=Math.max(0,Math.ceil(low-.5-1e-8));y<=Math.min(h-1,Math.floor(high-.5+1e-8));y++){const yy=y+.5;let left=Infinity,right=-Infinity;for(let k=0;k<poly.length;k++){const a=poly[k],b=poly[(k+1)%poly.length];if(a[1]===b[1]){if(Math.abs(yy-a[1])<1e-8){left=Math.min(left,a[0],b[0]);right=Math.max(right,a[0],b[0]);}}else if(yy>=Math.min(a[1],b[1])-1e-8&&yy<=Math.max(a[1],b[1])+1e-8){const x=a[0]+(yy-a[1])/(b[1]-a[1])*(b[0]-a[0]);left=Math.min(left,x);right=Math.max(right,x);}}if(left<=right)visit(y,Math.max(0,Math.ceil(left-.5-1e-8)),Math.min(w-1,Math.floor(right-.5+1e-8)));}}
export function dotSample(a,w,h,x,y,stride=1,c=0){x=clamp(x,0,w-1);y=clamp(y,0,h-1);const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1),fx=x-ix,fy=y-iy;return(a[(iy*w+ix)*stride+c]*(1-fx)+a[(iy*w+jx)*stride+c]*fx)*(1-fy)+(a[(jy*w+ix)*stride+c]*(1-fx)+a[(jy*w+jx)*stride+c]*fx)*fy;}
// Supersample the original density by bilinear interpolation, without a
// reduced guide image. Each quadrature point represents 1/sampling² pixels.
export function dotMoments(g,rho,luma,w,h,source=null,labels=null,sampling=1){
 const n=g.points.length,m=Object.fromEntries(['mass','area','x','y','xx','yy','xy','l','ll','r','green','b'].map(k=>[k,new Float64Array(n)])),area=1/(sampling*sampling);if(labels)labels.fill(-1);
 for(let j=0;j<n;j++){
  const polygon=sampling===1?g.polygons[j]:g.polygons[j].map(([x,y])=>[x*sampling,y*sampling]);
  dotRows(polygon,w*sampling,h*sampling,(y,left,right)=>{
   const yy=(y+.5)/sampling;
   while(left<=right&&!dotOwns(g,j,(left+.5)/sampling,yy))left++;while(right>=left&&!dotOwns(g,j,(right+.5)/sampling,yy))right--;
   for(let x=left;x<=right;x++){
    const i=y*w*sampling+x,xx=(x+.5)/sampling,v=(sampling===1?rho[i]:dotSample(rho,w,h,xx-.5,yy-.5))*area,l=sampling===1?luma[i]:dotSample(luma,w,h,xx-.5,yy-.5);
    m.area[j]+=area;m.mass[j]+=v;m.x[j]+=xx*v;m.y[j]+=yy*v;m.xx[j]+=xx*xx*v;m.yy[j]+=yy*yy*v;m.xy[j]+=xx*yy*v;m.l[j]+=l*v;m.ll[j]+=l*l*v;
    if(source){m.r[j]+=(sampling===1?source[i*4]:dotSample(source,w,h,xx-.5,yy-.5,4,0))*v;m.green[j]+=(sampling===1?source[i*4+1]:dotSample(source,w,h,xx-.5,yy-.5,4,1))*v;m.b[j]+=(sampling===1?source[i*4+2]:dotSample(source,w,h,xx-.5,yy-.5,4,2))*v;}
    if(labels){if(labels[i]!==-1)throw Error('Overlapping stipple cells');labels[i]=j;}
   }
  });
 }
 return m;
}
export function dotRadius(m,i,p,scale){const mass=m.mass[i];if(!mass)return p.size*scale;const variance=Math.max(0,m.ll[i]/mass-(m.l[i]/mass)**2);return p.size*scale*(1-.55*p.detail/100*clamp(Math.sqrt(variance)*6,0,1));}
export function dotAxis(poly){let sx=0,sy=0,xx=0,yy=0,xy=0;for(const p of poly){sx+=p[0];sy+=p[1];xx+=p[0]*p[0];yy+=p[1]*p[1];xy+=p[0]*p[1];}const n=Math.max(1,poly.length),angle=.5*Math.atan2(2*(xy/n-sx*sy/(n*n)),xx/n-(sx/n)**2-yy/n+(sy/n)**2);return[Math.cos(angle),Math.sin(angle)];}
export function dotStep(g,m,p,scale,step){const out=[],a=.2+.8*p.tolerance/100*(step/Math.max(1,p.iterations-1)),lower=1-a/2,upper=1+a/2;let split=0,removed=0,kept=0;for(let i=0;i<g.points.length;i++){const mass=m.mass[i],radius=dotRadius(m,i,p,scale),target=Math.PI*radius*radius*(1-(p.hollow/100)**2);if(mass<lower*target){removed++;continue;}const cx=m.x[i]/mass,cy=m.y[i]/mass;if(mass<upper*target){out.push([cx,cy]);kept++;continue;}const original=dotAxis(g.polygons[i]),angle=(hash(i,step+47,p.seed)-.5)*Math.PI*.75*p.jitter/100,co=Math.cos(angle),si=Math.sin(angle),axis=[original[0]*co-original[1]*si,original[0]*si+original[1]*co];let inside=Infinity;const poly=g.polygons[i];for(let k=0;k<poly.length;k++){const a=poly[k],b=poly[(k+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length)inside=Math.min(inside,Math.abs(dx*(cy-a[1])-dy*(cx-a[0]))/length);}const distance=Number.isFinite(inside)?inside*.5:radius*.5;out.push([cx-axis[0]*distance,cy-axis[1]*distance],[cx+axis[0]*distance,cy+axis[1]*distance]);split++;}return{points:out,split,removed,kept,lower,upper};}
export function dotField(source,w,h,p){const luma=new Float32Array(w*h),rho=new Float32Array(w*h);let mass=0,x=0,y=0;for(let i=0;i<luma.length;i++){const v=(source[i*4]*.2126+source[i*4+1]*.7152+source[i*4+2]*.0722)/255;luma[i]=v;rho[i]=Math.max(1e-4,(p.mode===2?v:1-v)**(p.power/100));mass+=rho[i];x+=(i%w+.5)*rho[i];y+=(Math.floor(i/w)+.5)*rho[i];}return{luma,rho,centroid:[x/mass,y/mass],mass};}
export function dotPlan(source,w,h,p){const field=dotField(source,w,h,p),scale=Math.max(w,h)/1000,count=Math.min(64,w*h);let points=Array.from({length:count},(_,i)=>[hash(i,19,p.seed)*w,hash(i,31,p.seed)*h]),trace=[];for(let k=0;k<p.iterations;k++){const g=dotCells(points,w,h),m=dotMoments(g,field.rho,field.luma,w,h,null,null,2),next=dotStep(g,m,p,scale,k);trace.push({count:g.points.length,split:next.split,removed:next.removed,kept:next.kept,lower:next.lower,upper:next.upper});points=next.points.length?next.points:[field.centroid];}const g=dotCells(points,w,h),m=dotMoments(g,field.rho,field.luma,w,h,source,null,2),dots=g.points.map((point,i)=>({point,radius:dotRadius(m,i,p,scale),colour:m.mass[i]?[m.r[i]/m.mass[i],m.green[i]/m.mass[i],m.b[i]/m.mass[i]]:[255,255,255],mass:m.mass[i],area:m.area[i],mean:m.mass[i]?m.l[i]/m.mass[i]:1}));return{dots,trace,field,g,m};}
function dotQuadrant(x,y,r){x=Math.min(r,Math.abs(x));y=Math.min(r,Math.abs(y));if(!x||!y)return 0;if(x*x+y*y<=r*r)return x*y;const split=Math.sqrt(Math.max(0,r*r-y*y)),base=y*Math.min(x,split);if(x<=split)return base;const primitive=u=>.5*(u*Math.sqrt(Math.max(0,r*r-u*u))+r*r*Math.asin(clamp(u/r,0,1)));return base+primitive(x)-primitive(split);}
function dotPrimitive(x,y,r){return Math.sign(x)*Math.sign(y)*dotQuadrant(x,y,r);}
export function dotCoverage(cx,cy,r,x,y){if(r<=0)return 0;const dx=Math.max(Math.abs(x+.5-cx)-.5,0),dy=Math.max(Math.abs(y+.5-cy)-.5,0);if(dx*dx+dy*dy>=r*r)return 0;const farX=Math.abs(x+.5-cx)+.5,farY=Math.abs(y+.5-cy)+.5;if(farX*farX+farY*farY<=r*r)return 1;return clamp(dotPrimitive(x+1-cx,y+1-cy,r)-dotPrimitive(x-cx,y+1-cy,r)-dotPrimitive(x+1-cx,y-cy,r)+dotPrimitive(x-cx,y-cy,r),0,1);}
export function dotDraw(source,w,h,dots,p){const n=w*h,rgb=new Float32Array(n*3),base=p.paper/100*255,photo=p.photo/100;for(let i=0;i<n;i++)for(let c=0;c<3;c++)rgb[i*3+c]=base*(1-photo)+source[i*4+c]*photo;for(const dot of dots){if(!dot.mass||!dot.area||(p.mode===2?dot.mean<.0002:dot.mean>.9998))continue;const[cx,cy]=dot.point,r=dot.radius*p.spread/100,inner=r*p.hollow/100,colour=p.mode===1?[0,0,0]:dot.colour;for(let y=Math.max(0,Math.floor(cy-r));y<=Math.min(h-1,Math.ceil(cy+r)-1);y++)for(let x=Math.max(0,Math.floor(cx-r));x<=Math.min(w-1,Math.ceil(cx+r)-1);x++){const coverage=dotCoverage(cx,cy,r,x,y)-(inner?dotCoverage(cx,cy,inner,x,y):0);if(coverage<=0)continue;const i=(y*w+x)*3;for(let c=0;c<3;c++)rgb[i+c]+=coverage*(colour[c]-rgb[i+c]);}}const out=new Uint8ClampedArray(source.length),amount=p.amount/100;for(let i=0;i<n;i++){for(let c=0;c<3;c++)out[i*4+c]=source[i*4+c]+amount*(rgb[i*3+c]-source[i*4+c]);out[i*4+3]=255;}return out;}
export function lbgDots(source,w,h,p=dotDefaults){if(!p.amount)return source.slice();return dotDraw(source,w,h,dotPlan(source,w,h,p).dots,p);}
