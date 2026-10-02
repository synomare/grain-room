import {clamp,hash} from './pixels.js';
import {grid,at} from './research-math.js';

// Pixel-centred discrete Radon projection: linear splatting conserves mass.
export function projectField(a,w,h,angles,bins=Math.ceil(Math.hypot(w,h))+3){
 const center=(bins-1)/2,out=new Float64Array(bins*angles.length);
 for(let k=0;k<angles.length;k++){
  const cs=Math.cos(angles[k]),sn=Math.sin(angles[k]);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const t=(x-(w-1)/2)*cs+(y-(h-1)/2)*sn+center,j=Math.floor(t),f=t-j,v=a[y*w+x];
   if(j>=0&&j<bins)out[k*bins+j]+=v*(1-f);
   if(j+1>=0&&j+1<bins)out[k*bins+j+1]+=v*f;
  }
 }return {data:out,bins,angles};
}
// Across pi the detector axis reverses: P(theta+pi,t)=P(theta,-t).
export function projectionAt(s,angleIndex,t){
 const n=s.angles.length,b=s.bins,base=Math.floor(angleIndex),f=angleIndex-base;
 const row=(k)=>{const turns=Math.floor(k/n),r=((k%n)+n)%n,tt=turns%2?b-1-t:t;if(tt<0||tt>b-1)return 0;const j=Math.floor(tt),q=tt-j;return s.data[r*b+j]*(1-q)+s.data[r*b+Math.min(b-1,j+1)]*q;};
 return row(base)*(1-f)+row(base+1)*f;
}
export function backproject(s,x,y){let v=0;for(let k=0;k<s.angles.length;k++)v+=projectionAt(s,k,x*Math.cos(s.angles[k])+y*Math.sin(s.angles[k])+(s.bins-1)/2);return v/s.angles.length;}

export function radon(a,w,h,p){
 const g=grid(a,w,h,224),long=Math.max(g.w,g.h),rotation=p.angle*Math.PI/180+(hash(1,7,p.seed)-.5)*.18;
 const angles=Array.from({length:p.views},(_,k)=>rotation+k*Math.PI/p.views);
 const fields=g.rgb.map(channel=>{
  const density=Float64Array.from(channel,v=>1-v),s=projectField(density,g.w,g.h,angles),b=s.bins,raw=s.data.slice();
  // A local detector high-pass is an artistic trace, NOT a ramp reconstruction filter.
  const radius=Math.max(1,Math.round(b*.018));
  for(let k=0;k<angles.length;k++)for(let j=0;j<b;j++){
   const v=raw[k*b+j],left=raw[k*b+Math.max(0,j-radius)],right=raw[k*b+Math.min(b-1,j+radius)];
   s.data[k*b+j]=(v+p.trace/100*12*(2*v-left-right))/long;
  }return s;
 });
 // Sparse reconstruction is bounded to the same field, then sampled at output size.
 const rebuilt=p.layout===2?fields.map(s=>{const f=new Float32Array(g.w*g.h);for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++)f[y*g.w+x]=backproject(s,x-(g.w-1)/2,y-(g.h-1)/2);return f;}):null;
 const out=new Uint8ClampedArray(a.length),aspect=w/h,zoom=p.zoom/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,nx=(x+.5)/w-.5,ny=(y+.5)/h-.5,b=fields[0].bins;
  let ai=(ny+.5)*p.views*p.turns,det=(nx/zoom+.5)*(b-1),centerBlend=1;
  if(p.layout===1){const xx=nx*Math.min(1,aspect),yy=ny*Math.min(1,1/aspect),r=Math.hypot(xx,yy);ai=(Math.atan2(yy,xx)/Math.PI+1)*p.views*p.turns;det=(.5+r/zoom)*(b-1);centerBlend=clamp(r/.035,0,1);centerBlend=centerBlend*centerBlend*(3-2*centerBlend);}
  for(let c=0;c<3;c++){
   let v=rebuilt?at(rebuilt[c],g.w,g.h,(nx/zoom+.5)*g.w-.5,(ny/zoom+.5)*g.h-.5):projectionAt(fields[c],ai,det);
   if(centerBlend<1)v=v*centerBlend+projectionAt(fields[c],0,(b-1)/2)*(1-centerBlend);
   const density=clamp(v*p.exposure/35,0,8),ink=Math.exp(-density),paper=p.paper/100;
   const tone=paper*ink+(1-paper)*(1-ink),photo=a[i+c]/255;
   out[i+c]=255*(tone*(1-p.memory/100)+photo*p.memory/100);
  }out[i+3]=255;
 }return out;
}
