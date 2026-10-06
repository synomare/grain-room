import {fft2} from './research-spectral.js';
import {clamp,hash,sample} from './pixels.js';
export const heatStitchDefaults={cells:17,aspect:0,flip:70,mirror:3,dual:0,diffusion:200,phase:7,axes:0,repeat:1,angle:0,retain:0,stitches:0,width:2.5,seed:17};
export function stitchBits(n,p,axis){
 const mirror=!!(p.mirror&(axis?2:1)),count=mirror?Math.ceil((n+1)/2):n+1,bits=new Uint8Array(n+1);bits[0]=hash(0,axis+19,p.seed)<.5?0:1;
 for(let i=1;i<count;i++)bits[i]=bits[i-1]^(hash(i,axis+19,p.seed)<p.flip/100?1:0);
 if(mirror)for(let i=count;i<=n;i++)bits[i]=bits[n-i];return bits;
}
export function stitchPattern(n,m,p){
 const xb=stitchBits(n,p,0),yb=stitchBits(m,p,1),activity=new Uint8Array(n*m);activity[0]=1-p.dual;
 for(let y=0;y<m;y++){
  if(y)activity[y*n]=activity[(y-1)*n]^(yb[y]===0?1:0);
  for(let x=1;x<n;x++)activity[y*n+x]=activity[y*n+x-1]^(xb[x]===y%2?1:0);
 }
 return {n,m,xb,yb,activity};
}
// Weighted midpoint quadrature; a same-area disk integrates the singular
// self-cell. No heat from periodic copies is included in the finite rectangle.
export function heatKernel(dx,dy,K,lambda){
 const r=Math.hypot(dx,dy)/K;
 if(r){const q=r/lambda,e=Math.exp(-q)/(r*K*K);return [e*Math.cos(q),-e*Math.sin(q)];}
 const q=1/(Math.sqrt(Math.PI)*K*lambda),e=Math.exp(-q),u=1-e*Math.cos(q),v=e*Math.sin(q);return [Math.PI*lambda*(u+v),Math.PI*lambda*(v-u)];
}
export function heatField(pattern,K,lambda){
 const w=pattern.n*K,h=pattern.m*K,W=2**Math.ceil(Math.log2(2*w-1)),H=2**Math.ceil(Math.log2(2*h-1)),ar=new Float64Array(W*H),ai=ar.slice(),br=ar.slice(),bi=ar.slice();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)ar[y*W+x]=pattern.activity[Math.floor(y/K)*pattern.n+Math.floor(x/K)];
 for(let dy=1-h;dy<h;dy++)for(let dx=1-w;dx<w;dx++){const j=((dy+H)%H)*W+(dx+W)%W,[re,im]=heatKernel(dx,dy,K,lambda);br[j]=re;bi[j]=im;}
 fft2(ar,ai,W,H);fft2(br,bi,W,H);
 for(let i=0;i<ar.length;i++){const re=ar[i]*br[i]-ai[i]*bi[i];ai[i]=ar[i]*bi[i]+ai[i]*br[i];ar[i]=re;}fft2(ar,ai,W,H,true);
 const re=new Float64Array(w*h),im=re.slice();for(let y=0;y<h;y++)for(let x=0;x<w;x++){re[y*w+x]=ar[y*W+x];im[y*w+x]=ai[y*W+x];}return {w,h,re,im,K,lambda};
}
export function rotatedHeat(field,phase){
 const c=Math.cos(phase*Math.PI/180),s=Math.sin(phase*Math.PI/180),re=new Float64Array(field.re.length),im=re.slice();let rmin=Infinity,rmax=-Infinity,imin=Infinity,imax=-Infinity;
 for(let j=0;j<re.length;j++){re[j]=field.re[j]*c-field.im[j]*s;im[j]=field.re[j]*s+field.im[j]*c;rmin=Math.min(rmin,re[j]);rmax=Math.max(rmax,re[j]);imin=Math.min(imin,im[j]);imax=Math.max(imax,im[j]);}
 return {...field,re,im,rmin,rmax,imin,imax};
}
const odd=v=>clamp(2*Math.round((v-1)/2)+1,3,25);
export function heatScene(w,h,p){
 const longest=Math.max(w,h),r=2**(p.aspect/100),n=odd(p.cells*w/longest*r),m=odd(p.cells*h/longest/r),pattern=stitchPattern(n,m,p),field=rotatedHeat(heatField(pattern,12,p.diffusion/100),p.phase);return {pattern,field};
}
export function heatSourceCoordinates(u,v,w,h,f,axes){
 const re=sample(f.re,f.w,f.h,u*f.w-.5,v*f.h-.5,0,1),im=sample(f.im,f.w,f.h,u*f.w-.5,v*f.h-.5,0,1),x=f.rmax-f.rmin>1e-12?(re-f.rmin)/(f.rmax-f.rmin):.5,y=f.imax-f.imin>1e-12?(im-f.imin)/(f.imax-f.imin):.5;return [(axes&1?1-x:x)*(w-1),(axes&2?1-y:y)*(h-1)];
}
export function stitchCoverage(u,v,w,h,g,p){
 const {n,m,xb,yb}=g,x=u*n,y=v*m,cw=w/(n*p.repeat),ch=h/(m*p.repeat),radius=Math.max(w,h)*p.width/2000,R=radius+.5,rx=R/cw,ry=R/ch;
 let d2=Infinity;
 for(let ex=Math.max(0,Math.ceil(x-rx));ex<=Math.min(n,Math.floor(x+rx));ex++)for(let j=Math.max(0,Math.ceil(y-ry-1));j<=Math.min(m-1,Math.floor(y+ry));j++)if(xb[ex]===j%2){const dx=(x-ex)*cw,dy=(y-clamp(y,j,j+1))*ch;d2=Math.min(d2,dx*dx+dy*dy);}
 for(let ey=Math.max(0,Math.ceil(y-ry));ey<=Math.min(m,Math.floor(y+ry));ey++)for(let i=Math.max(0,Math.ceil(x-rx-1));i<=Math.min(n-1,Math.floor(x+rx));i++)if(yb[ey]===i%2){const dx=(x-clamp(x,i,i+1))*cw,dy=(y-ey)*ch;d2=Math.min(d2,dx*dx+dy*dy);}
 return clamp(R-Math.sqrt(d2),0,1);
}
export function heatStitches(a,w,h,params={}){
 const p={...heatStitchDefaults,...params};if(p.retain===100&&!p.stitches)return a.slice();const g=heatScene(w,h,p),out=new Uint8ClampedArray(a.length),theta=p.angle*Math.PI/180,c=Math.cos(theta),s=Math.sin(theta),retain=p.retain/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=x+.5-w/2,Y=y+.5-h/2,U=(c*X+s*Y)/w*p.repeat+.5,V=(-s*X+c*Y)/h*p.repeat+.5,u=U-Math.floor(U),v=V-Math.floor(V),[sx,sy]=heatSourceCoordinates(u,v,w,h,g.field,p.axes),i=(y*w+x)*4,rx=sx*(1-retain)+x*retain,ry=sy*(1-retain)+y*retain,coverage=p.stitches?stitchCoverage(u,v,w,h,g.pattern,p)*p.stitches/100:0;
  for(let k=0;k<3;k++){const value=sample(a,w,h,rx,ry,k);out[i+k]=value+(255-value)*coverage;}out[i+3]=255;
 }
 return out;
}
