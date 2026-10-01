import {hash,clamp,sample} from './pixels.js';
import {grid,tensor,at,expand} from './research-math.js';
// Covariance is factored as R diag(sx²,sy²) Rᵀ: always positive definite.
// Local source-color fitting is intentionally separate from spatial art edits.
export function splats(a,w,h,p,textured=false){
 const source=grid(a,w,h,384),t=tensor(source,3),long=Math.max(w,h),s=long/1000,step=Math.max(1,p.size*s*.7),points=[];
 const cols=Math.ceil(w/step),rows=Math.ceil(h/step);
 for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
  const x=clamp((gx+.5+(hash(gx,gy,p.seed)-.5)*.85)*step,0,w-1),y=clamp((gy+.5+(hash(gx,gy,p.seed+1)-.5)*.85)*step,0,h-1),fx=x*source.w/w,fy=y*source.h/h,coherence=at(t.coherence,source.w,source.h,fx,fy);
  const angle=at(t.angle,source.w,source.h,fx,fy)+(textured?(hash(gx,gy,p.seed+3)-.5)*p.twist/100*Math.PI:0);
  const color=source.rgb.map(channel=>at(channel,source.w,source.h,fx,fy));
  // Two-radius local fit retains edges rather than bleeding one constant tint.
  for(let c=0;c<3;c++){let sum=color[c]*2;for(let k=0;k<4;k++)sum+=at(source.rgb[c],source.w,source.h,fx+Math.cos(k*Math.PI/2)*p.size*.06,fy+Math.sin(k*Math.PI/2)*p.size*.06);color[c]=sum/6;}
  points.push({x,y,angle,color,coherence,random:hash(gx,gy,p.seed+4),side:hash(gx,gy,p.seed+5)-.5});
 }
 const factor=Math.min(1,1400/long),rw=Math.max(1,Math.round(w*factor)),rh=Math.max(1,Math.round(h*factor)),n=rw*rh,acc=[0,1,2].map(()=>new Float32Array(n)),weights=new Float32Array(n);
 for(const point of points){
  const {x,y,angle,color,coherence,random,side}=point,co=Math.cos(angle),si=Math.sin(angle);
  const stretch=1+p.stretch/100*(textured?3:4)*(.35+coherence*.65),sx=p.size*s*.48*stretch*factor,sy=p.size*s*.42/Math.sqrt(stretch)*factor;
  const displacement=p.scatter*s*(random-.5)*factor,cx=x*factor+co*displacement-si*side*displacement*.7,cy=y*factor+si*displacement+co*side*displacement*.7;
  const reach=Math.hypot(sx,sy)*2.4,x0=Math.max(0,Math.floor(cx-reach)),x1=Math.min(rw-1,Math.ceil(cx+reach)),y0=Math.max(0,Math.floor(cy-reach)),y1=Math.min(rh-1,Math.ceil(cy+reach));
  for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){
   const dx=xx-cx,dy=yy-cy,u=(dx*co+dy*si)/sx,v=(-dx*si+dy*co)/sy,d=u*u+v*v;
   if(d>5.76||(textured&&(Math.abs(u)>1.5||Math.abs(v)>1)))continue;
   let weight=Math.exp(-d*1.7);
   if(textured)weight=Math.min(1,(1-Math.abs(v))*18,(1.5-Math.abs(u))*18)*.9;
   const i=yy*rw+xx;weights[i]+=weight;
   for(let c=0;c<3;c++){
    const col=textured?sample(a,w,h,x+u*p.size*s*.48,y+v*p.size*s*.48,c)/255:color[c];
    acc[c][i]+=col*weight;
   }
  }
 }
 const out=acc.map(()=>new Float32Array(n));
 for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
  const i=y*rw+x,weight=weights[i],coverage=1-Math.exp(-weight*(textured?4.5:3.4)),bloom=textured?0:p.glow/100;
  for(let c=0;c<3;c++){
   const color=acc[c][i]/Math.max(.00001,weight);
   out[c][i]=color*coverage*(1+bloom*.6)+Math.pow(Math.max(0,color),2)*Math.max(0,weight-1)*bloom*.15;
  }
 }return expand(out,rw,rh,w,h);
}
