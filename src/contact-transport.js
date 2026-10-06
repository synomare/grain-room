import {hash,sample} from './pixels.js';
import {noise} from './material-effects.js';
import {curveGuide as areaRGBGuide} from './diffusion-curves.js';

export const CONTACT_STATE_EDGE=512;
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
const luma=(r,g,b)=>.2126*r+.7152*g+.0722*b;

// Amount is a height density; actual volume is density times cell area.
// The photograph supplies RGB attributes, not measured pigment/material data.
export function createContactSurface(guide,{tooth=50,protect=0,seed=17}={}){
 const {rgb,w,h}=guide,edge=Math.max(w,h),n=w*h,mass=new Float64Array(n).fill(1),color=rgb.slice(),freshMass=new Float64Array(n),freshColor=new Float64Array(n*3),native=mass.slice(),paper=mass.slice(),access=mass.slice();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,X=(x+.5)/edge,Y=(y+.5)/edge;
  paper[i]=tooth/100*.42*(noise(X*140,Y*140,seed)*.55+noise(X*55,Y*55,seed+1)*.3+noise(X*11,Y*11,seed+2)*.15);
  access[i]=1-protect/100*smooth((luma(rgb[i*3],rgb[i*3+1],rgb[i*3+2])-.65)/.3);
 }
 return {w,h,edge,area:1/edge**2,initial:rgb.slice(),mass,color,freshMass,freshColor,native,paper,access,touched:new Uint8Array(n),stats:{picked:0,deposited:0,capacityHits:0,steps:0}};
}

export function createContactTool(surface,{width=110,capacity=60,pressure=65,tooth=50,release=45,separate=100}={}){
 const physicalWidth=width/1000,length=Math.max(2/surface.edge,physicalWidth*.18),maxSlots=Math.max(1,Math.min(64,Math.ceil(physicalWidth*surface.edge/2))),slots=Math.max(1,Math.round(1+(maxSlots-1)*separate/100));
 const totalCapacity=capacity===0?0:(.03+12*(capacity/100)**2)*physicalWidth*length;
 const bound=Math.ceil((physicalWidth+length)*surface.edge)+4,n=Math.min(surface.w*surface.h,bound*bound);
 return {width:physicalWidth,length,slots,capacity:totalCapacity/slots,upper:1+tooth/100*.42+.25,plane:(1+tooth/100*.42+.25)*(1-pressure/100),release:release/100*2,
  mass:new Float64Array(slots),queues:Array.from({length:slots},()=>[]),heads:new Uint32Array(slots),
  ids:new Int32Array(n),slotIds:new Uint8Array(n),contacts:new Float64Array(n),requests:new Float64Array(n),
  contactSum:new Float64Array(slots),pickupSum:new Float64Array(slots),scales:new Float64Array(slots),deposit:new Float64Array(slots),depositColor:new Float64Array(slots*3),picked:new Float64Array(slots),pickedColor:new Float64Array(slots*3)};
}

function takeOldCargo(tool,slot,amount){
 const queue=tool.queues[slot],out=[0,0,0];let remaining=amount,head=tool.heads[slot];
 while(remaining>1e-20&&head<queue.length){
  const p=queue[head],take=Math.min(remaining,p.amount);for(let c=0;c<3;c++)out[c]+=p.color[c]*take;p.amount-=take;remaining-=take;
  if(p.amount<=1e-20)head++;
 }
 tool.heads[slot]=head;tool.mass[slot]-=amount-remaining;
 // Bound retained queue storage while preserving all still-carried packets.
 if(head>128&&head>queue.length/2){tool.queues[slot]=queue.slice(head);tool.heads[slot]=0;}
 return {amount:amount-remaining,color:out};
}

// A simultaneous conservative exchange. Released paint goes into a separate
// pool and cannot be picked up again until the current path has ended.
export function exchangeContact(surface,tool,x,y,dx,dy,distance,pressureEnvelope=1){
 if(distance<=0||tool.capacity<=0)return;
 const {w,h,edge,area,mass,color,freshMass,freshColor,native,paper,access}=surface;
 const norm=Math.hypot(dx,dy);if(!norm)return;dx/=norm;dy/=norm;
 const hx=tool.length/2,hy=tool.width/2,bx=(Math.abs(dx)*hx+Math.abs(dy)*hy)*edge,by=(Math.abs(dy)*hx+Math.abs(dx)*hy)*edge,cx=x*edge,cy=y*edge;
 const x0=Math.max(0,Math.ceil(cx-bx-.5)),x1=Math.min(w-1,Math.floor(cx+bx-.5)),y0=Math.max(0,Math.ceil(cy-by-.5)),y1=Math.min(h-1,Math.floor(cy+by-.5));
 tool.contactSum.fill(0);tool.pickupSum.fill(0);tool.picked.fill(0);tool.pickedColor.fill(0);tool.depositColor.fill(0);
 let count=0;const plane=tool.upper-(tool.upper-tool.plane)*clamp(pressureEnvelope);
 for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){
  const X=(xx+.5-cx)/edge,Y=(yy+.5-cy)/edge,u=(X*dx+Y*dy)/hx,v=(-X*dy+Y*dx)/hy,r2=u*u+v*v;if(r2>=1)continue;
  const i=yy*w+xx,profile=.2*u**4+.16*v**4,contact=clamp((paper[i]+mass[i]+freshMass[i]-plane-profile)/.65)*Math.sqrt(1-r2)*access[i];if(contact<=0)continue;
  const slot=Math.min(tool.slots-1,Math.floor((v*.5+.5)*tool.slots)),request=mass[i]*area*(-Math.expm1(-6*contact*distance/tool.length));
  tool.ids[count]=i;tool.slotIds[count]=slot;tool.contacts[count]=contact;tool.requests[count]=request;count++;
  tool.contactSum[slot]+=contact;tool.pickupSum[slot]+=request;
 }
 for(let s=0;s<tool.slots;s++){
  const requestedRelease=tool.release*distance/tool.length*area*tool.contactSum[s],old=takeOldCargo(tool,s,Math.min(tool.mass[s],requestedRelease));tool.deposit[s]=old.amount;
  for(let c=0;c<3;c++)tool.depositColor[s*3+c]=old.color[c];
  const available=Math.max(0,tool.capacity-tool.mass[s]);tool.scales[s]=tool.pickupSum[s]>0?Math.min(1,available/tool.pickupSum[s]):0;
  if(tool.pickupSum[s]>available+1e-16)surface.stats.capacityHits++;
 }
 for(let j=0;j<count;j++){
  const i=tool.ids[j],s=tool.slotIds[j],pickup=tool.requests[j]*tool.scales[s],density=pickup/area,ratio=mass[i]>0?Math.max(0,1-density/mass[i]):1,weight=tool.contacts[j]/tool.contactSum[s],deposited=tool.deposit[s]*weight;
  for(let c=0;c<3;c++){
   tool.pickedColor[s*3+c]+=mass[i]>0?pickup*color[i*3+c]/mass[i]:0;
   color[i*3+c]*=ratio;freshColor[i*3+c]+=tool.depositColor[s*3+c]*weight/area;
  }
  mass[i]*=ratio;native[i]*=ratio;freshMass[i]+=deposited/area;tool.picked[s]+=pickup;
  if(pickup>0||deposited>0)surface.touched[i]=1;surface.stats.picked+=pickup;surface.stats.deposited+=deposited;
 }
 for(let s=0;s<tool.slots;s++)if(tool.picked[s]>1e-20){const m=tool.picked[s],q=[0,1,2].map(c=>tool.pickedColor[s*3+c]/m);tool.queues[s].push({amount:m,color:q});tool.mass[s]+=m;}
 surface.stats.steps++;
}

export function finishContactPath(surface){
 for(let i=0;i<surface.mass.length;i++){surface.mass[i]+=surface.freshMass[i];surface.freshMass[i]=0;for(let c=0;c<3;c++){surface.color[i*3+c]+=surface.freshColor[i*3+c];surface.freshColor[i*3+c]=0;}}
}

export function walkContactPath(surface,tool,points,{spacing=.5,rePickFresh=false,taper=false}={}){
 const totalLength=points.reduce((s,p,i)=>s+(i?Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1]):0),0),ramp=Math.min(totalLength*.25,Math.max(tool.width*.9,tool.length*2));let traveled=0;
 for(let k=1;k<points.length;k++){
  const a=points[k-1],b=points[k],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),steps=Math.max(1,Math.ceil(length*surface.edge/spacing));
  for(let j=0;j<steps;j++){const t=(j+.5)/steps,s=traveled+t*length,envelope=taper&&ramp>0?smooth(Math.min(s,totalLength-s)/ramp):1;exchangeContact(surface,tool,a[0]+t*dx,a[1]+t*dy,dx,dy,length/steps,envelope);if(rePickFresh)finishContactPath(surface);}traveled+=length;
 }
 finishContactPath(surface);
}

export function contactTotals(surface,tool){
 const {area,mass,freshMass,color,freshColor}=surface,components=[0,0,0];let volume=0,cargo=0;
 for(let i=0;i<mass.length;i++){volume+=(mass[i]+freshMass[i])*area;for(let c=0;c<3;c++)components[c]+=(color[i*3+c]+freshColor[i*3+c])*area;}
 for(let s=0;s<tool.slots;s++)for(let j=tool.heads[s];j<tool.queues[s].length;j++){const p=tool.queues[s][j];cargo+=p.amount;for(let c=0;c<3;c++)components[c]+=p.color[c]*p.amount;}
 return {volume:volume+cargo,surface:volume,cargo,components};
}

export function contactPaths(surface,{strokes=3,travel=65,angle=105,width=110,seed=17}={}){
 const a=angle*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a),length=travel/100,paths=[],anchors=[],radius=Math.max(2/surface.edge,width/4000);
 const at=(x,y)=>[0,1,2].map(c=>sample(surface.initial,surface.w,surface.h,x*surface.edge-.5,y*surface.edge-.5,c,3));
 for(let k=0;k<strokes;k++){
  let x=0,y=0,best=-Infinity;for(let attempt=0;attempt<24;attempt++){
   const X=(.04+.92*hash(k,attempt*2+1,seed))*surface.w/surface.edge,Y=(.04+.92*hash(k,attempt*2+2,seed))*surface.h/surface.edge,r=at(X,Y),values=[[X-radius,Y],[X+radius,Y],[X,Y-radius],[X,Y+radius]].map(q=>luma(...at(...q))),chroma=Math.max(...r)-Math.min(...r);
   const crowd=anchors.reduce((s,q)=>s+Math.exp(-((q[0]-X)**2+(q[1]-Y)**2)/Math.max(.001,(width/1000*1.3)**2)),0),score=.6*chroma+1.7*(Math.max(...values)-Math.min(...values))+.12*hash(k,attempt+89,seed)-.35*crowd;
   if(score>best){best=score;x=X;y=Y;}
  }anchors.push([x,y]);
  const bend=(hash(k,41,seed)-.5)*length*.12,points=[];
  for(let j=0;j<=24;j++){const t=j/24,offset=Math.sin(t*Math.PI)*bend;points.push([x+(t-.35)*length*dx-offset*dy,y+(t-.35)*length*dy+offset*dx]);}paths.push(points);
 }
 return paths;
}

export function simulateContactTransport(a,w,h,p,{edge=CONTACT_STATE_EDGE,spacing=.5,rePickFresh=false}={}){
 const surface=createContactSurface(areaRGBGuide(a,w,h,edge),p),tool=createContactTool(surface,p),initial=contactTotals(surface,tool),paths=contactPaths(surface,p);
 for(const path of paths)walkContactPath(surface,tool,path,{spacing,rePickFresh,taper:true});return {surface,tool,paths,initial,final:contactTotals(surface,tool)};
}

// Retain the original high-resolution residual only in material that has not
// been picked up. Transported RGB attributes are limited by the state grid.
export function renderContactTransport(a,w,h,{surface}){
 const {w:gw,h:gh,mass,color,native,initial}=surface,rgb=new Float64Array(color.length);
 for(let i=0;i<mass.length;i++){const coverage=Math.min(1,mass[i]);for(let c=0;c<3;c++)rgb[i*3+c]=mass[i]>0?color[i*3+c]/mass[i]*coverage+1-coverage:1;}
 const out=new Uint8ClampedArray(a);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,X=(x+.5)*gw/w-.5,Y=(y+.5)*gh/h-.5,keep=clamp(sample(native,gw,gh,X,Y,0,1));
  for(let c=0;c<3;c++){const source=sample(initial,gw,gh,X,Y,c,3),value=sample(rgb,gw,gh,X,Y,c,3);out[i+c]=255*value+(a[i+c]-255*source)*keep;}out[i+3]=255;
 }return out;
}

export function contactTransport(a,w,h,p){
 if(p.capacity===0||p.pressure===0||p.travel===0||p.strokes===0)return new Uint8ClampedArray(a);
 return renderContactTransport(a,w,h,simulateContactTransport(a,w,h,p));
}
