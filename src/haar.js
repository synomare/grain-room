import {hash,clamp} from './pixels.js';
import {grid,at} from './research-math.js';
const power=n=>n>=1&&Number.isInteger(n)&&(n&(n-1))===0;
// Orthonormal 2x2 Haar blocks, recursively transforming only the LL quadrant.
export function haarTransform(input,w,h,inverse=false){
 if(!power(w)||!power(h)||input.length!==w*h)throw new Error('Haar dimensions must be powers of two');
 const a=Float64Array.from(input),tmp=new Float64Array(a.length),levels=[];
 for(let ww=w,hh=h;ww>1&&hh>1;ww/=2,hh/=2)levels.push([ww,hh]);
 if(inverse)levels.reverse();
 for(const [ww,hh] of levels){const hw=ww/2,hh2=hh/2;
  for(let y=0;y<hh2;y++)for(let x=0;x<hw;x++){
   const i=y*w+x,j=(y*2)*w+x*2;
   if(!inverse){const p=a[j],q=a[j+1],r=a[j+w],s=a[j+w+1];tmp[i]=(p+q+r+s)/2;tmp[i+hw]=(p-q+r-s)/2;tmp[i+hh2*w]=(p+q-r-s)/2;tmp[i+hh2*w+hw]=(p-q-r+s)/2;}
   else{const l=a[i],u=a[i+hw],v=a[i+hh2*w],d=a[i+hh2*w+hw];tmp[j]=(l+u+v+d)/2;tmp[j+1]=(l-u+v-d)/2;tmp[j+w]=(l+u-v-d)/2;tmp[j+w+1]=(l-u-v+d)/2;}
  }
  for(let y=0;y<hh;y++)for(let x=0;x<ww;x++)a[y*w+x]=tmp[y*w+x];
 }return a;
}
export function reflectIndex(i,n){if(n===1)return 0;const period=2*n-2,j=((i%period)+period)%period;return j<n?j:period-j;}
export const softThreshold=(v,t)=>Math.sign(v)*Math.max(0,Math.abs(v)-t);
export function remapHaar(coeff,w,h,p,channel=0){
 const out=coeff.slice();let level=1;
 for(let ww=w,hh=h;ww>1&&hh>1;ww/=2,hh/=2,level++){
  if(level<p.scale){const hw=ww/2,h2=hh/2;for(let y=0;y<hh;y++)for(let x=0;x<ww;x++)if(x>=hw||y>=h2)out[y*w+x]*=p.texture/100;continue;}
  if(level>=p.scale+p.depth)continue;
  const hw=ww/2,h2=hh/2,rotation=p.turn*Math.PI/100,cs=Math.cos(rotation),sn=Math.sin(rotation),block=2**level;
  const dx=Math.round((hash(level,1,p.seed)-.5)*p.shift/12+channel*p.split/35),dy=Math.round((hash(level,2,p.seed)-.5)*p.shift/12-channel*p.split/45);
  for(let y=0;y<h2;y++)for(let x=0;x<hw;x++){
   const sx=reflectIndex(x+dx,hw),sy=reflectIndex(y+dy,h2),j=sy*w+sx,i=y*w+x;
   const u=coeff[j+hw],v=coeff[j+h2*w],d=coeff[j+h2*w+hw],t=p.cut/100*block*.12,gain=p.gain/100;
   out[i+hw]=softThreshold(cs*u-sn*v,t)*gain;out[i+h2*w]=softThreshold(sn*u+cs*v,t)*gain;out[i+h2*w+hw]=softThreshold(d,t)*gain;
  }
 }return out;
}
export function haar(a,w,h,p){
 const g=grid(a,w,h,512),pw=2**Math.ceil(Math.log2(Math.max(2,g.w))),ph=2**Math.ceil(Math.log2(Math.max(2,g.h)));
 const transformed=g.rgb.map(channel=>{const padded=new Float64Array(pw*ph);for(let y=0;y<ph;y++)for(let x=0;x<pw;x++)padded[y*pw+x]=channel[reflectIndex(y,g.h)*g.w+reflectIndex(x,g.w)];return haarTransform(padded,pw,ph);});
 const rebuilt=transformed.map((c,i)=>haarTransform(remapHaar(c,pw,ph,p,i),pw,ph,true)),out=new Uint8ClampedArray(a.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,gx=(x+.5)*g.w/w-.5,gy=(y+.5)*g.h/h-.5;
  for(let c=0;c<3;c++){
   const base=at(g.rgb[c],g.w,g.h,gx,gy),changed=at(rebuilt[c],pw,ph,clamp(gx,0,g.w-1),clamp(gy,0,g.h-1));
   // Keep original-resolution residuals; only the selected coarse bands are edited.
   const detail=(a[i+c]/255-base)*p.texture/100;
   out[i+c]=255*(changed+detail);
  }out[i+3]=255;
 }return out;
}
