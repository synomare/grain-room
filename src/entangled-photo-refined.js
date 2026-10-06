import {sample,hash} from './pixels.js';
import {availableGlyph,glyphCoverage} from './glyph-contours.js';
import {fragmentPlan,bandPoint,line,entangledPhotoDefaults} from './entangled-photo.js';
export const entangledPhotoRefinedDefaults={...entangledPhotoDefaults};
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
function stroke(out,w,h,points,width,c,opacity=1){for(let i=1;i<points.length;i++)line(out,w,h,...points[i-1],...points[i],width,c,opacity);}
export function sheetPoint(u,v,n,p){
 const q=p.distort/100,bend=.14*Math.sin(v*Math.PI)*Math.sin(v*6+n.phase)*q,fold=1-q*.32*Math.sin(v*5+n.phase)**2;
 return{x:(u-.5)*fold+bend,y:v-.5};
}
export function sheetCoordinates(x,y,n,p){
 const v=y+.5,q=p.distort/100,bend=.14*Math.sin(v*Math.PI)*Math.sin(v*6+n.phase)*q,fold=1-q*.32*Math.sin(v*5+n.phase)**2;
 return {u:(x-bend)/fold+.5,v,fold};
}
function panel(out,a,w,h,n,p,scale,bg){
 const X=n.X*scale,Y=n.Y*scale,ww=n.ww*scale,hh=n.hh*scale,co=Math.cos(n.turn),si=Math.sin(n.turn),R=Math.hypot(ww*1.3,hh)/2,opacity=n.depth<3?.82:.97;
 const marked=n.record,q=p.distort/100,glyphs=marked?Array.from('0123456789abcdef',c=>availableGlyph(c)):null;
 for(let y=Math.max(0,Math.floor(Y-R));y<=Math.min(h-1,Math.ceil(Y+R));y++)for(let x=Math.max(0,Math.floor(X-R));x<=Math.min(w-1,Math.ceil(X+R));x++){
  const dx=x+.5-X,dy=y+.5-Y,{u,v,fold}=sheetCoordinates((dx*co+dy*si)/ww,(-dx*si+dy*co)/hh,n,p);
  const boundary=clamp((.5-Math.abs(u-.5))*ww*fold+.5)*clamp((.5-Math.abs(v-.5))*hh+.5);if(!boundary)continue;
  const ripple=u*11+v*5+2*Math.sin(v*8+n.phase),zoom=n.depth>=4?(.4+hash(n.id,19,p.seed)*.6):1,
   su=(n.x+((u-.5+q*.13*Math.sin(ripple))/zoom+.5)*n.rw)*w-.5,
   sv=(n.y+((v-.5+q*.06*Math.sin(u*10+v*4+n.phase))/zoom+.5)*n.rh)*h-.5,
   C=[0,1,2].map(c=>sample(a,w,h,su,sv,c)),l=C[0]*.2126+C[1]*.7152+C[2]*.0722,dist=Math.sqrt(C.reduce((s,c,k)=>s+(c-bg[k])**2,0)),coverage=clamp((dist-34)/65),j=(y*w+x)*4;
  const edge=hash(n.id,85,p.seed)>.22?clamp((1-((u-.5)*1.8)**2-((v-.5)*1.8)**2+Math.sin(ripple)*.12)*8):1;
  const nx=Math.sin(ripple),ny=Math.cos(v*8+n.phase)*.65,nz=.7,light=Math.max(0,(-nx*.45-ny*.3+nz*.84)/Math.hypot(nx,ny,nz)),shade=.53+light*.64,spec=Math.max(0,light-.72)**2*240;
  let ink=0,ground=0;
  if(marked){
   const U=u*n.ww/2.6,V=v*n.hh/4.8,col=Math.floor(U),row=Math.floor(V),columns=Math.ceil(n.ww/2.6),ix=row*columns+col;
   if(u>.10&&u<.9&&v>.08&&v<.91&&hash(col,Math.floor(row/8),n.id+p.seed)>.13){
    const value=sample(a,w,h,(n.x+col/columns*n.rw)*w,(n.y+v*n.rh)*h,ix%3);
    ink=glyphCoverage(glyphs[Math.floor(value/16)],U-col,V-row,112,24/Math.max(.2,2.6*scale*fold))*p.records/100;
    ground=.66*p.records/100;
   }
  }
  for(let c=0;c<3;c++){
   const grey=.65*l+79,material=(hash(n.id,92,p.seed)>.28?1:.25)*q;
   let target=(C[c]*(p.colour/100)+grey*(1-p.colour/100))*(1+(shade-1)*material)+spec*material;
   target+=(231-target)*ground;target+=(35-target)*ink*.9;
   out[j+c]+=(target-out[j+c])*opacity*coverage*edge*boundary;
  }
 }
}

export function ribbonRoute(j,W,H,p){
 const points=[],distances=[0];let length=0;
 for(let i=0;i<=800;i++){const q=bandPoint(i/800,j,W,H,p);points.push({...q,t:i/800});if(i){length+=Math.hypot(q.x-points[i-1].x,q.y-points[i-1].y);distances.push(length);}}
 return{points,distances,length};
}
export function routeAt(route,s){
 const{points,distances,length}=route,d=clamp(s,0,length);let lo=0,hi=points.length-1;
 while(hi-lo>1){const mid=(hi+lo)>>1;if(distances[mid]<d)lo=mid;else hi=mid;}
 const A=points[lo],B=points[hi],f=(d-distances[lo])/(distances[hi]-distances[lo]||1),dx=B.x-A.x,dy=B.y-A.y,L=Math.hypot(dx,dy)||1;
 return{x:A.x+(B.x-A.x)*f,y:A.y+(B.y-A.y)*f,tx:dx/L,ty:dy/L,t:A.t+(B.t-A.t)*f};
}
export function ribbonGlyphPlan(a,w,h,j,W,H,p){
 const plan=[];
 const glyphs=Array.from('0123456789abcdef',c=>availableGlyph(c)),rows=Math.round(2+p.writing/15),route=ribbonRoute(j,W,H,p),spacing=5.2;
 const point=(s,row)=>{const q=routeAt(route,s),A=routeAt(route,s-3),B=routeAt(route,s+3),curv=Math.hypot(B.tx-A.tx,B.ty-A.ty)/6,spread=8*(.65+.35*Math.cos(q.t*9+j)**2),limit=curv?Math.min(1,.70/(curv*rows*spread*.5)):1,dis=(row-(rows-1)/2)*spread*limit;
  return{...q,x:q.x-q.ty*dis,y:q.y+q.tx*dis};};
 for(let row=0;row<rows;row++){
  const rowRoute={points:[],distances:[0],length:0};
  for(let i=0;i<=800;i++){const q=point(route.length*i/800,row),prev=rowRoute.points.at(-1);rowRoute.points.push(q);if(prev){rowRoute.length+=Math.hypot(q.x-prev.x,q.y-prev.y);rowRoute.distances.push(rowRoute.length);}}
  const count=Math.max(1,Math.round(rowRoute.length/spacing)),step=rowRoute.length/count;
  for(let i=0;i<count;i++){
   const s=(i+.5)*step,q=routeAt(rowRoute,s);
   if(hash(i,row,p.seed+44)<.035)continue;
   const A=routeAt(rowRoute,s-.5),B=routeAt(rowRoute,s+.5),dx=B.x-A.x,dy=B.y-A.y,L=Math.hypot(dx,dy)||1,tx=dx/L,ty=dy/L,nx=-ty,ny=tx;
   const value=sample(a,w,h,q.t*w,(j*.38+row*.018)*h,row%3),glyph=glyphs[Math.floor(value/16)],cw=step*.88,ch=(6+3*Math.sin(q.t*11+row*.4)**2)*(.6+p.writing/100),ink=row===1&&j===1?[244,47,23]:row%3===2?[85,86,83]:[18,20,19];
   plan.push({x:q.x,y:q.y,tx,ty,cw,ch,glyph,ink,t:q.t,row,index:i,spacing:step,s,front:q.t>=.18});
  }
 }
 return plan;
}
export function drawRibbonGlyphs(out,w,h,plan,scale,front){
 for(const q of plan){
  if(q.front!==front)continue;
  const {tx,ty,glyph,ink}=q,nx=-ty,ny=tx,X=q.x*scale,Y=q.y*scale,ww=q.cw*scale,hh=q.ch*scale,R=Math.hypot(ww,hh)/2;
  for(let y=Math.max(0,Math.floor(Y-R));y<=Math.min(h-1,Math.ceil(Y+R));y++)for(let x=Math.max(0,Math.floor(X-R));x<=Math.min(w-1,Math.ceil(X+R));x++){
   const U=((x+.5-X)*tx+(y+.5-Y)*ty)/ww+.5,V=((x+.5-X)*nx+(y+.5-Y)*ny)/hh+.5;if(U<0||U>1||V<0||V>1)continue;
   const cov=glyphCoverage(glyph,U,V,115,24/Math.max(.2,ww)),halo=glyphCoverage(glyph,U,V,155,24/Math.max(.2,ww)),at=(y*w+x)*4;
   for(let k=0;k<3;k++){out[at+k]+=(244-out[at+k])*halo*.6;out[at+k]+=(ink[k]-out[at+k])*cov*.94;}
  }
 }
}

export function entangledPhotoRefined(a,w,h,params={}){const p={...entangledPhotoRefinedDefaults,...params},scale=Math.max(w,h)/1000,{W,H,nodes,anchors}=fragmentPlan(a,w,h,p),out=new Uint8ClampedArray(a.length),paper=[p.paper*2.55,p.paper*2.54,p.paper*2.48];
 p.anchors=anchors;
 const ribbons=p.ribbonVisible!==0&&p.bands&&p.writing?[0,1].map(j=>ribbonGlyphPlan(a,w,h,j,W,H,p)):[];
 const red=[255,59,31],violet=[128,105,242],black=[21,22,23];
 const bg=[0,1,2].map(c=>(sample(a,w,h,0,0,c)+sample(a,w,h,w-1,0,c)+sample(a,w,h,0,h-1,c)+sample(a,w,h,w-1,h-1,c))/4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=(x+.5)/scale,Y=(y+.5)/scale,v=(Y/H-.035)/.93,u=(X/W-.37-p.distort/100*(.045*Math.sin(v*13+2.5)+.024*Math.sin(v*37)))/(.88-p.shrink*.004)+.5,C=[0,1,2].map(c=>sample(a,w,h,u*w-.5,v*h-.5,c)),dist=Math.sqrt(C.reduce((s,c,k)=>s+(c-bg[k])**2,0)),alpha=(u>=0&&u<=1&&v>=0&&v<=1?clamp((dist-34)/95):0)*p.source/100,j=(y*w+x)*4;for(let c=0;c<3;c++)out[j+c]=paper[c]*(1-alpha)+C[c]*alpha;out[j+3]=255;}
 for(let k=0;k<Math.round(p.wires*.65);k++){const n=nodes[Math.floor(hash(k,71,p.seed)*nodes.length)];if(!n)continue;const start={x:n.X,y:n.Y},j=k%2,end=bandPoint(.3+.67*hash(k,72,p.seed),j,W,H,p),points=[];for(let i=0;i<=90;i++){const t=i/90,dx=end.x-start.x,dy=end.y-start.y,q=Math.sin(t*Math.PI);points.push([(start.x+dx*t+q*(Math.sin(t*11+k)*2+Math.sin(k)*W*.04))*scale,(start.y+dy*t+q*(H*(.10+.08*hash(k,73,p.seed))+Math.sin(t*28+k)*2))*scale]);}stroke(out,w,h,points,(k%7===0?1:.35)*scale,k%9===0?red:black,.7);}
 for(const plan of ribbons)drawRibbonGlyphs(out,w,h,plan,scale,false);
 // Records are carried by selected photo surfaces, and can be occluded by later fragments.
 const candidates=nodes.filter(n=>n.depth>=3&&n.ww>28&&n.hh>30).sort((a,b)=>b.energy-a.energy),chosen=[];
 for(const n of candidates){if(chosen.some(q=>Math.hypot(q.X-n.X,q.Y-n.Y)<47))continue;n.record=true;chosen.push(n);if(chosen.length>=Math.round(3+p.records/5))break;}
 nodes.sort((a,b)=>a.depth-b.depth);for(const n of nodes){panel(out,a,w,h,n,p,scale,bg);
 if(n.depth>=3&&hash(n.id,31,p.seed)<p.frames/100*.28){const x=n.X-n.ww/2,y=n.Y-n.hh/2,c=hash(n.id,32,p.seed)<.78?red:violet;stroke(out,w,h,[[x,y],[x+n.ww,y],[x+n.ww,y+n.hh],[x,y+n.hh],[x,y]].map(q=>q.map(v=>v*scale)),(.4+hash(n.id,33,p.seed)*.9)*scale,c,.75);}
 }

 for(const plan of ribbons)drawRibbonGlyphs(out,w,h,plan,scale,true);

 return out;
}
