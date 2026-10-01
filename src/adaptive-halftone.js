import {fft} from './research-spectral.js';
import {clamp,hash,sample} from './pixels.js';

// Orthonormal DCT-II and its transpose, using a mirrored 2N FFT.
export function dct1(input,inverse=false){
 const n=input.length,r=new Float64Array(2*n),im=new Float64Array(2*n),out=new Float64Array(n);
 if(!inverse){
  for(let j=0;j<n;j++)r[j]=r[2*n-1-j]=input[j];fft(r,im);
  for(let k=0;k<n;k++){const t=Math.PI*k/(2*n);out[k]=(r[k]*Math.cos(t)+im[k]*Math.sin(t))*.5*Math.sqrt((k?2:1)/n);}
 }else{
  for(let k=0;k<n;k++){const t=Math.PI*k/(2*n),v=2*input[k]/Math.sqrt((k?2:1)/n);r[k]=v*Math.cos(t);im[k]=v*Math.sin(t);if(k){r[2*n-k]=r[k];im[2*n-k]=-im[k];}}
  fft(r,im,true);for(let j=0;j<n;j++)out[j]=r[j];
 }return out;
}
export function dct2(input,w,h,inverse=false){
 const out=Float64Array.from(input),column=new Float64Array(h);
 for(let y=0;y<h;y++)out.set(dct1(out.subarray(y*w,(y+1)*w),inverse),y*w);
 for(let x=0;x<w;x++){for(let y=0;y<h;y++)column[y]=out[y*w+x];const c=dct1(column,inverse);for(let y=0;y<h;y++)out[y*w+x]=c[y];}return out;
}
const reflect=(i,n)=>{i=((i%(2*n))+2*n)%(2*n);return i<n?i:2*n-1-i;};
export function symmetricBlur(a,w,h,sigma=1.5){
 const radius=5,k=Float64Array.from({length:11},(_,j)=>Math.exp(-.5*((j-radius)/sigma)**2)),sum=k.reduce((s,v)=>s+v,0),tmp=new Float64Array(a.length),out=tmp.slice();for(let j=0;j<11;j++)k[j]/=sum;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let d=-radius;d<=radius;d++)v+=a[y*w+reflect(x+d,w)]*k[d+radius];tmp[y*w+x]=v;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let d=-radius;d<=radius;d++)v+=tmp[reflect(y+d,h)*w+x]*k[d+radius];out[y*w+x]=v;}return out;
}
export function halftoneLossGradient(binary,target,w,h,cutoff=1,spectral=1){
 const n=w*h,smooth=symmetricBlur(binary,w,h),diff=Float64Array.from(smooth,(v,i)=>v-target[i]),grad=Float64Array.from(diff),cx=Math.max(1,Math.floor(w*cutoff)),cy=Math.max(1,Math.floor(h*cutoff));
 let loss=diff.reduce((s,v)=>s+v*v,0)/n;
 if(spectral>0&&cx===w&&cy===h){loss*=1+spectral;for(let i=0;i<n;i++)grad[i]*=1+spectral;}
 else if(spectral>0){const spectrum=dct2(diff,w,h);let e=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x>=cx||y>=cy)spectrum[i]=0;else e+=spectrum[i]**2;}loss+=spectral*e/(cx*cy);const back=dct2(spectrum,w,h,true);for(let i=0;i<n;i++)grad[i]+=spectral*back[i]*n/(cx*cy);}
 const back=symmetricBlur(grad,w,h);for(let i=0;i<n;i++)back[i]*=2/n;return {loss,gradient:back};
}
export function gaussianSelection(z,tau=.5){return Math.exp(-((tau-z)**2));}
export function gaussianSelectionDerivative(z,tau=.5){return 2*(tau-z)*gaussianSelection(z,tau);}
export function optimizeHalftone(target,w,h,{steps=60,spectral=1,seed=17,rate=.18}={}){
 const n=w*h,tau=.5,z=Float64Array.from(target,(v,i)=>hash(i,66,seed)<v?.03+hash(i,22,seed)*.1:-.03-hash(i,22,seed)*.1),binary=new Float64Array(n);let best=new Float64Array(n),bestLoss=Infinity;
 for(let t=0;t<=steps;t++){
  for(let i=0;i<n;i++)binary[i]=z[i]>=0&&z[i]<=tau?1:0;
  // Keep the best fixed full-band objective; changing H-DCT bands need not be monotone.
  const fixed=halftoneLossGradient(binary,target,w,h,1,spectral);if(fixed.loss<bestLoss){bestLoss=fixed.loss;best.set(binary);}
  if(t===steps)break;
  const cut=1-Math.exp(-4*(t+1)/steps),g=halftoneLossGradient(binary,target,w,h,cut,spectral).gradient,eta=.008+(rate-.008)*(1+Math.cos(Math.PI*t/steps))/2;
  for(let i=0;i<n;i++)z[i]=clamp(z[i]-eta*n*g[i]*gaussianSelectionDerivative(z[i],tau),-2,tau-.001);
 }
 return {binary:best,loss:bestLoss};
}
export function inksearch(a,w,h,p){
 const long=2**p.density,W=Math.max(8,2**Math.round(Math.log2(long*w/Math.max(w,h)))),H=Math.max(8,2**Math.round(Math.log2(long*h/Math.max(w,h)))),dark=p.paper<50,fields=[];
 for(let c=0;c<3;c++){
  const target=Float64Array.from({length:W*H},(_,i)=>{const v=sample(a,w,h,(i%W+.5)*w/W-.5,(Math.floor(i/W)+.5)*h/H-.5,c)/255;return Math.pow(dark?v:1-v,100/p.ink);});
  fields.push(optimizeHalftone(target,W,H,{steps:p.time,spectral:p.structure/50,seed:p.seed+(p.colorMode==='mono'?0:c*29)}).binary);
 }
 const out=new Uint8ClampedArray(a.length),cw=w/W,ch=h/H,angle=p.angle*Math.PI/180,ca=Math.cos(angle),sa=Math.sin(angle),spread=p.spread/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  for(let c=0;c<3;c++){
   const X=x/cw+(c-1)*p.register/100,Y=y/ch-(c-1)*p.register/160,ix=Math.floor(X),iy=Math.floor(Y),u=X-ix-.5,v=Y-iy-.5,xx=ca*u-sa*v,yy=sa*u+ca*v;
   let coverage=0;if(ix>=0&&iy>=0&&ix<W&&iy<H&&fields[c][iy*W+ix]){
    const distance=p.form===1?Math.max(Math.abs(xx),Math.abs(yy)):p.form===2?Math.hypot(xx,yy):Math.max(Math.abs(xx),Math.abs(yy)*2.8),aa=1/Math.max(1,Math.min(cw,ch));coverage=clamp((spread*.5-distance)/aa+.5,0,1);
   }
   out[i+c]=dark?p.paper*2.55+(255-p.paper*2.55)*coverage:p.paper*2.55*(1-coverage);
  }out[i+3]=255;
 }return out;
}
