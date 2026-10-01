// Shared coordinates: spatial controls are measured against a 1000px long edge.
export const clamp=(v,a=0,b=255)=>Math.min(b,Math.max(a,v));
export const hash=(x,y,s=17)=>{let n=Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^Math.imul(s,1274126177);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
export function sample(a,w,h,x,y,c=0,stride=4){
 x=clamp(x,0,w-1);y=clamp(y,0,h-1);
 const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(ix+1,w-1),jy=Math.min(iy+1,h-1),fx=x-ix,fy=y-iy;
 return (a[(iy*w+ix)*stride+c]*(1-fx)+a[(iy*w+jx)*stride+c]*fx)*(1-fy)+(a[(jy*w+ix)*stride+c]*(1-fx)+a[(jy*w+jx)*stride+c]*fx)*fy;
}
export const lum=(a,i)=>a[i]*.2126+a[i+1]*.7152+a[i+2]*.0722;
export function field(a,w,h,edge=192){
 const r=edge/Math.max(w,h),fw=Math.max(2,Math.round(w*r)),fh=Math.max(2,Math.round(h*r)),v=new Float32Array(fw*fh);
 for(let y=0;y<fh;y++)for(let x=0;x<fw;x++)v[y*fw+x]=(sample(a,w,h,x/r,y/r,0)*.2126+sample(a,w,h,x/r,y/r,1)*.7152+sample(a,w,h,x/r,y/r,2)*.0722)/255;
 return {w:fw,h:fh,v};
}
export function warp(a,w,h,coordinate){
 const out=new Uint8ClampedArray(a.length),xy=[0,0];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  coordinate(x,y,xy);const i=(y*w+x)*4;
  for(let c=0;c<3;c++)out[i+c]=sample(a,w,h,xy[0],xy[1],c);
  out[i+3]=255;
 }return out;
}
export function map(a,w,h,fn){
 const out=new Uint8ClampedArray(a.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;fn(out,i,x,y);out[i+3]=255;}return out;
}
