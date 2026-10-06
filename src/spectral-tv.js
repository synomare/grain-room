import {sample} from './pixels.js';

export const TV_GUIDE_EDGE=160;
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const PAPER=[.96,.94,.9],POSITIVE=[.8,.14,.3],NEGATIVE=[.05,.44,.47];

export function totalVariation(u,w,h){
 let tv=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,dx=x+1<w?u[i+1]-u[i]:0,dy=y+1<h?u[i+w]-u[i]:0;tv+=Math.sqrt(dx*dx+dy*dy);}return tv;
}
// Isotropic forward differences, zero outward flux; divergence = -D transpose.
function divergence(px,py,w,h,out){
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;out[i]=(x+1<w?px[i]:0)-(x?px[i-1]:0)+(y+1<h?py[i]:0)-(y?py[i-w]:0);}
}
// Accelerated projected gradient on the smooth ROF dual. ||D||² <= 8,
// so step 1/8 is safe. Reconstructing u=f+div(p) enforces stationarity and
// preserves the mean even when the iteration cap precedes convergence.
export function rofProx(f,w,h,alpha,{iterations=1024,tolerance=1e-7,initialDual=null,dualScale=1}={}){
 const u=Float64Array.from(f),px=new Float64Array(f.length),py=px.slice(),qx=px.slice(),qy=px.slice(),div=px.slice();
 if(alpha===0)return {u,px,py,gap:0,iterations:0};
 if(initialDual)for(let i=0;i<f.length;i++){const vx=initialDual.px[i]*dualScale,vy=initialDual.py[i]*dualScale,den=Math.max(1,Math.sqrt(vx*vx+vy*vy)/alpha);px[i]=qx[i]=vx/den;py[i]=qy[i]=vy/den;}
 let t=1,gap=Infinity,iteration=0;
 for(;iteration<iterations;iteration++){
  divergence(qx,qy,w,h,div);for(let i=0;i<u.length;i++)u[i]=f[i]+div[i];
  const nextT=(1+Math.sqrt(1+4*t*t))/2,momentum=(t-1)/nextT;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,dx=x+1<w?u[i+1]-u[i]:0,dy=y+1<h?u[i+w]-u[i]:0;
   const vx=qx[i]+dx/8,vy=qy[i]+dy/8,den=Math.max(1,Math.sqrt(vx*vx+vy*vy)/alpha),nx=vx/den,ny=vy/den;
   qx[i]=nx+momentum*(nx-px[i]);qy[i]=ny+momentum*(ny-py[i]);px[i]=nx;py[i]=ny;
  }
  t=nextT;
  if(iteration%8===7||iteration===iterations-1){
   divergence(px,py,w,h,div);for(let i=0;i<u.length;i++)u[i]=f[i]+div[i];
   // Feasible ||p||<=alpha. Mean primal-dual gap is the stopping measure.
   gap=alpha*totalVariation(u,w,h);for(let i=0;i<u.length;i++)gap+=u[i]*div[i];
   gap=Math.max(0,gap/u.length);if(gap<tolerance){iteration++;break;}
  }
 }
 return {u,px,py,gap,iterations:iteration};
}

// Encoded-sRGB luminance area means, including fractional bin endpoints.
// Separable reduction avoids aliasing thin photo detail into the TV guide.
export function luminanceGuide(a,w,h,edge=TV_GUIDE_EDGE){
 const factor=Math.min(1,edge/Math.max(w,h)),gw=Math.max(1,Math.round(w*factor)),gh=Math.max(1,Math.round(h*factor));
 const rows=new Float64Array(gw*h),u=new Float64Array(gw*gh),sx=w/gw,sy=h/gh;
 for(let y=0;y<h;y++)for(let x=0;x<gw;x++){
  const left=x*sx,right=(x+1)*sx;let sum=0;
  for(let xx=Math.floor(left);xx<Math.ceil(right);xx++){const weight=Math.min(right,xx+1)-Math.max(left,xx),i=(y*w+Math.min(w-1,xx))*4;sum+=weight*(a[i]*.2126+a[i+1]*.7152+a[i+2]*.0722)/255;}
  rows[y*gw+x]=sum/sx;
 }
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
  const top=y*sy,bottom=(y+1)*sy;let sum=0;
  for(let yy=Math.floor(top);yy<Math.ceil(bottom);yy++)sum+=(Math.min(bottom,yy+1)-Math.max(top,yy))*rows[Math.min(h-1,yy)*gw+x];
  u[y*gw+x]=sum/sy;
 }
 return {u,w:gw,h:gh};
}

export function bandCenter(scale){return .00008*2**(scale/14);}
export function bandWeight(time,scale,width){const d=Math.log2(time/bandCenter(scale)),sigma=.2+width/65;return Math.exp(-.5*(d/sigma)**2);}
export function flowTimes(count=72,end=.04,start=.00002){return Array.from({length:count},(_,i)=>start*(end/start)**(i/(count-1)));}

// Implicit Euler: u_n = prox_(dt_n/h TV)(u_(n-1)). RGB channels are
// not independently flowed: the scalar encoded luminance defines the bands.
// Mass at t_n is t_n*(v_(n+1)-v_n); it already includes time integration.
export function tvFlow(f,w,h,{times=flowTimes(),iterations=1024,tolerance=1e-7}={}){
 if(!times.length)throw new Error('TV flow needs at least one time step');
 const edge=Math.max(w,h),sum=new Float64Array(f.length),bands=[],spectrum=[],diagnostics=[];
 let previous=Float64Array.from(f),velocity=null,previousTime=0,dual=null,previousAlpha=1;
 for(const time of times){
  const dt=time-previousTime;if(!(dt>0))throw new Error('TV times must increase strictly');
  const alpha=dt*edge,step=rofProx(previous,w,h,alpha,{iterations,tolerance,initialDual:dual,dualScale:alpha/previousAlpha}),nextVelocity=step.u.map((v,i)=>(v-previous[i])/dt);
  diagnostics.push({time,gap:step.gap,iterations:step.iterations});
  if(velocity){
   const mass=new Float64Array(f.length);let amplitude=0;
   for(let i=0;i<f.length;i++){mass[i]=previousTime*(nextVelocity[i]-velocity[i]);sum[i]+=mass[i];amplitude+=Math.abs(mass[i]);}
   bands.push(mass);spectrum.push({time:previousTime,amplitude:amplitude/f.length});
  }
  previous=step.u;velocity=nextVelocity;previousTime=time;dual=step;previousAlpha=alpha;
 }
 const remainder=previous.map((v,i)=>v-previousTime*velocity[i]);
 return {bands,sum,remainder,last:previous,spectrum,diagnostics,w,h};
}

export function selectTVBand(flow,scale=40,width=50){
 const band=new Float64Array(flow.sum.length),spectrum=flow.spectrum.map((entry,k)=>{
  const weight=bandWeight(entry.time,scale,width);for(let i=0;i<band.length;i++)band[i]+=flow.bands[k][i]*weight;return {...entry,weight};
 });return {band,spectrum,w:flow.w,h:flow.h};
}
export function spectralDecompose(f,w,h,p={}){const flow=tvFlow(f,w,h,p);return {...flow,...selectTVBand(flow,p.scale,p.width)};}

export function renderTVBand(a,w,h,analysis,p){
 if(p.view===0&&p.gain===100)return a.slice();
 const out=new Uint8ClampedArray(a.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,b=sample(analysis.band,analysis.w,analysis.h,(x+.5)*analysis.w/w-.5,(y+.5)*analysis.h/h-.5,0,1);
  if(p.view===1){
   const strength=clamp(Math.abs(b)*p.reveal/3),color=b>=0?POSITIVE:NEGATIVE;
   for(let c=0;c<3;c++)out[i+c]=255*(PAPER[c]*(1-strength)+color[c]*strength);
  }else for(let c=0;c<3;c++)out[i+c]=a[i+c]+255*b*(p.gain/100-1);
  out[i+3]=255;
 }
 return out;
}
// A single immutable guide/flow cache. Selection, gain and display never affect
// the decomposition. Exact guide comparison guards against hash collisions.
let cached=null;
export function spectralTV(a,w,h,p){
 if(p.view===0&&p.gain===100)return a.slice();
 const guide=luminanceGuide(a,w,h);
 if(!cached||cached.w!==guide.w||cached.h!==guide.h||guide.u.some((v,i)=>v!==cached.u[i]))cached={...guide,flow:tvFlow(guide.u,guide.w,guide.h)};
 return renderTVBand(a,w,h,selectTVBand(cached.flow,p.scale,p.width),p);
}
