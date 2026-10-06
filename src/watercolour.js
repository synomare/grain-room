import {hash,clamp,sample} from './pixels.js';
import {linearSpeckleGuide,toLinear,toEncoded,reflectIndex} from './speckle-field.js';

export const WATERCOLOUR_EDGE=256;
const linear=Float64Array.from({length:256},(_,i)=>toLinear(i/255));
const density=Float64Array.from(linear,v=>-.5*Math.log(Math.max(.002,v)));
const sum=a=>a.reduce((s,v)=>s+v,0);
const smooth=x=>x*x*(3-2*x);
const noise=(x,y,seed)=>{const X=Math.floor(x),Y=Math.floor(y),u=smooth(x-X),v=smooth(y-Y);return (hash(X,Y,seed)*(1-u)+hash(X+1,Y,seed)*u)*(1-v)+(hash(X,Y+1,seed)*(1-u)+hash(X+1,Y+1,seed)*u)*v;};

// Four synthetic absorbing pigments, not measured paint spectra. Neutral black
// is separated before the user chooses how much of it to leave on the paper.
export function separateWashPigments(rgb,key=0){
 const n=rgb.length/3,fields=Array.from({length:4},()=>new Float64Array(n));
 for(let i=0;i<n;i++){
  const q=[0,1,2].map(c=>-.5*Math.log(Math.max(.002,rgb[i*3+c]))),neutral=Math.min(...q);
  for(let c=0;c<3;c++)fields[c][i]=q[c]-neutral;
  fields[3][i]=neutral*(1-key/100);
 }return fields;
}
export function washPaper(w,h,p){
 const height=new Float64Array(w*h),capacity=height.slice(),period=Math.max(.75,p.scale*Math.max(w,h)/1000);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,z=.7*noise(x/period,y/period,p.seed)+.3*noise(x/(period*3.1)+11,y/(period*3.1)+7,p.seed+53);
  height[i]=z;capacity[i]=.18+.3*z;
 }return {height,capacity};
}
export function washGraph(w,h){
 const a=[],b=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x+1<w){a.push(i);b.push(i+1);}if(y+1<h){a.push(i);b.push(i+w);}}
 return {a:Int32Array.from(a),b:Int32Array.from(b),n:w*h};
}

// Proposals are signed from a to b. All donor and receiver limits refer to the
// same snapshot; a traversal cannot reuse water that arrived during this step.
export function limitWashFlux(values,graph,proposed,capacity=null,fraction=.65){
 const outgoing=new Float64Array(graph.n),incoming=outgoing.slice(),actual=proposed.slice();
 for(let k=0;k<actual.length;k++){const q=actual[k],donor=q>=0?graph.a[k]:graph.b[k],receiver=q>=0?graph.b[k]:graph.a[k];outgoing[donor]+=Math.abs(q);incoming[receiver]+=Math.abs(q);}
 for(let k=0;k<actual.length;k++){
  const q=actual[k],donor=q>=0?graph.a[k]:graph.b[k],receiver=q>=0?graph.b[k]:graph.a[k];
  const d=outgoing[donor]?Math.min(1,Math.max(0,values[donor])*fraction/outgoing[donor]):1;
  const r=capacity&&incoming[receiver]?Math.min(1,Math.max(0,capacity[receiver]-values[receiver])/incoming[receiver]):1;
  actual[k]*=Math.min(d,r);
 }return actual;
}
export function applyWashFlux(values,graph,flux){const out=values.slice();for(let k=0;k<flux.length;k++){out[graph.a[k]]-=flux[k];out[graph.b[k]]+=flux[k];}return out;}
export function moveWashWater(water,pigment,mask,paper,graph,mobility=.22,previous=null){
 const proposed=new Float64Array(graph.a.length);
 for(let k=0;k<proposed.length;k++){const i=graph.a[k],j=graph.b[k];if(mask[i]&&mask[j])proposed[k]=(previous?previous[k]*.82:0)+mobility*(water[i]-water[j]+.08*(paper[i]-paper[j]));}
 const flux=limitWashFlux(water,graph,proposed),carried=flux.slice();
 for(let k=0;k<carried.length;k++){const donor=flux[k]>=0?graph.a[k]:graph.b[k];carried[k]=water[donor]>1e-14?flux[k]*pigment[donor]/water[donor]:0;}
 return {water:applyWashFlux(water,graph,flux),pigment:applyWashFlux(pigment,graph,carried),flux};
}
export function moveCapillaryWater(saturation,capacity,graph,rate){
 const proposed=new Float64Array(graph.a.length);
 for(let k=0;k<proposed.length;k++){const i=graph.a[k],j=graph.b[k];proposed[k]=rate*Math.min(capacity[i],capacity[j])*(saturation[i]/capacity[i]-saturation[j]/capacity[j]);}
 const flux=limitWashFlux(saturation,graph,proposed,capacity);
 return applyWashFlux(saturation,graph,flux);
}
export function transferWashPigment(g,d,mask,height,water,{rho=.04,stain=8,granulation=.7}={}){
 const floating=g.slice(),deposited=d.slice();
 for(let i=0;i<g.length;i++)if(mask[i]){
  if(water[i]<1e-6){deposited[i]+=floating[i];floating[i]=0;continue;}
  const down=Math.min(g[i],g[i]*rho*(1-height[i]*granulation));
  const up=Math.min(d[i],d[i]*rho/stain*(1+(height[i]-1)*granulation)*water[i]/(water[i]+.2));
  floating[i]+=up-down;deposited[i]+=down-up;
 }return {floating,deposited};
}
export function washBoundary(mask,w,h,radius){
 const pitch=w+1,integral=new Float64Array((w+1)*(h+1)),out=new Float64Array(w*h);
 for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=mask[y*w+x];integral[(y+1)*pitch+x+1]=integral[y*pitch+x+1]+row;}}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(mask[y*w+x]){
  const x0=Math.max(0,x-radius),x1=Math.min(w,x+radius+1),y0=Math.max(0,y-radius),y1=Math.min(h,y+radius+1);
  out[y*w+x]=1-(integral[y1*pitch+x1]-integral[y0*pitch+x1]-integral[y1*pitch+x0]+integral[y0*pitch+x0])/((x1-x0)*(y1-y0));
 }return out;
}

export function washRewet(target,w,h,p,layer=0){
 const water=new Float64Array(w*h),S=Math.max(w,h),radius=Math.max(1,S*(.04+.05*p.spread/100)),count=3;
 if(p.rewet===0||sum(target)<1e-12)return water;
 for(let k=0;k<count;k++){
  let center=0,best=-1;
  for(let trial=0;trial<12;trial++){const i=Math.floor(hash(k+layer*19,trial+59,p.seed)*target.length)%target.length,score=target[i];if(score>best){center=i;best=score;}}
  if(best<.12)continue;
  const cx=center%w,cy=Math.floor(center/w);
  for(let y=Math.max(0,Math.floor(cy-3*radius));y<Math.min(h,Math.ceil(cy+3*radius+1));y++)for(let x=Math.max(0,Math.floor(cx-3*radius));x<Math.min(w,Math.ceil(cx+3*radius+1));x++)water[y*w+x]+=p.rewet/100*2.5*Math.exp(-((x-cx)**2+(y-cy)**2)/(2*radius*radius));
 }return water;
}

export function simulateWash(target,w,h,p,{paper=washPaper(w,h,p),layer=0,steps=p.time,rewetStep=Math.floor(p.time*.45)}={}){
 const n=w*h,graph=washGraph(w,h),mask=Uint8Array.from(target,v=>v>.12);
 let water=Float64Array.from(mask,v=>v*(.2+1.8*p.water/100)),saturation=Float64Array.from(paper.capacity,c=>c*(p.damp??0)*.0044),g=Float64Array.from(target,(v,i)=>mask[i]?v*.9:0),d=Float64Array.from(target,(v,i)=>mask[i]?v*.1:v),boundary=washBoundary(mask,w,h,Math.max(1,Math.round(Math.max(w,h)*.014))),flow=new Float64Array(graph.a.length);
 const initialPigment=sum(target),initialWater=sum(water)+sum(saturation),rewet=washRewet(target,w,h,p,layer),rho=[.04,.052,.029,.045][layer],stain=1.5+p.stain*.16,granulation=p.granulation/100,capRate=p.spread*.0025,absorbRate=p.absorb*.00065;
 let addedWater=0,evaporated=0,changed=false;
 for(let t=0;t<steps;t++){
  if(t===rewetStep&&p.rewet>0){for(let i=0;i<n;i++){water[i]+=rewet[i];addedWater+=rewet[i];if(rewet[i]>.001&&!mask[i]){mask[i]=1;changed=true;}}}
  if(changed){boundary=washBoundary(mask,w,h,Math.max(1,Math.round(Math.max(w,h)*.014)));changed=false;}
  const moved=moveWashWater(water,g,mask,paper.height,graph,.045,flow);water=moved.water;g=moved.pigment;flow=moved.flux;
  const adsorbed=transferWashPigment(g,d,mask,paper.height,water,{rho,stain,granulation});g=adsorbed.floating;d=adsorbed.deposited;
  for(let i=0;i<n;i++){
   const take=Math.min(water[i],Math.max(0,paper.capacity[i]-saturation[i]),absorbRate);water[i]-=take;saturation[i]+=take;
   const dry=water[i]*(.012+.12*p.rim/100*boundary[i]);water[i]-=dry;
   const paperDry=saturation[i]*.004;saturation[i]-=paperDry;evaporated+=dry+paperDry;
  }
  if(capRate>0)saturation=moveCapillaryWater(saturation,paper.capacity,graph,capRate);
  for(let i=0;i<n;i++)if(!mask[i]&&saturation[i]/paper.capacity[i]>.45){mask[i]=1;changed=true;}
 }
 const mass=Float64Array.from(g,(v,i)=>v+d[i]),remainingWater=sum(water)+sum(saturation),pigment=sum(mass);
 return {mass,floating:g,deposited:d,water,saturation,mask,paper,initialPigment,pigment,initialWater,addedWater,evaporated,remainingWater,pigmentError:pigment-initialPigment,waterError:remainingWater+evaporated-initialWater-addedWater};
}

// Stable Kubelka-Munk slab coefficients, including zero absorption/scattering.
export function kmWashLayer(K,S,thickness=1,out=[0,0]){
 const k=K*thickness,s=S*thickness;
 if(k<=1e-14){out[0]=s/(1+s);out[1]=1/(1+s);return out;}
 if(s<=1e-14){out[0]=0;out[1]=Math.exp(-k);return out;}
 const z=Math.sqrt(k*(k+2*s)),e=Math.exp(-z),q=-Math.expm1(-2*z),den=(k+s)*q+z*(1+e*e);
 out[0]=s*q/den;out[1]=2*z*e/den;return out;
}
export function kmWashComposite(topR,topT,bottomR){return topR+topT*topT*bottomR/(1-topR*bottomR);}
export function smoothWashDisplay(field,w,h,sigma=.55){
 if(sigma<=1e-8)return field.slice();
 const R=Math.ceil(sigma*3),weights=Float64Array.from({length:2*R+1},(_,i)=>Math.exp(-((i-R)**2)/(2*sigma*sigma))),total=sum(weights),tmp=new Float64Array(field.length),out=tmp.slice();for(let k=0;k<weights.length;k++)weights[k]/=total;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=-R;k<=R;k++)tmp[y*w+x]+=field[y*w+reflectIndex(x+k,w)]*weights[k+R];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=-R;k<=R;k++)out[y*w+x]+=tmp[reflectIndex(y+k,h)*w+x]*weights[k+R];
 return out;
}
export function watercolourPlan(a,w,h,p,{edge=WATERCOLOUR_EDGE,diagnostics=false}={}){
 const guide=linearSpeckleGuide(a,w,h,edge),sigma=(p.softness??0)*Math.max(guide.w,guide.h)*.00028,targets=separateWashPigments(guide.rgb,p.key).map(t=>smoothWashDisplay(t,guide.w,guide.h,sigma)),paper=washPaper(guide.w,guide.h,p),states=targets.map((target,layer)=>simulateWash(target,guide.w,guide.h,p,{paper,layer}));
 return {w:guide.w,h:guide.h,fields:states.map(s=>smoothWashDisplay(s.mass,guide.w,guide.h)),targets:targets.map(t=>smoothWashDisplay(t,guide.w,guide.h)),stats:states.map(s=>({initialPigment:s.initialPigment,pigment:s.pigment,initialWater:s.initialWater,addedWater:s.addedWater,evaporated:s.evaporated,remainingWater:s.remainingWater,pigmentError:s.pigmentError,waterError:s.waterError,wetCells:sum(s.mask)})),...(diagnostics?{states}:{})};
}
export function renderWatercolourPlan(a,w,h,p,plan){
 const out=new Uint8ClampedArray(a.length),detail=p.detail/100,strength=p.amount/100,ink=p.density/100,paper=[.98,.975,.955],mass=new Float64Array(4),coat=new Float64Array(8),scattering=[.018,.014,.021,.008],pair=[0,0],source=new Float64Array(4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,X=(x+.5)*plan.w/w-.5,Y=(y+.5)*plan.h/h-.5,neutral=Math.min(density[a[i]],density[a[i+1]],density[a[i+2]]);
  for(let c=0;c<3;c++)source[c]=density[a[i+c]]-neutral;source[3]=neutral*(1-p.key/100);
  for(let c=0;c<4;c++){
   const original=sample(plan.targets[c],plan.w,plan.h,X,Y,0,1),paint=sample(plan.fields[c],plan.w,plan.h,X,Y,0,1);
   mass[c]=Math.max(0,paint+detail*(source[c]-original))*ink;
   kmWashLayer(1,scattering[c],mass[c],pair);coat[c*2]=pair[0];coat[c*2+1]=pair[1];
  }
  for(let c=0;c<3;c++){
   let reflected=paper[c];
   for(let k=0;k<4;k++){
    if(k===c||k===3)reflected=kmWashComposite(coat[k*2],coat[k*2+1],reflected);
    else{const s=scattering[k]*mass[k],r=s/(1+s),t=1/(1+s);reflected=kmWashComposite(r,t,reflected);}
   }
   out[i+c]=255*toEncoded(clamp(linear[a[i+c]]*(1-strength)+reflected*strength,0,1));
  }out[i+3]=255;
 }return out;
}
let washCache=null,cacheHits=0,cacheMisses=0;
export function clearWatercolourCache(){washCache=null;cacheHits=cacheMisses=0;}
export function watercolourCacheInfo(){return {hits:cacheHits,misses:cacheMisses,bytes:washCache?washCache.source.byteLength+[...washCache.plan.fields,...washCache.plan.targets].reduce((n,a)=>n+a.byteLength,0):0};}
const sameWashSource=(a,b)=>{if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
export function watercolour(a,w,h,p){
 if(p.time===0||p.amount===0)return new Uint8ClampedArray(a);
 const key=JSON.stringify([w,h,p.time,p.water,p.damp,p.rim,p.absorb,p.spread,p.granulation,p.scale,p.stain,p.rewet,p.softness,p.key,p.seed]);
 let plan;
 if(washCache?.key===key&&sameWashSource(a,washCache.source)){cacheHits++;plan=washCache.plan;}
 else{
  cacheMisses++;plan=watercolourPlan(a,w,h,p);
  // One exact preview source and its pigment fields. Large exports use the
  // same field resolution and native composition without retaining a frame.
  washCache=w*h<=4_000_000?{key,source:new Uint8ClampedArray(a),plan}:null;
 }
 return renderWatercolourPlan(a,w,h,p,plan);
}
