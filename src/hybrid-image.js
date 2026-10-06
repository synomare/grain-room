import {sample,clamp} from './pixels.js';
export const hybridDefaults={farCut:16,nearCut:64,farGain:70,nearGain:110,farColour:100,nearColour:0,zoom:100,turn:0,offsetX:0,offsetY:0,mirror:1,viewBand:0};
const reflected=(i,n)=>{const t=((i%(2*n))+2*n)%(2*n);return t<n?t:2*n-1-t;};
export function gaussianBoxes(sigma){
 if(sigma<=0)return [0,0,0];let lower=Math.floor(Math.sqrt(4*sigma*sigma+1));if(lower%2===0)lower--;lower=Math.max(1,lower);const upper=lower+2,m=clamp(Math.round((12*sigma*sigma-3*lower*lower-12*lower-9)/(-4*lower-4)),0,3);return [0,1,2].map(i=>((i<m?lower:upper)-1)/2);
}
export function nativeBoxPass(input,out,w,h,r,horizontal){
 if(r===0){out.set(input);return;}const count=horizontal?h:w,length=horizontal?w:h,stride=horizontal?1:w,den=2*r+1;
 for(let line=0;line<count;line++){
  const start=horizontal?line*w:line;let sum=0;for(let k=-r;k<=r;k++)sum+=input[start+reflected(k,length)*stride];
  for(let t=0;t<length;t++){out[start+t*stride]=sum/den;sum+=input[start+reflected(t+r+1,length)*stride]-input[start+reflected(t-r,length)*stride];}
 }
}
export function nativeGaussian(input,scratch,w,h,sigma){
 for(const r of gaussianBoxes(sigma)){nativeBoxPass(input,scratch,w,h,r,true);nativeBoxPass(scratch,input,w,h,r,false);}return input;
}
export function hybridMapping(x,y,w,h,source,p){
 const ca=Math.cos(p.turn*Math.PI/180),sa=Math.sin(p.turn*Math.PI/180),ratio=Math.min(source.w/w,source.h/h)*100/p.zoom,xx=(x+.5-w/2)*ratio,yy=(y+.5-h/2)*ratio;
 // Centre-cover sampling keeps the source aspect ratio; mirror precedes rotation.
 const sx=(p.mirror?-xx:xx)*ca-yy*sa+source.w*(.5+p.offsetX/200)-.5,sy=(p.mirror?-xx:xx)*sa+yy*ca+source.h*(.5+p.offsetY/200)-.5;
 return{x:sx,y:sy};
}
export function hybridImage(a,w,h,p={},near=null){
 const q={...hybridDefaults,...p},b=near||{pixels:a,w,h},n=w*h,lo=new Float32Array(n),hi=new Float32Array(n),scratch=new Float32Array(n),out=new Uint8ClampedArray(n*4),sigmaFar=Math.sqrt(2*Math.log(2))/(2*Math.PI*q.farCut)*Math.max(w,h),sigmaNear=Math.sqrt(2*Math.log(2))/(2*Math.PI*q.nearCut)*Math.max(w,h);
 const ca=Math.cos(q.turn*Math.PI/180),sa=Math.sin(q.turn*Math.PI/180),ratio=Math.min(b.w/w,b.h/h)*100/q.zoom,sign=q.mirror?-1:1,ax=sign*ca*ratio,ay=-sa*ratio,bx=sign*sa*ratio,by=ca*ratio,ox=b.w*(.5+q.offsetX/200)-.5+(.5-w/2)*ax+(.5-h/2)*ay,oy=b.h*(.5+q.offsetY/200)-.5+(.5-w/2)*bx+(.5-h/2)*by;
 const farAt=(i,c)=>{if(q.farColour===100)return a[i+c]/255;const l=(a[i]*.2126+a[i+1]*.7152+a[i+2]*.0722)/255;return l+(a[i+c]/255-l)*q.farColour/100;};
 const nearAt=(x,y,c)=>{const sx=x*ax+y*ay+ox,sy=x*bx+y*by+oy;if(q.nearColour===100)return sample(b.pixels,b.w,b.h,sx,sy,c)/255;const r=sample(b.pixels,b.w,b.h,sx,sy,0)/255,g=sample(b.pixels,b.w,b.h,sx,sy,1)/255,bb=sample(b.pixels,b.w,b.h,sx,sy,2)/255,l=r*.2126+g*.7152+bb*.0722;return l+([r,g,bb][c]-l)*q.nearColour/100;};
 for(let c=0;c<3;c++){
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=y*w+x;lo[j]=farAt(j*4,c);hi[j]=nearAt(x,y,c);}
  nativeGaussian(lo,scratch,w,h,sigmaFar);nativeGaussian(hi,scratch,w,h,sigmaNear);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=y*w+x,low=.5+(lo[j]-.5)*q.farGain/100,high=(nearAt(x,y,c)-hi[j])*q.nearGain/100;
   const value=q.viewBand===1?low:q.viewBand===2?.5+high:low+high;out[j*4+c]=value*255;out[j*4+3]=255;
  }
 }
 return out;
}
