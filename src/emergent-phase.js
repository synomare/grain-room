import {fft2} from './research-spectral.js';
import {grid,at,blur} from './research-math.js';
import {clamp,hash,sample} from './pixels.js';

export function latticeSymbols(w,h,stretch=1,angle=0,shear=0){
 const out=new Float64Array(w*h),ca=Math.cos(angle),sa=Math.sin(angle);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  // Suppressing cross terms on Nyquist axes retains conjugate symmetry.
  const kx=2*Math.PI*(x<=w/2?x:x-w)/w,ky=2*Math.PI*(y<=h/2?y:y-h)/h;
  const cross=x===w/2||y===h/2?0:kx*ky;
  const gxx=ca*ca*stretch+sa*sa/stretch,gyy=sa*sa*stretch+ca*ca/stretch,gxy=ca*sa*(stretch-1/stretch);
  out[y*w+x]=gxx*kx*kx+2*(gxy+shear*gxx)*cross+(gyy+2*shear*gxy+shear*shear*gxx)*ky*ky;
 }return out;
}
// Conserved, stabilized semi-implicit Cahn-Hilliard evolution on a periodic lattice.
// The image forcing and visual material are original; this does not implement PF-FLIP.
export function evolvePhase(initial,w,h,{steps=80,epsilon=1,dt=1,quadratic=0,symbols=latticeSymbols(w,h),forcing=null}={}){
 const n=w*h,u=Float64Array.from(initial),ur=new Float64Array(n),ui=new Float64Array(n),nr=new Float64Array(n),ni=new Float64Array(n),S=3,mean=u.reduce((a,b)=>a+b,0)/n;
 for(let step=0;step<steps;step++){
  for(let i=0;i<n;i++){ur[i]=u[i];ui[i]=0;nr[i]=u[i]**3+quadratic*u[i]*u[i]-(1+S)*u[i]-(forcing?.[i]||0);ni[i]=0;}
  fft2(ur,ui,w,h);fft2(nr,ni,w,h);
  for(let i=0;i<n;i++){const k=symbols[i],den=1+dt*k*(S+epsilon*epsilon*k);ur[i]=(ur[i]-dt*k*nr[i])/den;ui[i]=(ui[i]-dt*k*ni[i])/den;}
  fft2(ur,ui,w,h,true);u.set(ur);
  if(!Number.isFinite(u[0]))throw new Error('相分離の計算が不安定になりました。');
 }
 // Remove accumulated floating-point drift only; no clipping or mass-changing reset.
 const error=u.reduce((a,b)=>a+b,0)/n-mean;for(let i=0;i<n;i++)u[i]-=error;return u;
}
export function phaseEnergy(u,w,h,epsilon=1){
 let E=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,dx=u[y*w+(x+1)%w]-u[i],dy=u[((y+1)%h)*w+x]-u[i];E+=(u[i]*u[i]-1)**2/4+epsilon*epsilon*(dx*dx+dy*dy)/2;}return E;
}
export function spinodal(a,w,h,p){
 if(p.age===0)return a.slice();
 const target=128,W=2**Math.max(2,Math.round(Math.log2(Math.max(4,target*w/Math.max(w,h))))),H=2**Math.max(2,Math.round(Math.log2(Math.max(4,target*h/Math.max(w,h))))),n=W*H;
 const initial=new Float64Array(n),forcing=new Float64Array(n),field=new Float32Array(n);
 let mean=0;for(let y=0;y<H;y++)for(let x=0;x<W;x++){const X=(x+.5)*w/W-.5,Y=(y+.5)*h/H-.5,i=y*W+x;field[i]=(.2126*sample(a,w,h,X,Y,0)+.7152*sample(a,w,h,X,Y,1)+.0722*sample(a,w,h,X,Y,2))/255;mean+=field[i];}mean/=n;
 const image=blur(field,W,H,1),colorGrid=grid(a,w,h,128),colors=colorGrid.rgb.map(v=>blur(v,colorGrid.w,colorGrid.h,3));
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,photo=image[i]-mean;initial[i]=p.balance/100+photo*p.memory/110+(hash(x,y,p.seed)-.5)*.22;forcing[i]=photo*p.memory/200;}
 const symbols=latticeSymbols(W,H,1+p.stretch/28,p.angle*Math.PI/180,p.shear/100),u=evolvePhase(initial,W,H,{steps:p.age,epsilon:p.scale/35,dt:1,quadratic:0,symbols,forcing}),out=new Uint8ClampedArray(a.length);
 const lx=-.5,ly=-.6,lz=.62,sharp=4+p.edge/8;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,X=(x+.5)*W/w-.5,Y=(y+.5)*H/h-.5,v=at(u,W,H,X,Y),blend=.5+.5*Math.tanh(v*sharp),gx=(at(u,W,H,X+1,Y)-at(u,W,H,X-1,Y))*.5,gy=(at(u,W,H,X,Y+1)-at(u,W,H,X,Y-1))*.5;
  const nx=-gx*7,ny=-gy*7,len=Math.hypot(nx,ny,1),dot=Math.max(0,(nx*lx+ny*ly+lz)/len),spec=Math.max(0,(nx*-.28+ny*-.34+.9)/len)**36,relief=p.relief/100,seam=Math.exp(-v*v*45),shade=(1-relief)+relief*(.32+dot*.85);
  const dx=gx*p.displace/100*w/W*8,dy=gy*p.displace/100*h/H*8;
  for(let c=0;c<3;c++){const literal=sample(a,w,h,x+dx,y+dy,c)/255,abstract=at(colors[c],colorGrid.w,colorGrid.h,(x+dx+.5)*colorGrid.w/w-.5,(y+dy+.5)*colorGrid.h/h-.5),ink=literal*p.texture/100+abstract*(1-p.texture/100),paper=p.paper/100,base=ink*blend+paper*(1-blend);out[i+c]=255*(base*shade*(1-seam*relief*.45)+spec*relief*.4*(.15+seam));}out[i+3]=255;
 }return out;
}
