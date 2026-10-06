import {fft2} from './research-spectral.js';
import {hash} from './pixels.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const srgb=v=>v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;
const lut=Float64Array.from({length:256},(_,i)=>linear(i/255));
const SQ3=Math.sqrt(3),SQ6=Math.sqrt(6),SQ8=Math.sqrt(8);

export function phaseScreen(seed,scale,n=256){
 const re=Float64Array.from({length:n*n},(_,i)=>Math.sqrt(-2*Math.log(Math.max(1e-9,hash(i,31,seed))))*Math.cos(2*Math.PI*hash(i,32,seed))),im=new Float64Array(re.length),outer=8+scale*1.4,cutoff=n/outer;
 fft2(re,im,n,n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const i=y*n+x,kx=x<=n/2?x:x-n,ky=y<=n/2?y:y-n,r2=kx*kx+ky*ky,weight=r2===0?0:(r2+cutoff*cutoff)**(-11/12)*Math.exp(-r2/(n*n/10));re[i]*=weight;im[i]*=weight;
 }
 fft2(re,im,n,n,true);
 const rms=Math.sqrt(re.reduce((s,v)=>s+v*v,0)/re.length)||1;for(let i=0;i<re.length;i++)re[i]/=rms;
 return {value:re,w:n,h:n};
}

export function phaseBasis(u,v){const r=u*u+v*v;return [1,2*u,2*v,SQ3*(2*r-1),2*SQ6*u*v,SQ6*(u*u-v*v),SQ8*(3*r-2)*u,SQ8*(3*r-2)*v];}

export function phaseSlope(coeff,u,v){
 return [2*coeff[1]+4*SQ3*u*coeff[3]+2*SQ6*v*coeff[4]+2*SQ6*u*coeff[5]+SQ8*(9*u*u+3*v*v-2)*coeff[6]+SQ8*6*u*v*coeff[7],2*coeff[2]+4*SQ3*v*coeff[3]+2*SQ6*u*coeff[4]-2*SQ6*v*coeff[5]+SQ8*6*u*v*coeff[6]+SQ8*(3*u*u+9*v*v-2)*coeff[7]];
}

export function apertureProjector(size=20){
 const points=[],G=Array.from({length:8},()=>new Float64Array(8));
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const u=(x+.5)*2/size-1,v=(y+.5)*2/size-1;if(u*u+v*v>1)continue;const b=phaseBasis(u,v);points.push({u,v,b});for(let j=0;j<8;j++)for(let k=0;k<8;k++)G[j][k]+=b[j]*b[k];}
 const L=Array.from({length:8},()=>new Float64Array(8));
 for(let j=0;j<8;j++)for(let k=0;k<=j;k++){let s=G[j][k];for(let a=0;a<k;a++)s-=L[j][a]*L[k][a];L[j][k]=j===k?Math.sqrt(s):s/L[k][k];}
 return {points,L};
}

export function projectAperture(sample,cx,cy,radius,projector){
 const rhs=new Float64Array(8),white=rhs.slice(),coeff=rhs.slice();
 for(const q of projector.points){const v=sample(cx+q.u*radius,cy+q.v*radius);for(let j=0;j<8;j++)rhs[j]+=v*q.b[j];}
 for(let j=0;j<8;j++){let s=rhs[j];for(let k=0;k<j;k++)s-=projector.L[j][k]*white[k];white[j]=s/projector.L[j][j];}
 for(let j=7;j>=0;j--){let s=white[j];for(let k=j+1;k<8;k++)s-=projector.L[k][j]*coeff[k];coeff[j]=s/projector.L[j][j];}
 return coeff;
}

export function screenAt(screen,x,y){
 const {w,h,value}=screen;let ix=Math.floor(x),iy=Math.floor(y);const fx=x-ix,fy=y-iy;ix=((ix%w)+w)%w;iy=((iy%h)+h)%h;const jx=(ix+1)%w,jy=(iy+1)%h;return(value[iy*w+ix]*(1-fx)+value[iy*w+jx]*fx)*(1-fy)+(value[jy*w+ix]*(1-fx)+value[jy*w+jx]*fx)*fy;
}

export function lightCoefficientField(w,h,p,{screen=phaseScreen(p.seed,p.scale),longNodes=25}={}){
 const long=Math.max(w,h),fw=Math.max(2,Math.round((longNodes-1)*w/long)+1),fh=Math.max(2,Math.round((longNodes-1)*h/long)+1),radius=5+p.aperture/100*20,projector=apertureProjector(),fields=Array.from({length:8},()=>new Float64Array(fw*fh)),sample=(x,y)=>screenAt(screen,x,y),span=screen.w*.5;
 for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
  const cx=screen.w/2+(x/(fw-1)-.5)*span*w/long,cy=screen.h/2+(y/(fh-1)-.5)*span*h/long,c=projectAperture(sample,cx,cy,radius,projector),i=y*fw+x;for(let k=0;k<8;k++)fields[k][i]=c[k];
 }
 return {w:fw,h:fh,fields,radius,screen};
}

export function coefficientAt(field,x,y,out=new Float64Array(8)){
 const gx=clamp(x,0,1)*(field.w-1),gy=clamp(y,0,1)*(field.h-1),ix=Math.floor(gx),iy=Math.floor(gy),jx=Math.min(ix+1,field.w-1),jy=Math.min(iy+1,field.h-1),fx=gx-ix,fy=gy-iy;
 for(let k=0;k<8;k++){const a=field.fields[k];out[k]=(a[iy*field.w+ix]*(1-fx)+a[iy*field.w+jx]*fx)*(1-fy)+(a[jy*field.w+ix]*(1-fx)+a[jy*field.w+jx]*fx)*fy;}return out;
}

// Equal-area, deterministic disk quadrature. The image does not receive
// fresh per-pixel random noise. These rays approximate a geometric PSF.
export function apertureRays(count=24){
 return Array.from({length:count},(_,i)=>{const r=Math.sqrt((i+.5)/count),theta=i*Math.PI*(3-Math.sqrt(5));return {u:r*Math.cos(theta),v:r*Math.sin(theta),weight:1/count};});
}

export function localLightKernel(coeff,p,radius,long=1000,rays=apertureRays(p.rays??32)){
 const c=Float64Array.from(coeff),gain=260*p.strength/100*long/1000/radius;c[0]=0;c[1]*=p.tilt/100;c[2]*=p.tilt/100;for(let k=3;k<8;k++)c[k]*=p.blur/100;
 return rays.map(q=>{const [x,y]=phaseSlope(c,q.u,q.v);return {x:x*gain,y:y*gain,weight:q.weight};});
}

export function reflectPosition(x,n){if(n===1)return 0;const t=((x+.5)%(2*n)+2*n)%(2*n);return clamp(t<n?t-.5:2*n-t-.5,0,n-1);}

export function renderLightSheet(a,w,h,field,p){
 const out=new Uint8ClampedArray(a.length),long=Math.max(w,h),rays=p.blur===0?[{u:0,v:0,weight:1}]:apertureRays(p.rays??32),coeff=new Float64Array(8),sum=new Float64Array(3),gain=260*p.strength/100*long/1000/field.radius,slopes=rays.map(q=>({x:[4*SQ3*q.u,2*SQ6*q.v,2*SQ6*q.u,SQ8*(9*q.u*q.u+3*q.v*q.v-2),SQ8*6*q.u*q.v],y:[4*SQ3*q.v,2*SQ6*q.u,-2*SQ6*q.v,SQ8*6*q.u*q.v,SQ8*(3*q.u*q.u+9*q.v*q.v-2)],weight:q.weight}));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;coefficientAt(field,w===1?.5:x/(w-1),h===1?.5:y/(h-1),coeff);const tx=2*coeff[1]*p.tilt/100*gain,ty=2*coeff[2]*p.tilt/100*gain;for(let k=3;k<8;k++)coeff[k]*=p.blur/100*gain;sum.fill(0);
  for(const q of slopes){let sx=tx,sy=ty;for(let k=0;k<5;k++){sx+=q.x[k]*coeff[k+3];sy+=q.y[k]*coeff[k+3];}const px=reflectPosition(x-sx,w),py=reflectPosition(y-sy,h),ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(ix+1,w-1),jy=Math.min(iy+1,h-1),fx=px-ix,fy=py-iy,a0=(iy*w+ix)*4,a1=(iy*w+jx)*4,a2=(jy*w+ix)*4,a3=(jy*w+jx)*4;
   for(let c=0;c<3;c++)sum[c]+=((lut[a[a0+c]]*(1-fx)+lut[a[a1+c]]*fx)*(1-fy)+(lut[a[a2+c]]*(1-fx)+lut[a[a3+c]]*fx)*fy)*q.weight;
  }
  for(let c=0;c<3;c++)out[i+c]=255*srgb(clamp(sum[c],0,1));out[i+3]=255;
 }
 return out;
}

export function lightSheet(a,w,h,p){
 if(p.strength===0||(p.tilt===0&&p.blur===0))return Uint8ClampedArray.from(a);
 return renderLightSheet(a,w,h,lightCoefficientField(w,h,p),p);
}
