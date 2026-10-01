import {clamp,hash,sample} from './pixels.js';
import {grid,blur,at} from './research-math.js';
// Kalinov et al. 2026, Algorithm 1. J=du/dx, hence inverse metric = J J^T.
export function metricStretch(j,vx,vy){return Math.hypot(j[0]*vx+j[2]*vy,j[1]*vx+j[3]*vy);}
export function rescaledNoise(u,v,j,{frequency=35,octaves=2,directions=8,seed=17}={}){
 const lo=frequency/2,hi=lo*2**octaves;let sum=0,energy=0;
 for(let d=0;d<directions;d++){
  const theta=Math.PI*d/directions,vx=Math.cos(theta),vy=Math.sin(theta),z=Math.max(.08,metricStretch(j,vx,vy));
  const r0=Math.ceil(Math.log2(lo/z)),r1=Math.floor(Math.log2(hi/z));
  for(let r=r0;r<=r1;r++){const k=2**r,f=k*z,t=Math.log2(f/lo)/octaves,weight=Math.sin(Math.PI*t)**2,phase=hash(d,r+100,seed)*Math.PI*2;sum+=weight*Math.cos(Math.PI*2*k*(vx*u+vy*v)+phase);energy+=weight*weight;}
 }return sum/Math.sqrt(Math.max(.01,energy));
}
export function metametric(a,w,h,p){
 const g=grid(a,w,h,320),W=g.w,H=g.h,N=W*H,span=Math.max(W,H),photo=blur(g.l,W,H,4),U=new Float32Array(N),V=U.slice(),noise=U.slice();
 const centers=Array.from({length:p.anchors},(_,i)=>({x:hash(i,31,p.seed)*W/span,y:hash(i,35,p.seed)*H/span,sign:hash(i,39,p.seed)>.5?1:-1}));
 const warp=(x,y)=>{let u=x,v=y;for(const c of centers){const dx=x-c.x,dy=y-c.y,r2=dx*dx+dy*dy,t=c.sign*p.pull/60*Math.exp(-r2*18),cs=Math.cos(t),sn=Math.sin(t);u+=(cs-1)*dx-sn*dy;v+=sn*dx+(cs-1)*dy;}const l=at(photo,W,H,x*span,y*span)-.5;return [u+l*p.follow/350,v-l*p.follow/520];};
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,q=warp(x/span,y/span);U[i]=q[0];V[i]=q[1];}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,x0=Math.max(0,x-1),x1=Math.min(W-1,x+1),y0=Math.max(0,y-1),y1=Math.min(H-1,y+1),dx=span/Math.max(1,x1-x0),dy=span/Math.max(1,y1-y0);
  const j=[(U[y*W+x1]-U[y*W+x0])*dx,(U[y1*W+x]-U[y0*W+x])*dy,(V[y*W+x1]-V[y*W+x0])*dx,(V[y1*W+x]-V[y0*W+x])*dy];
  noise[i]=rescaledNoise(U[i],V[i],j,{frequency:p.frequency,octaves:2,directions:8,seed:p.seed});
 }
 const out=new Uint8ClampedArray(a.length),la=p.light*Math.PI/180;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=(x+.5)*W/w-.5,Y=(y+.5)*H/h-.5,i=(y*w+x)*4,n=at(noise,W,H,X,Y),u=at(U,W,H,X,Y)*span/W*w,v=at(V,W,H,X,Y)*span/H*h;
  const slope=(at(noise,W,H,X+1,Y)-at(noise,W,H,X-1,Y))*Math.cos(la)+(at(noise,W,H,X,Y+1)-at(noise,W,H,X,Y-1))*Math.sin(la),l=at(photo,W,H,X,Y),edge=clamp((n-(.5-l)*p.cut/35)*p.sharpness/25+.5,0,1),shade=1+slope*p.relief/100;
  for(let c=0;c<3;c++){const col=sample(a,w,h,u,v,c),ink=col*shade,base=p.paper*2.55;out[i+c]=base*(1-edge)+ink*edge;}out[i+3]=255;
 }return out;
}
