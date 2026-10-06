import {fft2} from './research-spectral.js';
import {hash,sample} from './pixels.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const SPECKLE_N=256,SPECKLE_GUIDE=128;
export const toLinear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
export const toEncoded=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
const linearTable=Float64Array.from({length:256},(_,i)=>toLinear(i/255));
export function linearSpeckleGuide(a,w,h,edge=SPECKLE_GUIDE){
 const factor=Math.min(1,edge/Math.max(w,h)),gw=Math.max(1,Math.round(w*factor)),gh=Math.max(1,Math.round(h*factor)),sx=w/gw,sy=h/gh,rows=new Float64Array(gw*h*3),rgb=new Float64Array(gw*gh*3);
 for(let y=0;y<h;y++)for(let x=0;x<gw;x++){const left=x*sx,right=(x+1)*sx;for(let xx=Math.floor(left);xx<Math.ceil(right);xx++){const weight=(Math.min(right,xx+1)-Math.max(left,xx))/sx,i=(y*w+Math.min(w-1,xx))*4,j=(y*gw+x)*3;for(let c=0;c<3;c++)rows[j+c]+=linearTable[a[i+c]]*weight;}}
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){const top=y*sy,bottom=(y+1)*sy;for(let yy=Math.floor(top);yy<Math.ceil(bottom);yy++){const weight=(Math.min(bottom,yy+1)-Math.max(top,yy))/sy,i=(Math.min(h-1,yy)*gw+x)*3,j=(y*gw+x)*3;for(let c=0;c<3;c++)rgb[j+c]+=rows[i+c]*weight;}}
 return {rgb,w:gw,h:gh};
}
export function reflectIndex(v,n){if(n===1)return 0;const period=2*n,t=((v%period)+period)%period;return t<n?t:period-1-t;}

// Gaussian white samples filtered with a Gaussian amplitude spectrum. Shared
// across illumination modes and wavelength proxies: one explicit rough plane.
export function roughPlane(seed,correlation,n=SPECKLE_N){
 const re=new Float64Array(n*n),im=re.slice();
 for(let i=0;i<re.length;i++){const u=Math.max(1e-12,hash(i,251,seed)),v=hash(i,252,seed);re[i]=Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
 fft2(re,im,n,n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const kx=x<=n/2?x:x-n,ky=y<=n/2?y:y-n,a=Math.exp(-(Math.PI**2)*correlation**2*(kx*kx+ky*ky)/(n*n)),i=y*n+x;re[i]*=a;im[i]*=a;}
 re[0]=im[0]=0;fft2(re,im,n,n,true);const rms=Math.sqrt(re.reduce((s,v)=>s+v*v,0)/re.length)||1;for(let i=0;i<re.length;i++)re[i]/=rms;return re;
}

// Elliptical amplitude pupil, with its boundary integrated by a soft edge.
export function specklePupil(size,stretch,angle,n=SPECKLE_N){
 const ratio=1+stretch/100*3,cutoff=Math.min(n*.43/Math.sqrt(ratio),n/(Math.PI*Math.max(1.2,size))),co=Math.cos(angle*Math.PI/180),si=Math.sin(angle*Math.PI/180),pupil=new Float64Array(n*n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const kx=x<=n/2?x:x-n,ky=y<=n/2?y:y-n,u=(kx*co+ky*si)*Math.sqrt(ratio),v=(-kx*si+ky*co)/Math.sqrt(ratio),r=Math.hypot(u,v);pupil[y*n+x]=clamp((cutoff-r)/.8+.5,0,1);}
 return pupil;
}

export function illuminationModes(spread,pupil,n=SPECKLE_N,count=8){
 if(spread===0)return [{x:0,y:0,weight:1}];
 const area=pupil.reduce((s,v)=>s+v*v,0),radius=Math.sqrt(area/Math.PI)*spread/100*1.15,modes=[];
 for(let i=0;i<count;i++){const r=radius*Math.sqrt((i+.5)/count),a=i*Math.PI*(3-Math.sqrt(5));modes.push({x:Math.round(r*Math.cos(a)),y:Math.round(r*Math.sin(a)),weight:1/count});}
 return modes;
}

export function coherentIntensity(amplitude,height,pupil,modes,phase,n=SPECKLE_N){
 const spectrumRe=new Float64Array(n*n),spectrumIm=spectrumRe.slice();
 for(let i=0;i<spectrumRe.length;i++){const a=phase*height[i];spectrumRe[i]=amplitude[i]*Math.cos(a);spectrumIm[i]=amplitude[i]*Math.sin(a);}
 fft2(spectrumRe,spectrumIm,n,n);const intensity=new Float64Array(n*n);
 // Integer plane-wave tilts shift the same scattered spectrum. Average the
 // mode intensities (mutually incoherent), never the mode field amplitudes.
 for(const mode of modes){const re=new Float64Array(n*n),im=re.slice();
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x,j=((y-mode.y+n)%n)*n+(x-mode.x+n)%n;re[i]=spectrumRe[j]*pupil[i];im[i]=spectrumIm[j]*pupil[i];}
  fft2(re,im,n,n,true);for(let i=0;i<intensity.length;i++)intensity[i]+=mode.weight*(re[i]*re[i]+im[i]*im[i]);
 }
 return intensity;
}

export function incoherentIntensity(source,pupil,n=SPECKLE_N){
 const re=pupil.slice(),im=new Float64Array(n*n);fft2(re,im,n,n,true);const power=Float64Array.from(re,(v,i)=>v*v+im[i]*im[i]),energy=power.reduce((s,v)=>s+v,0);
 for(let i=0;i<power.length;i++)power[i]/=energy;const kernelIm=new Float64Array(n*n);fft2(power,kernelIm,n,n);const sourceRe=source.slice(),sourceIm=new Float64Array(n*n);fft2(sourceRe,sourceIm,n,n);
 for(let i=0;i<power.length;i++){const r=sourceRe[i],a=sourceIm[i];sourceRe[i]=r*power[i]-a*kernelIm[i];sourceIm[i]=r*kernelIm[i]+a*power[i];}fft2(sourceRe,sourceIm,n,n,true);return Float64Array.from(sourceRe,v=>Math.max(0,v));
}

export function specklePlan(a,w,h,p,{n=SPECKLE_N,edge=SPECKLE_GUIDE}={}){
 const guide=linearSpeckleGuide(a,w,h,Math.min(edge,n/2)),ox=Math.floor((n-guide.w)/2),oy=Math.floor((n-guide.h)/2),long=Math.max(guide.w,guide.h),height=roughPlane(p.seed,Math.max(.18,p.surface*long/1000),n),pupil=specklePupil(p.size*long/1000,p.stretch,p.angle,n),modes=illuminationModes(p.spread,pupil,n),fields=[],references=[],gain=[];
 const phase=p.roughness/100*6,waves=p.color===0?[1]:[.55/.64,1,.55/.46];
 for(let c=0;c<waves.length;c++){
  const source=new Float64Array(n*n);for(let y=0;y<n;y++)for(let x=0;x<n;x++){const xx=reflectIndex(x-ox,guide.w),yy=reflectIndex(y-oy,guide.h),i=(yy*guide.w+xx)*3;if(p.color===0)source[y*n+x]=.2126*guide.rgb[i]+.7152*guide.rgb[i+1]+.0722*guide.rgb[i+2];else source[y*n+x]=guide.rgb[i+c];}
  const amplitude=Float64Array.from(source,Math.sqrt),raw=coherentIntensity(amplitude,height,pupil,modes,phase*waves[c],n),reference=incoherentIntensity(source,pupil,n),sourceEnergy=source.reduce((s,v)=>s+v,0),rawEnergy=raw.reduce((s,v)=>s+v,0),exposure=rawEnergy>1e-12?sourceEnergy/rawEnergy:1,field=new Float64Array(guide.w*guide.h),ref=field.slice(),ratio=field.slice();
  for(let y=0;y<guide.h;y++)for(let x=0;x<guide.w;x++){const i=y*guide.w+x,j=(y+oy)*n+x+ox;field[i]=raw[j]*exposure;ref[i]=reference[j];ratio[i]=ref[i]>1e-10?field[i]/ref[i]:1;}
  fields.push(field);references.push(ref);gain.push(ratio);
 }
 return {w:guide.w,h:guide.h,fields,references,gain,height,pupil,modes,n};
}

export function renderSpecklePlan(a,w,h,plan,p){
 const out=new Uint8ClampedArray(a.length),amount=p.amount/100,structure=p.structure/100,color=p.color/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=(x+.5)*plan.w/w-.5,Y=(y+.5)*plan.h/h-.5,i=(y*w+x)*4,green=plan.gain.length===1?0:1,common=sample(plan.gain[green],plan.w,plan.h,X,Y,0,1);
  for(let c=0;c<3;c++){const channel=plan.gain.length===1?0:c,chromatic=sample(plan.gain[channel],plan.w,plan.h,X,Y,0,1),factor=clamp(common*(1-color)+chromatic*color,0,12),original=linearTable[a[i+c]],raw=sample(plan.fields[channel],plan.w,plan.h,X,Y,0,1),scattered=structure*original*factor+(1-structure)*raw;out[i+c]=255*toEncoded(Math.max(0,original*(1-amount)+scattered*amount));}out[i+3]=255;
 }
 return out;
}
export function speckleField(a,w,h,p){if(p.amount===0)return new Uint8ClampedArray(a);return renderSpecklePlan(a,w,h,specklePlan(a,w,h,p),p);}
