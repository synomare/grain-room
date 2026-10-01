import {fft2} from './research-spectral.js';
import {latticeSymbols} from './emergent-phase.js';
import {grid,at,blur} from './research-math.js';
import {hash,clamp,sample} from './pixels.js';

// Semi-implicit 2D Swift-Hohenberg with spatial growth and cubic damping.
// Eq.1.1 in Kamphuis & Chirilus-Bruckner 2025 is 1D; the photo forcing is our extension.
export function evolveResonance(initial,w,h,{steps=80,k0=.7,dt=.35,growth=.35,forcing=null,damping=null,symbols=latticeSymbols(w,h)}={}){
 const n=w*h,u=Float64Array.from(initial),r=new Float64Array(n),im=new Float64Array(n);
 for(let t=0;t<steps;t++){
  for(let i=0;i<n;i++){const value=u[i],p=forcing?forcing[i]:growth,rho=damping?damping[i]:1;r[i]=value+dt*(p*value-rho*value**3);im[i]=0;}
  fft2(r,im,w,h);for(let i=0;i<n;i++){const d=1+dt*(k0*k0-symbols[i])**2;r[i]/=d;im[i]/=d;}fft2(r,im,w,h,true);u.set(r);
 }
 if(!u.every(Number.isFinite))throw new Error('共鳴の計算が不安定になりました。');return u;
}
export function resonant(a,w,h,p){
 if(p.time===0)return a.slice();
 const W=2**Math.max(2,Math.round(Math.log2(256*w/Math.max(w,h)))),H=2**Math.max(2,Math.round(Math.log2(256*h/Math.max(w,h)))),n=W*H,g=grid(a,w,h,256),photo=blur(g.l,g.w,g.h,2),u=new Float64Array(n),forcing=new Float64Array(n),theta=p.angle*Math.PI/180,k0=.28+p.frequency/65;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,l=at(photo,g.w,g.h,(x+.5)*g.w/W-.5,(y+.5)*g.h/H-.5);
  u[i]=(l-.5)*.15+(hash(x,y,p.seed)-.5)*.12;
  forcing[i]=.12+p.growth/180+(l-.45)*p.memory/95+p.lock/150*Math.cos((x*Math.cos(theta)+y*Math.sin(theta))*k0*p.resonance/100);
 }
 const field=evolveResonance(u,W,H,{steps:p.time,k0,forcing,symbols:latticeSymbols(W,H,1+p.stretch/30,theta,0)}),out=new Uint8ClampedArray(a.length),sharp=3+p.edge/8;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=(x+.5)*W/w-.5,Y=(y+.5)*H/h-.5,v=at(field,W,H,X,Y),gx=(at(field,W,H,X+1,Y)-at(field,W,H,X-1,Y))/2,gy=(at(field,W,H,X,Y+1)-at(field,W,H,X,Y-1))/2,mask=clamp((v+p.balance/150)*sharp,0,1),nx=-gx*6,ny=-gy*6,dot=Math.max(0,(nx*-.5+ny*-.5+.707)/Math.hypot(nx,ny,1)),shade=1-p.relief/100+p.relief/100*(.25+dot),ix=(y*w+x)*4;
  for(let c=0;c<3;c++){const color=sample(a,w,h,x+gx*p.shift/100*w/W*15,y+gy*p.shift/100*h/H*15,c);out[ix+c]=(color*mask+p.paper*2.55*(1-mask))*shade;}out[ix+3]=255;
 }return out;
}
