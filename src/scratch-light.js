import {clamp,hash,sample} from './pixels.js';
import {linearSpeckleGuide,toLinear,toEncoded} from './speckle-field.js';

export const SCRATCH_EDGE=256, SCRATCH_EXTENT=100;
const TAU=2*Math.PI;
const nodes=[-.9602898564975363,-.7966664774136267,-.525532409916329,-.1834346424956498,.1834346424956498,.525532409916329,.7966664774136267,.9602898564975363];
const weights=[.1012285362903763,.2223810344533745,.3137066458778873,.362683783378362,.362683783378362,.3137066458778873,.2223810344533745,.1012285362903763];
const waves=Array.from({length:9},(_,i)=>.4+i*.0375);
const sensor=waves.map(l=>[Math.exp(-.5*((l-.625)/.052)**2),Math.exp(-.5*((l-.535)/.047)**2),Math.exp(-.5*((l-.445)/.043)**2)]);
const sensorSum=[0,1,2].map(c=>sensor.reduce((s,r)=>s+r[c],0));
const linear=Float64Array.from({length:256},(_,i)=>toLinear(i/255));
export const sinc=x=>Math.abs(x)<1e-7?1-x*x/6:Math.sin(x)/x;
export function scratchProfile(width,depth,bitangentFrequency,wavelength,path){
 const amplitude=width*sinc(Math.PI*width*bitangentFrequency),phase=TAU*path*depth/wavelength;
 return [amplitude*(1-Math.cos(phase)),-amplitude*Math.sin(phase)];
}

// Finite Gaussian-windowed line integral in scratch tangent coordinates.
// Composite eight-point Gauss quadrature resolves both the Gaussian and phase.
export function gaussianScratchLine(length,sigma,frequency,u=0){
 const a=Math.max(-length/2-u,-6*sigma),b=Math.min(length/2-u,6*sigma);
 if(b<=a)return [0,0];
 const pieces=Math.max(1,Math.ceil((b-a)*(1/(2*sigma)+Math.abs(frequency)/2))),step=(b-a)/pieces;
 let re=0,im=0;
 for(let j=0;j<pieces;j++){const mid=a+(j+.5)*step,half=step/2;
  for(let k=0;k<8;k++){const t=mid+half*nodes[k],v=half*weights[k]*Math.exp(-t*t/(2*sigma*sigma)),phase=-TAU*frequency*t;re+=v*Math.cos(phase);im+=v*Math.sin(phase);}
 }
 return [re,im];
}

export function scratchLineTable(length,sigma,frequency){
 const extent=length/2+4*sigma,n=Math.max(48,Math.ceil(extent*2*Math.max(6/sigma,Math.abs(frequency)*12))),re=new Float64Array(n+1),im=re.slice();
 for(let j=0;j<=n;j++){const value=gaussianScratchLine(length,sigma,frequency,(j/n*2-1)*extent);re[j]=value[0];im[j]=value[1];}
 return {extent,n,re,im};
}
export function sampleScratchLine(table,u){
 const x=(u/table.extent+1)*table.n/2;
 if(x<0||x>table.n)return [0,0];
 const j=Math.min(table.n-1,Math.floor(x)),t=x-j;
 const interpolate=a=>{
  const A=a[Math.max(0,j-1)],B=a[j],C=a[j+1],D=a[Math.min(table.n,j+2)];
  return .5*(2*B+(-A+C)*t+(2*A-5*B+4*C-D)*t*t+(-A+3*B-3*C+D)*t*t*t);
 };
 return [interpolate(table.re),interpolate(table.im)];
}

export function scratchGeometry(guide,p){
 const long=Math.max(guide.w,guide.h),W=SCRATCH_EXTENT*guide.w/long,H=SCRATCH_EXTENT*guide.h/long,scratches=[];
 for(let attempt=0;scratches.length<p.count;attempt++){
  const x=hash(attempt,31,p.seed)*W,y=hash(attempt,67,p.seed)*H,X=x/W*guide.w-.5,Y=y/H*guide.h-.5;
  const luminance=.2126*sample(guide.rgb,guide.w,guide.h,X,Y,0,3)+.7152*sample(guide.rgb,guide.w,guide.h,X,Y,1,3)+.0722*sample(guide.rgb,guide.w,guide.h,X,Y,2,3);
  const probability=1-p.follow/100+p.follow/100*(.15+.85*luminance);
  if(hash(attempt,109,p.seed)>probability)continue;
  const group=Math.min(23,Math.floor(hash(attempt,151,p.seed)*24)),bin=Math.min(2,Math.floor(hash(attempt,179,p.seed)*3));
  const angle=(p.direction+(group/23-.5)*p.scatter*1.8)*Math.PI/180,length=p.length/10*(.7+.3*bin);
  scratches.push({x,y,group,bin,angle,tx:Math.cos(angle),ty:Math.sin(angle),length,width:p.width/1000*(.75+.5*hash(attempt,211,p.seed)),depth:p.depth/1000*(.75+.5*hash(attempt,251,p.seed))});
 }
 return {W,H,scratches};
}

export function scratchLightPlan(a,w,h,p,{edge=SCRATCH_EDGE,coherent=true,spatialSamples=2}={}){
 const guide=linearSpeckleGuide(a,w,h,edge),geometry=scratchGeometry(guide,p),{W,H,scratches}=geometry;
 const sigma=.25+p.coherence/100*1.75,theta=p.tilt*Math.PI/180,azimuth=p.light*Math.PI/180,qx=Math.sin(theta)*Math.cos(azimuth),qy=Math.sin(theta)*Math.sin(azimuth),gamma=Math.cos(theta),path=1+gamma;
 const fields=[0,1,2].map(()=>new Float64Array(guide.w*guide.h)),tables=new Map();
 for(let k=0;k<waves.length;k++){
  const lambda=waves[k],base=2*Math.PI*sigma*sigma*Math.exp(-2*Math.PI*Math.PI*sigma*sigma*(qx*qx+qy*qy)/(lambda*lambda));
  // Pixel samples are converted to intensities before averaging. The same
  // geometry and coherent profile sums are used for every spatial sample.
  for(let sy=0;sy<spatialSamples;sy++)for(let sx=0;sx<spatialSamples;sx++){
  const re=new Float64Array(guide.w*guide.h).fill(base),im=re.map(()=>0),isolated=re.map(()=>base*base);
  for(const s of scratches){
   const qt=(qx*s.tx+qy*s.ty)/lambda,qb=(-qx*s.ty+qy*s.tx)/lambda,key=s.length+':'+qt;
   let table=tables.get(key);if(!table){table=scratchLineTable(s.length,sigma,qt);tables.set(key,table);}
   const [pr,pi]=scratchProfile(s.width,s.depth,qb,lambda,path);
   const rx=Math.abs(s.tx)*s.length/2+4*sigma,ry=Math.abs(s.ty)*s.length/2+4*sigma;
   const x0=Math.max(0,Math.floor((s.x-rx)/W*guide.w-.5)),x1=Math.min(guide.w-1,Math.ceil((s.x+rx)/W*guide.w-.5));
   const y0=Math.max(0,Math.floor((s.y-ry)/H*guide.h-.5)),y1=Math.min(guide.h-1,Math.ceil((s.y+ry)/H*guide.h-.5));
   for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const dx=(x+(sx+.5)/spatialSamples)/guide.w*W-s.x,dy=(y+(sy+.5)/spatialSamples)/guide.h*H-s.y,u=dx*s.tx+dy*s.ty,v=-dx*s.ty+dy*s.tx;
    if(Math.abs(v)>4*sigma)continue;
    const [jr,ji]=sampleScratchLine(table,u),amplitude=Math.exp(-v*v/(2*sigma*sigma)),phi=TAU*qb*v,cr=Math.cos(phi),ci=Math.sin(phi);
    const er=amplitude*(jr*cr-ji*ci),ei=amplitude*(jr*ci+ji*cr),sr=pr*er-pi*ei,si=pr*ei+pi*er,i=y*guide.w+x;
    re[i]-=sr;im[i]-=si;isolated[i]+=sr*sr+si*si;
   }
  }
  const factor=gamma/(Math.PI*sigma*sigma*lambda*lambda*spatialSamples*spatialSamples);
  for(let i=0;i<re.length;i++){const intensity=factor*(coherent?re[i]*re[i]+im[i]*im[i]:isolated[i]);for(let c=0;c<3;c++)fields[c][i]+=intensity*sensor[k][c]/sensorSum[c];}
  }
 }
 return {w:guide.w,h:guide.h,fields,geometry,sigma,qx,qy,gamma,tables:tables.size,coherent,spatialSamples};
}

export function renderScratchLightPlan(a,w,h,plan,p){
 const out=new Uint8ClampedArray(a.length),amount=p.amount/100,photo=p.photo/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,X=(x+.5)*plan.w/w-.5,Y=(y+.5)*plan.h/h-.5;
  for(let c=0;c<3;c++){const original=linear[a[i+c]],intensity=sample(plan.fields[c],plan.w,plan.h,X,Y,0,1),light=1-Math.exp(-Math.max(0,intensity)*.22),target=original*photo+light;out[i+c]=255*toEncoded(clamp(original*(1-amount)+target*amount,0,1));}out[i+3]=255;
 }
 return out;
}
export function scratchLight(a,w,h,p){if(p.amount===0)return new Uint8ClampedArray(a);return renderScratchLightPlan(a,w,h,scratchLightPlan(a,w,h,p),p);}
