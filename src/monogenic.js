import {fft2} from './research-spectral.js';
import {at} from './research-math.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const reflect=(i,n)=>{const t=((i%(2*n))+2*n)%(2*n);return t<n?t:2*n-1-t;};

// Area integration, including partial source pixels. Analysis never upsamples.
export function phaseGuide(a,w,h,cap=384){
 const factor=Math.min(1,cap/Math.max(w,h)),gw=Math.max(1,Math.round(w*factor)),gh=Math.max(1,Math.round(h*factor)),l=new Float64Array(gw*gh);
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
  const x0=x*w/gw,x1=(x+1)*w/gw,y0=y*h/gh,y1=(y+1)*h/gh;let sum=0;
  for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++)for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
   const area=(Math.min(x1,sx+1)-Math.max(x0,sx))*(Math.min(y1,sy+1)-Math.max(y0,sy)),i=(sy*w+sx)*4;
   sum+=area*(.2126*a[i]+.7152*a[i+1]+.0722*a[i+2])/255;
  }
  l[y*gw+x]=sum/((x1-x0)*(y1-y0));
 }
 return {l,w:gw,h:gh,dx:w/gw,dy:h/gh};
}

// Poisson difference B(r)=4(exp(-s*r)-exp(-2*s*r)), peak one.
// The +i k/|k| convention follows Felsberg/Sommer Eq.10; DC is zero.
// Nyquist components of each odd multiplier are zero to keep real output.
export function phaseBand(input,w,h,sigma,dx=1,dy=1,{pad=true}={}){
 const W=pad?2**Math.ceil(Math.log2(2*w)):w,H=pad?2**Math.ceil(Math.log2(2*h)):h,ox=pad?Math.floor((W-w)/2):0,oy=pad?Math.floor((H-h)/2):0;
 const re=new Float64Array(W*H),im=new Float64Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)re[y*W+x]=input[reflect(y-oy,h)*w+reflect(x-ox,w)];
 fft2(re,im,W,H);
 const even=new Float64Array(w*h),rx=even.slice(),ry=even.slice();
 for(let c=0;c<3;c++){
  const ar=new Float64Array(W*H),ai=ar.slice();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const kx=2*Math.PI*(x<=W/2?x:x-W)/(W*dx),ky=2*Math.PI*(y<=H/2?y:y-H)/(H*dy),r=Math.hypot(kx,ky),i=y*W+x,b=r===0?0:4*(Math.exp(-sigma*r)-Math.exp(-2*sigma*r));
   if(c===0){ar[i]=re[i]*b;ai[i]=im[i]*b;}
   else{const k=c===1?(x===W/2?0:kx):(y===H/2?0:ky),m=r===0?0:b*k/r;ar[i]=-im[i]*m;ai[i]=re[i]*m;}
  }
  fft2(ar,ai,W,H,true);const dst=[even,rx,ry][c];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)dst[y*w+x]=ar[(y+oy)*W+x+ox];
 }
 return {even,rx,ry,w,h};
}

// Folded phase phi=atan2(|R|,e) in [0,pi]. This nonlinear artistic edit is not
// an invertible analytic-signal rotation, nor multiscale phase congruency.
export function phaseStyle(band,p){
 let power=0;for(let i=0;i<band.even.length;i++)power+=band.even[i]**2+band.rx[i]**2+band.ry[i]**2;
 const rms=Math.sqrt(power/band.even.length),angle=p.direction*Math.PI/180,shift=p.phase*Math.PI/180;
 return {rms,cs:Math.cos(angle),sn:Math.sin(angle),cp:Math.cos(shift),sp:Math.sin(shift),flat:p.equalize/100,select:p.select/100,gain:p.gain/100,folds:p.folds??1,threshold:(rms*(p.cut??35)/100)**2};
}

export function phaseValue(e,x,y,s,residual=false){
 const q2=x*x+y*y,a2=e*e+q2;
 if(a2<1e-24)return 0;
 const amp=Math.sqrt(a2),u=e/amp,v=Math.sqrt(q2)/amp;
 let real=1,imag=0;
 // Integer multiples of phase, evaluated as powers on the unit semicircle.
 for(let k=0;k<s.folds;k++){const r=real*u-imag*v;imag=real*v+imag*u;real=r;}
 const axis=s.select===0?1:1-s.select+s.select*(q2>1e-24?(x*s.cs+y*s.sn)**2/q2:0);
 const weight=axis*(s.threshold===0?1:a2/(a2+s.threshold)),level=(1-s.flat)*amp+s.flat*s.rms*amp/(amp+.004);
 const edited=level*(real*s.cp-imag*s.sp)*s.gain;
 return weight*(edited-(residual?e:0));
}

export function phaseEdit(band,p){
 const style=phaseStyle(band,p),delta=new Float64Array(band.even.length),response=delta.slice();
 for(let i=0;i<delta.length;i++){delta[i]=phaseValue(band.even[i],band.rx[i],band.ry[i],style,true);response[i]=phaseValue(band.even[i],band.rx[i],band.ry[i],style);}
 return {...band,delta,response,rms:style.rms};
}

export function monogenic(a,w,h,p){
 if(p.view===0&&p.phase===0&&(p.folds??1)===1&&p.equalize===0&&p.gain===100)return Uint8ClampedArray.from(a);
 const guide=phaseGuide(a,w,h),band=phaseBand(guide.l,guide.w,guide.h,p.scale*Math.max(w,h)/1000,guide.dx,guide.dy);
 return renderPhase(a,w,h,band,p);
}

export function renderPhase(a,w,h,band,p){
 const style=phaseStyle(band,p),out=new Uint8ClampedArray(a.length);
 const inks=[[31,39,72],[185,69,44]],paper=[246,240,226],norm=Math.max(.025,style.rms)*1.35;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,gx=(x+.5)*band.w/w-.5,gy=(y+.5)*band.h/h-.5;
  // Interpolate the three linear fields first, then fold at the native output
  // coordinate. Upsampling a pre-folded map would blur/subsample its new lines.
  const e=at(band.even,band.w,band.h,gx,gy),rx=at(band.rx,band.w,band.h,gx,gy),ry=at(band.ry,band.w,band.h,gx,gy);
  if(p.view===0){const d=phaseValue(e,rx,ry,style,true)*255;for(let c=0;c<3;c++)out[i+c]=a[i+c]+d;}
  else{
   const v=phaseValue(e,rx,ry,style),ink=inks[v>=0?1:0],coverage=clamp(Math.abs(v)/norm,0,1);
   for(let c=0;c<3;c++)out[i+c]=paper[c]+coverage*(ink[c]-paper[c]);
  }
  out[i+3]=255;
 }
 return out;
}
