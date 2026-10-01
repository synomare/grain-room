import {grid,blur,tensor,at} from './research-math.js';
import {clamp,hash} from './pixels.js';
import {fft} from './research-spectral.js';

// Direct Gaussian-windowed Kirchhoff quadrature (Zeng et al. 2025, eqs. 1-4).
// A one-dimensional periodic relief has an analytic transverse Gaussian transform.
export function coherentReflectance(height,wavelength,qx,qy,sigma,pitch,shape=.25,phase=0,samples=1024){
 let re=0,im=0,sum=0;
 for(let i=0;i<samples;i++){
  const x=((i+.5)/samples*6-3)*sigma,weight=Math.exp(-x*x/(2*sigma*sigma));
  const z=height*(Math.cos(2*Math.PI*x/pitch)+shape*Math.sin(4*Math.PI*x/pitch+phase));
  const phi=-2*Math.PI*(z+qx*x)/wavelength;re+=weight*Math.cos(phi);im+=weight*Math.sin(phi);sum+=weight;
 }
 return (re*re+im*im)/(sum*sum)*Math.exp(-4*Math.PI*Math.PI*sigma*sigma*qy*qy/(wavelength*wavelength));
}
export function gratingSpectrum(height,wavelength,pitch,shape=.25,phase=0,N=256){
 const re=new Float64Array(N),im=new Float64Array(N);
 for(let i=0;i<N;i++){const t=2*Math.PI*i/N,z=height*(Math.cos(t)+shape*Math.sin(2*t+phase)),a=-2*Math.PI*z/wavelength;re[i]=Math.cos(a);im[i]=Math.sin(a);}
 fft(re,im);for(let i=0;i<N;i++){re[i]/=N;im[i]/=N;}return {re,im,pitch};
}
export function spectrumReflectance(spectrum,wavelength,qx,qy,sigma){
 const {re,im,pitch}=spectrum,N=re.length;let r=0,s=0;
 for(let i=0;i<N;i++){const order=i<=N/2?i:i-N,f=order/pitch-qx/wavelength,exponent=-2*Math.PI*Math.PI*sigma*sigma*f*f;if(exponent< -32)continue;const weight=Math.exp(exponent);r+=re[i]*weight;s+=im[i]*weight;}
 return (r*r+s*s)*Math.exp(-4*Math.PI*Math.PI*sigma*sigma*qy*qy/(wavelength*wavelength));
}
const waves=[.42,.45,.48,.51,.54,.57,.60,.63,.66,.69];
const sensitivity=waves.map(w=>[Math.exp(-.5*((w-.61)/.04)**2),Math.exp(-.5*((w-.545)/.033)**2),Math.exp(-.5*((w-.455)/.026)**2)]);
export function wavebrdf(a,w,h,p){
 if(p.metal===0)return a.slice();
 const g=grid(a,w,h,640),height=blur(blur(g.l,g.w,g.h,5),g.w,g.h,5),t=tensor({...g,l:height},7),out=new Uint8ClampedArray(a.length);
 const directionX=Float32Array.from(t.angle,(v,i)=>Math.cos(2*v)*t.coherence[i]),directionY=Float32Array.from(t.angle,(v,i)=>Math.sin(2*v)*t.coherence[i]);
 const depth=p.depth/1000,pitch=p.pitch/1000,spread=.035+(100-p.coherence)*.0015,shape=p.profile/100*.65,phase=hash(4,8,p.seed)*Math.PI*2;
 const NH=40,NQ=100,qmax=1.4,hmax=Math.max(.001,depth*2.2),table=new Float32Array(NH*NQ*waves.length);
 // Fourier coefficients of one complete period avoid under-sampling deep, fine
 // grooves. Integrate each Fourier order analytically over the Gaussian window.
 for(let d=0;d<NH;d++)for(let k=0;k<waves.length;k++){const wave=waves[k],sigma=wave/(6*spread),spectrum=gratingSpectrum(d/(NH-1)*hmax,wave,pitch,shape,phase);for(let q=0;q<NQ;q++)table[(d*NQ+q)*waves.length+k]=spectrumReflectance(spectrum,wave,(q/(NQ-1)*2-1)*qmax,0,sigma);}
 const lookup=(D,Q,k)=>{const X=clamp((Q/qmax+1)*.5*(NQ-1),0,NQ-1),Y=clamp(D/hmax*(NH-1),0,NH-1),x=Math.floor(X),y=Math.floor(Y),fx=X-x,fy=Y-y;const get=(xx,yy)=>table[(yy*NQ+xx)*waves.length+k];return get(x,y)*(1-fx)*(1-fy)+get(Math.min(NQ-1,x+1),y)*fx*(1-fy)+get(x,Math.min(NH-1,y+1))*(1-fx)*fy+get(Math.min(NQ-1,x+1),Math.min(NH-1,y+1))*fx*fy;};
 const theta=p.light*Math.PI/180,LX=Math.cos(theta)*.38,LY=Math.sin(theta)*.38,LZ=Math.sqrt(1-.38**2),strength=p.relief/100,turn=p.angle*Math.PI/180;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,X=(x+.5)*g.w/w-.5,Y=(y+.5)*g.h/h-.5,H=at(height,g.w,g.h,X,Y),gx=(at(height,g.w,g.h,X+1,Y)-at(height,g.w,g.h,X-1,Y))*strength*6,gy=(at(height,g.w,g.h,X,Y+1)-at(height,g.w,g.h,X,Y-1))*strength*6;
  // Interpolate a line field in double-angle form, not wrapped angles. A small
  // constant orientation bias prevents undefined tangents on flat photo regions.
  const direction=.5*Math.atan2(at(directionY,g.w,g.h,X,Y),.2+at(directionX,g.w,g.h,X,Y));
  const orientation=direction+turn,co=Math.cos(orientation),si=Math.sin(orientation),qx=(LX-gx)*co+(LY-gy)*si,qy=-(LX-gx)*si+(LY-gy)*co;
  const D=depth*(.25+.75*H)*(1+LZ),rgb=[0,0,0],total=[0,0,0];
  for(let k=0;k<waves.length;k++){
   // Sum two mutually incoherent grating orientations. This is an original material choice.
   const sigma=waves[k]/(6*spread),atten=q=>Math.exp(-4*Math.PI*Math.PI*sigma*sigma*q*q/(waves[k]*waves[k]));
   const I=lookup(D,qx,k)*atten(qy)+p.cross/100*lookup(D,qy,k)*atten(qx);
   for(let c=0;c<3;c++){rgb[c]+=I*sensitivity[k][c];total[c]+=sensitivity[k][c];}
  }
  const metal=p.metal/100,exposure=p.exposure/100*12,brightness=.15+.85*Math.min(1,H*3);
  for(let c=0;c<3;c++){const source=at(g.rgb[c],g.w,g.h,X,Y),light=1-Math.exp(-rgb[c]/total[c]*exposure);out[i+c]=255*(source*(1-metal)+Math.pow(light,.65)*brightness*metal);}out[i+3]=255;
 }return out;
}
