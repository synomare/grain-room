import {clamp,sample,lum} from './pixels.js';
export function grid(a,w,h,edge=384){
 const factor=Math.min(1,edge/Math.max(w,h)),gw=Math.max(1,Math.round(w*factor)),gh=Math.max(1,Math.round(h*factor)),rgb=[0,1,2].map(()=>new Float32Array(gw*gh)),l=new Float32Array(gw*gh);
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){const i=y*gw+x;for(let c=0;c<3;c++)rgb[c][i]=sample(a,w,h,(x+.5)/factor-.5,(y+.5)/factor-.5,c)/255;l[i]=.2126*rgb[0][i]+.7152*rgb[1][i]+.0722*rgb[2][i];}
 return {w:gw,h:gh,rgb,l};
}
export const at=(a,w,h,x,y)=>sample(a,w,h,x,y,0,1);
export function blur(a,w,h,r){
 r=Math.max(0,Math.round(r));if(!r)return a.slice();
 const tmp=new Float32Array(a.length),out=new Float32Array(a.length),den=2*r+1;
 for(let y=0;y<h;y++){let sum=0;for(let k=-r;k<=r;k++)sum+=a[y*w+clamp(k,0,w-1)];for(let x=0;x<w;x++){tmp[y*w+x]=sum/den;sum+=a[y*w+clamp(x+r+1,0,w-1)]-a[y*w+clamp(x-r,0,w-1)];}}
 for(let x=0;x<w;x++){let sum=0;for(let k=-r;k<=r;k++)sum+=tmp[clamp(k,0,h-1)*w+x];for(let y=0;y<h;y++){out[y*w+x]=sum/den;sum+=tmp[clamp(y+r+1,0,h-1)*w+x]-tmp[clamp(y-r,0,h-1)*w+x];}}
 return out;
}
export function gaussianBlur(a,w,h,sigma){
 if(sigma<=.01)return a.slice();const r=Math.ceil(sigma*3),k=new Float32Array(r*2+1);let total=0;
 for(let i=-r;i<=r;i++){k[i+r]=Math.exp(-i*i/(2*sigma*sigma));total+=k[i+r];}for(let i=0;i<k.length;i++)k[i]/=total;
 const tmp=new Float32Array(a.length),out=new Float32Array(a.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let d=-r;d<=r;d++)sum+=a[y*w+clamp(x+d,0,w-1)]*k[d+r];tmp[y*w+x]=sum;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let d=-r;d<=r;d++)sum+=tmp[clamp(y+d,0,h-1)*w+x]*k[d+r];out[y*w+x]=sum;}
 return out;
}
export function tensor(g,radius=3){
 const {w,h,l}=g,n=w*h;let xx=new Float32Array(n),yy=new Float32Array(n),xy=new Float32Array(n);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,gx=at(l,w,h,x+1,y)-at(l,w,h,x-1,y),gy=at(l,w,h,x,y+1)-at(l,w,h,x,y-1);xx[i]=gx*gx;yy[i]=gy*gy;xy[i]=gx*gy;}
 xx=blur(xx,w,h,radius);yy=blur(yy,w,h,radius);xy=blur(xy,w,h,radius);
 const angle=new Float32Array(n),coherence=new Float32Array(n),tx=new Float32Array(n),ty=new Float32Array(n);
 for(let i=0;i<n;i++){angle[i]=.5*Math.atan2(2*xy[i],xx[i]-yy[i])+Math.PI/2;coherence[i]=Math.hypot(xx[i]-yy[i],2*xy[i])/(xx[i]+yy[i]+1e-8);tx[i]=Math.cos(angle[i]);ty[i]=Math.sin(angle[i]);}
 return {angle,coherence,tx,ty};
}
export function expand(rgb,gw,gh,w,h){
 const o=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;for(let c=0;c<3;c++)o[i+c]=at(rgb[c],gw,gh,(x+.5)*gw/w-.5,(y+.5)*gh/h-.5)*255;o[i+3]=255;}return o;
}
export function addBilinear(a,w,h,x,y,value){
 if(x<0||y<0||x>w-1||y>h-1)return;
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,jx=Math.min(w-1,ix+1),jy=Math.min(h-1,iy+1);
 a[iy*w+ix]+=value*(1-fx)*(1-fy);a[iy*w+jx]+=value*fx*(1-fy);a[jy*w+ix]+=value*(1-fx)*fy;a[jy*w+jx]+=value*fx*fy;
}
