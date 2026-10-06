import {fft} from './research-spectral.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const srgb=v=>v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;
const lut=Float32Array.from({length:256},(_,i)=>linear(i/255));

// Independent rectangular-pupil adaptation: exp(i*(cubic*u^3+focus*u^2)).
// Coordinates span [-4,4), with a unit half-width aperture and zero padding.
// Intensity, not amplitude, is convolved with the photograph. No deconvolution.
export function pupilProfile(cubic,focus,aperture=100){
 const n=1024,re=new Float64Array(n),im=new Float64Array(n);
 for(let j=0;j<n;j++){
  const u=(j-n/2)*8/n;
  if(Math.abs(u)<aperture/100){const phase=cubic*u*u*u+focus*u*u;re[j]=Math.cos(phase);im[j]=Math.sin(phase);}
 }
 fft(re,im);
 const intensity=new Float64Array(n);let total=0;
 for(let j=0;j<n;j++){const q=(j+n/2)%n;intensity[j]=re[q]**2+im[q]**2;total+=intensity[j];}
 for(let j=0;j<n;j++)intensity[j]/=total;
 return intensity;
}

// Integrate FFT-bin masses into output pixel bins. This avoids point sampling
// narrow lobes on small images. Crop frequency support to +/-16.0625, renormalize.
export function pupilKernel(radius,cubic,focus,aperture=100){
 if(radius<=0)return {weights:Float64Array.of(1),radius:0,retained:1};
 const profile=pupilProfile(cubic,focus,aperture),r=Math.ceil(radius),weights=new Float64Array(2*r+1);
 let retained=0;
 for(let j=384;j<=640;j++){
  const left=(j-512-.5)*radius/128.5,right=(j-512+.5)*radius/128.5;
  for(let x=Math.max(-r,Math.ceil(left-.5));x<=Math.min(r,Math.floor(right+.5));x++){
   const overlap=Math.max(0,Math.min(right,x+.5)-Math.max(left,x-.5));
   weights[x+r]+=profile[j]*overlap/(right-left);
  }
 }
 for(const v of weights)retained+=v;
 for(let j=0;j<weights.length;j++)weights[j]/=retained;
 return {weights,radius:r,retained};
}

// Mirror about the outer pixel edges. Unlike wrap, the opposite edge never enters.
export function reflect(i,n){if(n===1)return 0;const t=((i%(2*n))+2*n)%(2*n);return t<n?t:2*n-1-t;}

export function convolveAxis(input,output,w,h,weights,vertical=false,method='auto'){
 const r=(weights.length-1)/2,length=vertical?h:w,lines=vertical?w:h;
 const useFFT=method==='fft'||(method==='auto'&&r>12&&length>64);
 const index=(line,t)=>vertical?t*w+line:line*w+t;
 if(!useFFT){
  for(let line=0;line<lines;line++)for(let t=0;t<length;t++){
   let sum=0;for(let d=-r;d<=r;d++)sum+=weights[d+r]*input[index(line,reflect(t-d,length))];
   output[index(line,t)]=sum;
  }
  return;
 }
 let size=1;while(size<length+2*r)size*=2;
 const kr=new Float64Array(size),ki=new Float64Array(size),re=new Float64Array(size),im=new Float64Array(size);
 for(let d=-r;d<=r;d++)kr[(d+size)%size]=weights[d+r];fft(kr,ki);
 for(let line=0;line<lines;line++){
  re.fill(0);im.fill(0);
  for(let t=0;t<length+2*r;t++)re[t]=input[index(line,reflect(t-r,length))];
  fft(re,im);
  for(let j=0;j<size;j++){const real=re[j]*kr[j]-im[j]*ki[j];im[j]=re[j]*ki[j]+im[j]*kr[j];re[j]=real;}
  fft(re,im,true);
  for(let t=0;t<length;t++)output[index(line,t)]=re[t+r];
 }
}

export function pupilPSF(a,w,h,p){
 if(p.spread===0||p.light===0)return a.slice();
 const radius=p.spread*Math.max(w,h)/1000;
 const kx=pupilKernel(radius,p.tailX,p.focus+p.astig,p.aperture).weights;
 const ky=pupilKernel(radius,p.tailY,p.focus-p.astig,p.aperture).weights;
 const plane=new Float32Array(w*h),tmp=new Float32Array(w*h),out=new Uint8ClampedArray(a.length),amount=p.light/100;
 for(let c=0;c<3;c++){
  for(let i=0;i<plane.length;i++)plane[i]=lut[a[i*4+c]];
  convolveAxis(plane,tmp,w,h,kx);convolveAxis(tmp,plane,w,h,ky,true);
  for(let i=0;i<plane.length;i++)out[i*4+c]=255*srgb(clamp(lut[a[i*4+c]]*(1-amount)+plane[i]*amount,0,1));
 }
 for(let i=3;i<out.length;i+=4)out[i]=255;
 return out;
}
