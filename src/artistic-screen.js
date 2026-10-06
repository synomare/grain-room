// Original, raster-calibrated contour family. This is not the 1995 contour editor.
export const SCREEN_SIDE=64;
export const SCREEN_STEPS=256;
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
export const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
export const srgb=v=>v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055;
const lut=Float64Array.from({length:256},(_,i)=>linear(i/255));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
function hook(x,y){
 const r=.27,angle=Math.atan2(y,x),end=.72;
 if(Math.abs(angle)>=end)return Math.abs(Math.hypot(x,y)-r);
 return Math.min(Math.hypot(x-r*Math.cos(end),y-r*Math.sin(end)),Math.hypot(x-r*Math.cos(end),y+r*Math.sin(end)));
}
const fields=Array.from({length:SCREEN_SIDE**2},(_,i)=>{
 const x=(i%SCREEN_SIDE+.5)/SCREEN_SIDE-.5,y=(Math.floor(i/SCREEN_SIDE)+.5)/SCREEN_SIDE-.5;
 return [hook(x+.035,y),Math.min(Math.abs(Math.hypot(x+.5,y+.5)-.5),Math.abs(Math.hypot(x-.5,y-.5)-.5)),-hook(-x+.07,-y+.035)];
});
const banks=new Map();
export function screenFamily(transition=50){
 transition=Math.round(clamp(transition,0,100));
 if(banks.has(transition))return banks.get(transition);
 const masks=[],coverage=[],n=SCREEN_SIDE**2;
 for(let step=0;step<=SCREEN_STEPS;step++){
  const d=step/SCREEN_STEPS,t=clamp(d+(50-transition)*.006),a=smooth((t-.12)/.38),b=smooth((t-.48)/.38);
  const scores=fields.map(f=>(1-b)*((1-a)*f[0]+a*f[1])+b*f[2]);
  // Calibrate each authored state independently; NEVER reorder the tone sequence.
  // Stable raster-index ties. Exactly round(d*N) equal-area texels receive ink.
  const order=Array.from({length:n},(_,i)=>i).sort((i,j)=>scores[i]-scores[j]||i-j);
  const mask=new Uint8Array(n),count=Math.round(d*n);for(let j=0;j<count;j++)mask[order[j]]=1;
  masks.push(mask);coverage.push(count/n);
 }
 const family={masks,coverage};if(banks.size>=2)banks.delete(banks.keys().next().value);banks.set(transition,family);return family;
}
export function coverageColor(coverage,ink=0,paper=255){return Math.round(255*srgb(lut[paper]*(1-coverage)+lut[ink]*coverage));}
export function artisticScreen(a,w,h,p){
 const pitch=p.size*Math.max(w,h)/1000,angle=p.angle*Math.PI/180,co=Math.cos(angle)/pitch,si=Math.sin(angle)/pitch;
 const corners=[[0,0],[w,0],[0,h],[w,h]].map(([x,y])=>[x*co+y*si,-x*si+y*co]);
 const ox=Math.floor(Math.min(...corners.map(c=>c[0])))-1,oy=Math.floor(Math.min(...corners.map(c=>c[1])))-1;
 const cols=Math.ceil(Math.max(...corners.map(c=>c[0])))-ox+2,rows=Math.ceil(Math.max(...corners.map(c=>c[1])))-oy+2;
 const sums=new Float64Array(cols*rows),counts=new Uint32Array(sums.length),tones=new Uint16Array(sums.length);
 const offsets=[];for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){const x=(sx+.5)/4,y=(sy+.5)/4;offsets.push([x*co+y*si,-x*si+y*co]);}
 // Pixel-constant source, 4x4 midpoint area quadrature into affine lattice cells.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,L=.2126*lut[a[i]]+.7152*lut[a[i+1]]+.0722*lut[a[i+2]],u=x*co+y*si,v=-x*si+y*co;
  for(const [du,dv] of offsets){const j=(Math.floor(v+dv)-oy)*cols+Math.floor(u+du)-ox;sums[j]+=L;counts[j]++;}
 }
 const ink=Math.round(p.ink*2.55),paper=Math.round(p.paper*2.55),li=lut[ink],lp=lut[paper];
 for(let j=0;j<sums.length;j++)if(counts[j])tones[j]=Math.round(clamp((lp-sums[j]/counts[j])/(lp-li||1))*SCREEN_STEPS);
 const {masks}=screenFamily(p.transition),out=new Uint8ClampedArray(a.length),colors=Uint8Array.from({length:17},(_,k)=>coverageColor(k/16,ink,paper));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const u=x*co+y*si,v=-x*si+y*co;let covered=0;
  for(const [du,dv] of offsets){const U=u+du,V=v+dv,cx=Math.floor(U),cy=Math.floor(V),j=(cy-oy)*cols+cx-ox;
   covered+=masks[tones[j]][Math.floor((V-cy)*SCREEN_SIDE)*SCREEN_SIDE+Math.floor((U-cx)*SCREEN_SIDE)];
  }
  const i=(y*w+x)*4;out[i]=out[i+1]=out[i+2]=colors[covered];out[i+3]=255;
 }return out;
}
