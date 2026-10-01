import {grid,expand} from './research-math.js';
export function fft(re,im,inverse=false){
 const n=re.length;if(n!==im.length||!n||(n&(n-1)))throw new Error('FFT size must be a power of two');
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
 for(let len=2;len<=n;len<<=1){
  const theta=(inverse?2:-2)*Math.PI/len,wr0=Math.cos(theta),wi0=Math.sin(theta);
  for(let start=0;start<n;start+=len){let wr=1,wi=0;
   for(let j=0;j<len/2;j++){const x=start+j,y=x+len/2,tr=wr*re[y]-wi*im[y],ti=wr*im[y]+wi*re[y],ur=re[x],ui=im[x];re[x]=ur+tr;im[x]=ui+ti;re[y]=ur-tr;im[y]=ui-ti;const next=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=next;}
  }
 }
 if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}
export function fft2(re,im,w,h,inverse=false){
 const rr=new Float64Array(w),ri=rr.slice(),cr=new Float64Array(h),ci=cr.slice();
 for(let y=0;y<h;y++){rr.set(re.subarray(y*w,(y+1)*w));ri.set(im.subarray(y*w,(y+1)*w));fft(rr,ri,inverse);re.set(rr,y*w);im.set(ri,y*w);}
 for(let x=0;x<w;x++){for(let y=0;y<h;y++){cr[y]=re[y*w+x];ci[y]=im[y*w+x];}fft(cr,ci,inverse);for(let y=0;y<h;y++){re[y*w+x]=cr[y];im[y*w+x]=ci[y];}}
}
export function spectral(a,w,h,p,diffraction=false){
 if((diffraction?p.distance:p.shift)===0)return a.slice();
 const g=grid(a,w,h,384),W=2**Math.ceil(Math.log2(g.w*1.4)),H=2**Math.ceil(Math.log2(g.h*1.4)),ox=Math.floor((W-g.w)/2),oy=Math.floor((H-g.h)/2),out=g.rgb.map(()=>new Float32Array(g.w*g.h)),angle=(p.angle||0)*Math.PI/180;
 for(let c=0;c<3;c++){
  const re=new Float64Array(W*H),im=re.slice();
  for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++){const i=y*g.w+x,j=(y+oy)*W+x+ox,phase=diffraction?g.l[i]*p.phase*.16:0,amp=diffraction?Math.sqrt(g.rgb[c][i]):g.rgb[c][i];re[j]=amp*Math.cos(phase);im[j]=amp*Math.sin(phase);}
  fft2(re,im,W,H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const kx=(x<=W/2?x:x-W)/W,ky=(y<=H/2?y:y-H)/H,r=Math.hypot(kx,ky),i=y*W+x;
   let phase;
   if(diffraction)phase=-Math.PI*p.distance*18*[.65,.53,.45][c]*(kx*kx+ky*ky);
   else{
    const d=kx*Math.cos(angle)+ky*Math.sin(angle),band=p.band/200;
    // Odd phase preserves conjugate symmetry, including Nyquist self-pairs.
    phase=Math.sin(d*28)*Math.exp(-(((r-band)/(.035+band*.6))**2))*p.shift*.16*(1+(c-1)*.17);
    if(x===W/2||y===H/2)phase=0;
   }
   const cs=Math.cos(phase),sn=Math.sin(phase),v=re[i];re[i]=v*cs-im[i]*sn;im[i]=v*sn+im[i]*cs;
  }
  fft2(re,im,W,H,true);
  for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++){const i=y*g.w+x,j=(y+oy)*W+x+ox;out[c][i]=diffraction?Math.sqrt(re[j]*re[j]+im[j]*im[j])*p.exposure/100:re[j];}
 }
 return expand(out,g.w,g.h,w,h);
}
