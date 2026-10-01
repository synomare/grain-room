// SPDX-License-Identifier: MIT
// Brush matrix and adaptive midpoint ported from MixwellBrush.glsl.
// Copyright (c) 2026 Doug L. James and Ethan James.
// See public/licenses/Mixwell-MIT.txt. Photo placement and rendering are original.
import {hash,clamp,sample} from './pixels.js';
import {grid,at,tensor} from './research-math.js';
import {mirror} from './field-marbling.js';

export function brushVelocity(x,y,radius,ux,uy){
 const r2=x*x+y*y,e2=radius*radius,s=r2+e2,invD=1/(s*Math.sqrt(s)),invR=1/Math.sqrt(Math.max(r2,1e-20)),r=r2*invR;
 const A=1-r*(r2+2*e2)*invD,B=e2*invR*invD,dot=x*ux+y*uy;
 return [A*ux+B*x*dot,A*uy+B*y*dot];
}
export function brushReverse(x,y,radius,ax,ay,bx,by,step=.1){
 const vx=ax-bx,vy=ay-by,L=Math.hypot(vx,vy);if(L<1e-12||radius<=0)return [x,y];
 const ux=vx/L,uy=vy/L;let left=L;
 while(left>1e-10){
  const rx=x-bx,ry=y-by,d=Math.min(left,step*Math.max(radius,Math.hypot(rx,ry))),dx=d*ux,dy=d*uy;
  const one=brushVelocity(rx,ry,radius,dx,dy),mid=brushVelocity(rx+.5*(one[0]-dx),ry+.5*(one[1]-dy),radius,dx,dy);
  x+=mid[0];y+=mid[1];bx+=dx;by+=dy;left-=d;
 }
 return [x,y];
}
export function sharpflow(a,w,h,p){
 if(p.length===0||p.radius===0||p.strokes===0)return a.slice();
 const edge=Math.max(w,h),g=grid(a,w,h,160),t=tensor(g,3),strokes=[];
 for(let k=0;k<p.strokes;k++){
  let x=0,y=0,best=-1;
  for(let n=0;n<6;n++){const X=(.1+.8*hash(k,n*2,p.seed))*w,Y=(.1+.8*hash(k,n*2+1,p.seed))*h,l=at(g.l,g.w,g.h,X/w*g.w,Y/h*g.h);if(l>best){best=l;x=X;y=Y;}}
  const angle=p.angle*Math.PI/180+at(t.angle,g.w,g.h,x/w*g.w,y/h*g.h)*p.follow/100,length=p.length/1000*edge*(.5+.8*hash(k,16,p.seed));
  const c=Math.cos(angle),s=Math.sin(angle),radius=p.radius/1000*edge*(.6+.6*hash(k,17,p.seed));
  strokes.push({ax:x-c*length*.5,ay:y-s*length*.5,bx:x+c*length*.5,by:y+s*length*.5,radius});
 }
 // Dense coordinates, sampled once from the original at the requested output size.
 const scale=Math.min(1,720/edge),W=Math.max(2,Math.round(w*scale)),H=Math.max(2,Math.round(h*scale)),U=new Float32Array(W*H),V=new Float32Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  let u=x/(W-1)*Math.max(0,w-1),v=y/(H-1)*Math.max(0,h-1);
  for(let k=strokes.length-1;k>=0;k--){
   const s=strokes[k],dx=s.bx-s.ax,dy=s.by-s.ay,q=clamp(((u-s.ax)*dx+(v-s.ay)*dy)/(dx*dx+dy*dy),0,1),d=Math.hypot(u-s.ax-q*dx,v-s.ay-q*dy),max=s.radius*10;
   if(d>=max)continue;const fade=clamp((d/max-.5)*2,0,1),weight=1-fade*fade*(3-2*fade),next=brushReverse(u,v,s.radius,s.ax,s.ay,s.bx,s.by);
   u+=(next[0]-u)*weight;v+=(next[1]-v)*weight;
  }U[y*W+x]=u;V[y*W+x]=v;
 }
 const out=new Uint8ClampedArray(a.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=x/Math.max(1,w-1)*(W-1),Y=y/Math.max(1,h-1)*(H-1),u=mirror(at(U,W,H,X,Y),w),v=mirror(at(V,W,H,X,Y),h),i=(y*w+x)*4;
  const ux=at(U,W,H,Math.min(W-1,X+1),Y)-at(U,W,H,Math.max(0,X-1),Y),uy=at(U,W,H,X,Math.min(H-1,Y+1))-at(U,W,H,X,Math.max(0,Y-1));
  const vx=at(V,W,H,Math.min(W-1,X+1),Y)-at(V,W,H,Math.max(0,X-1),Y),vy=at(V,W,H,X,Math.min(H-1,Y+1))-at(V,W,H,X,Math.max(0,Y-1));
  if(Math.max(Math.hypot(ux,vx),Math.hypot(uy,vy))*scale>3){
   const sum=[0,0,0];
   for(const dx of [-.25,.25])for(const dy of [-.25,.25]){
    const sx=mirror(at(U,W,H,X+dx*scale,Y+dy*scale),w),sy=mirror(at(V,W,H,X+dx*scale,Y+dy*scale),h);
    for(let c=0;c<3;c++)sum[c]+=sample(a,w,h,sx,sy,c);
   }for(let c=0;c<3;c++)out[i+c]=sum[c]/4;
  }else for(let c=0;c<3;c++)out[i+c]=sample(a,w,h,u,v,c);out[i+3]=255;
 }
 return out;
}
