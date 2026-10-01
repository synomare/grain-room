import {grid,at,blur,expand} from './research-math.js';
import {clamp} from './pixels.js';
import {noise} from './material-effects.js';

// Minimize ||D u - g||² + lambda ||u - anchor||², with only in-domain edges.
export function screenedPoisson(gx,gy,anchor,w,h,lambda=.025,iterations=180,tolerance=1e-7){
 const n=w*h,b=Float64Array.from(anchor,v=>v*lambda),x=Float64Array.from(anchor);
 for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++){const i=y*w+xx;if(xx+1<w){b[i]-=gx[i];b[i+1]+=gx[i];}if(y+1<h){b[i]-=gy[i];b[i+w]+=gy[i];}}
 const apply=(a,out)=>{for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++){const i=y*w+xx;let v=lambda*a[i];if(xx>0)v+=a[i]-a[i-1];if(xx+1<w)v+=a[i]-a[i+1];if(y>0)v+=a[i]-a[i-w];if(y+1<h)v+=a[i]-a[i+w];out[i]=v;}};
 const ax=new Float64Array(n);apply(x,ax);const r=Float64Array.from(b,(v,i)=>v-ax[i]),direction=r.slice(),ad=new Float64Array(n),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 let rr=dot(r,r);const initial=rr;
 for(let k=0;k<iterations&&rr>Math.max(1e-20,initial*tolerance*tolerance);k++){
  apply(direction,ad);const den=dot(direction,ad);if(den<=1e-25)break;const alpha=rr/den;
  for(let i=0;i<n;i++){x[i]+=alpha*direction[i];r[i]-=alpha*ad[i];}
  const next=dot(r,r),beta=next/rr;for(let i=0;i<n;i++)direction[i]=r[i]+beta*direction[i];rr=next;
 }return x;
}
export function gradientcast(a,w,h,p){
 if(!p.amount)return a.slice();const g=grid(a,w,h,480),W=g.w,H=g.h,n=W*H,base=blur(blur(g.l,W,H,2),W,H,2),gx=new Float32Array(n),gy=gx.slice();
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,dx=x+1<W?base[i+1]-base[i]:0,dy=y+1<H?base[i+W]-base[i]:0,mag=Math.hypot(dx,dy),boost=1+p.detail/100*Math.min(3,.04/(mag+.015)),angle=(noise(x/W*4,y/H*4,p.seed)-.5)*p.turn/100*Math.PI*3,co=Math.cos(angle),si=Math.sin(angle);
  gx[i]=(co*dx-si*dy)*boost;gy[i]=(si*dx+co*dy)*boost;
 }
 const height=blur(screenedPoisson(gx,gy,base,W,H),W,H,1),out=g.rgb.map(()=>new Float32Array(n)),angle=p.light*Math.PI/180,lx=Math.cos(angle)*.65,ly=Math.sin(angle)*.65;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,nx=(at(height,W,H,x-1,y)-at(height,W,H,x+1,y))*p.relief,ny=(at(height,W,H,x,y-1)-at(height,W,H,x,y+1))*p.relief,len=Math.hypot(nx,ny,1),light=Math.max(0,(nx*lx+ny*ly+.76)/len),spec=Math.max(0,(nx*lx*.5+ny*ly*.5+.95)/len)**22;
  const v=height[i],fold=.5+.5*Math.cos(v*13+noise(x/W*3,y/H*3,p.seed)*2),amount=p.amount/100;
  for(let c=0;c<3;c++){const metal=(.14+g.rgb[c][i]*.72)*(.3+light*.85)+spec*.65+fold*.075;out[c][i]=clamp(g.rgb[c][i]*(1-amount)+metal*amount,0,1);}
 }return expand(out,W,H,w,h);
}
