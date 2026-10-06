import {hash,clamp,sample} from './pixels.js';
import {painterlyGuide} from './painterly-strokes.js';

export const GRAPHCUT_EDGE=384;
const EPS=1e-9;
export class CutNetwork {
 constructor(n){this.n=n;this.head=new Int32Array(n).fill(-1);this.to=[];this.next=[];this.capacity=[];}
 add(u,v,c,reverse=0){const k=this.to.length;this.to.push(v,u);this.capacity.push(c,reverse);this.next.push(this.head[u],this.head[v]);this.head[u]=k;this.head[v]=k+1;}
 solve(source,sink){
  const level=new Int32Array(this.n),queue=new Int32Array(this.n),cursor=new Int32Array(this.n),{head,to,next,capacity}=this;
  const bfs=()=>{level.fill(-1);let q=0,end=1;queue[0]=source;level[source]=0;while(q<end){const v=queue[q++];for(let e=head[v];e>=0;e=next[e])if(capacity[e]>EPS&&level[to[e]]<0){level[to[e]]=level[v]+1;queue[end++]=to[e];}}return level[sink]>=0;};
  const send=(v,limit)=>{if(v===sink)return limit;for(let e=cursor[v];e>=0;cursor[v]=e=next[e])if(capacity[e]>EPS&&level[to[e]]===level[v]+1){const sent=send(to[e],Math.min(limit,capacity[e]));if(sent>EPS){capacity[e]-=sent;capacity[e^1]+=sent;return sent;}}return 0;};
  let flow=0;while(bfs()){cursor.set(head);let sent;while((sent=send(source,Infinity))>EPS)flow+=sent;}
  const reachable=new Uint8Array(this.n);let q=0,end=1;queue[0]=source;reachable[source]=1;while(q<end){const v=queue[q++];for(let e=head[v];e>=0;e=next[e])if(capacity[e]>EPS&&!reachable[to[e]]){reachable[to[e]]=1;queue[end++]=to[e];}}
  return {flow,reachable};
 }
}

export function reflectCutCoordinate(v,n){if(n===1)return 0;const period=n*2,t=((v+.5)%period+period)%period;return t<n?t-.5:period-t-.5;}
export function cutSourcePoint(patch,x,y,out=[0,0]){const dx=x-patch.dx,dy=y-patch.dy;out[0]=patch.sx+(dx*patch.co+dy*patch.si)/patch.zoom;out[1]=patch.sy+(-dx*patch.si+dy*patch.co)/patch.zoom;return out;}
export function cutPatchColour(guide,patch,x,y,out=[0,0,0]){
 const [sx,sy]=cutSourcePoint(patch,x,y),X=reflectCutCoordinate(sx,guide.w),Y=reflectCutCoordinate(sy,guide.h);for(let c=0;c<3;c++)out[c]=sample(guide.rgb,guide.w,guide.h,X,Y,c,3);return out;
}
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export function cutMatchingCost(guide,patches,a,b,x,y,X,Y,seam=0){
 if(a===b)return 0;
 return distance(cutPatchColour(guide,patches[a],x,y),cutPatchColour(guide,patches[b],x,y))+distance(cutPatchColour(guide,patches[a],X,Y),cutPatchColour(guide,patches[b],X,Y))+seam;
}

// Labels describe source patches rather than an enlarged rendered bitmap.
// Existing seam nodes retain the pair's old metric cost and both possible
// replacement costs. Source-side pixels keep their current label.
export function cutPatchRegion(scene,patchIndex,rect,p,{forceCenter=false}={}){
 const {guide,labels,patches,canvas}=scene,{w:W,h:H}=guide,{x:ox,y:oy,w,h}=rect,n=w*h,newPatch=patches[patchIndex],proposed=new Float32Array(n*3),oldData=new Float64Array(n),newData=oldData.slice(),oldLabel=new Int32Array(n),oldForce=new Uint8Array(n),newForce=new Uint8Array(n),pairs=[];
 let finite=0,before=0,auxiliary=0,empty=0;
 const beta=p.follow/100*.06,seam=p.seam*.2;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,j=(oy+y)*W+ox+x,colour=cutPatchColour(guide,newPatch,ox+x,oy+y),label=labels[j],reference=guide.rgb.subarray(j*3,j*3+3);oldLabel[i]=label;proposed.set(colour,i*3);newData[i]=beta*distance(colour,reference);finite+=newData[i];
  if(label<0){newForce[i]=1;empty++;}
  else{
   oldData[i]=beta*distance(cutPatchColour(guide,patches[label],ox+x,oy+y),reference);before+=oldData[i];finite+=oldData[i];
   for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){const xx=ox+x+dx,yy=oy+y+dy;if(xx<0||xx>=W||yy<0||yy>=H)continue;if((xx<ox||xx>=ox+w||yy<oy||yy>=oy+h)&&labels[yy*W+xx]>=0)oldForce[i]=1;}
  }
 }
 if(forceCenter){const c=Math.floor(h/2)*w+Math.floor(w/2);if(!oldForce[c])newForce[c]=1;}
 const pair=(i,j)=>{
  const x=ox+i%w,y=oy+Math.floor(i/w),X=ox+j%w,Y=oy+Math.floor(j/w),a=oldLabel[i],b=oldLabel[j];
  if(a<0&&b<0)return;
  if(a<0||b<0||a===b){const old=a<0?b:a,cost=cutMatchingCost(guide,patches,old,patchIndex,x,y,X,Y,seam);pairs.push({i,j,cost});finite+=cost;}
  else{
   const old=cutMatchingCost(guide,patches,a,b,x,y,X,Y,seam),left=cutMatchingCost(guide,patches,a,patchIndex,x,y,X,Y,seam),right=cutMatchingCost(guide,patches,b,patchIndex,x,y,X,Y,seam);pairs.push({i,j,old,left,right});finite+=old+left+right;before+=old;auxiliary++;
  }
 };
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x+1<w)pair(i,i+1);if(y+1<h)pair(i,i+w);}
 const source=n+auxiliary,sink=source+1,graph=new CutNetwork(sink+1),hard=finite+1;let node=n;
 for(let i=0;i<n;i++){if(oldData[i]>0)graph.add(i,sink,oldData[i]);if(newData[i]>0)graph.add(source,i,newData[i]);if(oldForce[i])graph.add(source,i,hard);if(newForce[i])graph.add(i,sink,hard);}
 for(const edge of pairs){if('cost' in edge)graph.add(edge.i,edge.j,edge.cost,edge.cost);else{graph.add(edge.i,node,edge.left,edge.left);graph.add(node,edge.j,edge.right,edge.right);graph.add(node,sink,edge.old);node++;}}
 const result=graph.solve(source,sink),mask=new Uint8Array(n);let copied=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!result.reachable[i]){mask[i]=1;copied++;}}
 return {mask,proposed,flow:result.flow,before:empty?null:before,auxiliary,copied,oldForce,newForce,oldData,newData,pairs};
}
export function applyCutPatch(scene,patchIndex,rect,result){
 const {labels,canvas,guide}=scene;for(let y=0;y<rect.h;y++)for(let x=0;x<rect.w;x++){const i=y*rect.w+x;if(result.mask[i]){const j=(rect.y+y)*guide.w+rect.x+x;labels[j]=patchIndex;for(let c=0;c<3;c++)canvas[j*3+c]=result.proposed[i*3+c];}}
}
function starts(n,size,overlap){if(n<=size)return [0];const out=[0],step=Math.max(1,size-overlap);while(out.at(-1)+size<n){const next=Math.min(n-size,out.at(-1)+step);if(next===out.at(-1))break;out.push(next);}return out;}
function createPatch(scene,rect,p,tile,k){
 const {w,h}=scene.guide,S=Math.max(w,h),dx=rect.x+(rect.w-1)/2,dy=rect.y+(rect.h-1)/2,angle=(hash(tile,k*3+311,p.seed)-.5)*2*p.turn*Math.PI/180,zoom=p.magnify/100,co=Math.cos(angle),si=Math.sin(angle),radius=p.scatter*S/200*(k===0?0:k<6?.08:1),hx=(Math.abs(co)*rect.w+Math.abs(si)*rect.h)/2/zoom,hy=(Math.abs(si)*rect.w+Math.abs(co)*rect.h)/2/zoom;
 const center=(v,n,r)=>r*2>=n?(n-1)/2:clamp(v,r-.5,n-r-.5);
 return {dx,dy,sx:center(dx+(hash(tile,k*3+312,p.seed)-.5)*2*radius,w,hx),sy:center(dy+(hash(tile,k*3+313,p.seed)-.5)*2*radius,h,hy),co,si,zoom};
}
export function chooseCutPatch(scene,rect,p,tile,{candidates=24}={}){
 const {guide,labels,canvas}=scene;const ranked=[];
 for(let k=0;k<candidates;k++){
  const patch=createPatch(scene,rect,p,tile,k);let shape=0,match=0,nshape=0,nmatch=0;
  for(let y=0;y<rect.h;y++)for(let x=0;x<rect.w;x++){const j=(rect.y+y)*guide.w+rect.x+x,colour=cutPatchColour(guide,patch,rect.x+x,rect.y+y),weight=scene.importance[j];for(let c=0;c<3;c++){shape+=(colour[c]-guide.rgb[j*3+c])**2*weight;if(labels[j]>=0)match+=(colour[c]-canvas[j*3+c])**2;}nshape+=weight;if(labels[j]>=0)nmatch++;}
  const score=shape/Math.max(1,nshape)*p.follow/100*2.4+match/Math.max(1,nmatch);
  ranked.push({patch,score});
 }ranked.sort((a,b)=>a.score-b.score);return ranked;
}
export function worstCutRegion(scene,size,excluded=new Set()){
 const {guide,labels,patches}=scene,{w,h}=guide,pitch=w+1,energy=new Float64Array(w*h),integral=new Float64Array((w+1)*(h+1));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(x+1<w&&labels[i]!==labels[i+1]){const e=cutMatchingCost(guide,patches,labels[i],labels[i+1],x,y,x+1,y,scene.seam);energy[i]+=e/2;energy[i+1]+=e/2;}if(y+1<h&&labels[i]!==labels[i+w]){const e=cutMatchingCost(guide,patches,labels[i],labels[i+w],x,y,x,y+1,scene.seam);energy[i]+=e/2;energy[i+w]+=e/2;}
 }
 for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=energy[y*w+x];integral[(y+1)*pitch+x+1]=integral[y*pitch+x+1]+row;}}
 const bw=Math.min(w,size),bh=Math.min(h,size);let best=-1,rect={x:0,y:0,w:bw,h:bh};
 for(const y of starts(h,bh,bh-Math.max(1,Math.floor(bh/4))))for(const x of starts(w,bw,bw-Math.max(1,Math.floor(bw/4)))){if(excluded.has(x+','+y))continue;const v=integral[(y+bh)*pitch+x+bw]-integral[y*pitch+x+bw]-integral[(y+bh)*pitch+x]+integral[y*pitch+x];if(v>best){best=v;rect={x,y,w:bw,h:bh};}}
 return {rect,energy:best};
}
export function graphcutPlan(a,w,h,p,{edge=GRAPHCUT_EDGE,diagnostics=false}={}){
 const guide=painterlyGuide(a,w,h,edge),importance=new Float32Array(guide.w*guide.h),scene={guide,importance,labels:new Int32Array(guide.w*guide.h).fill(-1),canvas:new Float32Array(guide.rgb.length),patches:[],seam:p.seam*.2},size=Math.max(3,Math.round(p.size*Math.max(guide.w,guide.h)/1000)),xs=starts(guide.w,size,Math.round(size*.32)),ys=starts(guide.h,size,Math.round(size*.32)),stages=[];let tile=0;
 for(let y=0;y<guide.h;y++)for(let x=0;x<guide.w;x++){let gx=0,gy=0;for(let c=0;c<3;c++){gx+=(guide.rgb[(y*guide.w+Math.min(x+1,guide.w-1))*3+c]-guide.rgb[(y*guide.w+Math.max(x-1,0))*3+c])**2;gy+=(guide.rgb[(Math.min(y+1,guide.h-1)*guide.w+x)*3+c]-guide.rgb[(Math.max(y-1,0)*guide.w+x)*3+c])**2;}importance[y*guide.w+x]=1+Math.min(20,Math.sqrt(gx+gy)/10);}
 const place=(rect,stage)=>{
  const ranked=chooseCutPatch(scene,rect,p,tile++),patchIndex=scene.patches.length;
  let selected,result;
  for(const candidate of ranked.slice(0,stage==='refine'?4:1)){
   scene.patches.push(candidate.patch);const trial=cutPatchRegion(scene,patchIndex,rect,p);scene.patches.pop();
   if(!result||trial.flow<result.flow){selected=candidate;result=trial;}
  }
  const accepted=stage==='initial'||result.flow<result.before-1e-7*(1+result.before);
  if(accepted){scene.patches.push(selected.patch);applyCutPatch(scene,patchIndex,rect,result);}
  stages.push({stage,rect,score:selected.score,before:result.before,after:accepted?result.flow:result.before,copied:accepted?result.copied:0,auxiliary:result.auxiliary,accepted});
  return accepted;
 };
 for(const y of ys)for(const x of xs)place({x,y,w:Math.min(size,guide.w),h:Math.min(size,guide.h)},'initial');
 const rejected=new Set();
 for(let k=0;k<p.refine;k++){const {rect,energy}=worstCutRegion(scene,size,rejected);if(energy<=EPS)break;if(place(rect,'refine'))rejected.clear();else rejected.add(rect.x+','+rect.y);}
 return {w:guide.w,h:guide.h,labels:scene.labels,patches:scene.patches,stages,...(diagnostics?{guide,canvas:scene.canvas}:{})};
}
export function renderGraphcutPlan(a,w,h,p,plan){
 if(p.amount===0)return new Uint8ClampedArray(a);
 const out=new Uint8ClampedArray(a.length),xy=[0,0],colour=new Float64Array(3),paint=new Float64Array(3),blended=new Float64Array(3),ids=new Int32Array(4),weights=new Float64Array(4),feather=p.feather/100,amount=p.amount/100;
 const read=(patchIndex,X,Y,dest)=>{const patch=plan.patches[patchIndex];cutSourcePoint(patch,X,Y,xy);const sx=reflectCutCoordinate((xy[0]+.5)*w/plan.w-.5,w),sy=reflectCutCoordinate((xy[1]+.5)*h/plan.h-.5,h);for(let c=0;c<3;c++)dest[c]=sample(a,w,h,sx,sy,c);};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,X=(x+.5)*plan.w/w-.5,Y=(y+.5)*plan.h/h-.5,xx=clamp(X,0,plan.w-1),yy=clamp(Y,0,plan.h-1),nx=Math.round(xx),ny=Math.round(yy),owner=plan.labels[ny*plan.w+nx];read(owner,X,Y,paint);
  if(feather>0){const x0=Math.floor(xx),y0=Math.floor(yy),x1=Math.min(x0+1,plan.w-1),y1=Math.min(y0+1,plan.h-1),fx=xx-x0,fy=yy-y0;ids[0]=plan.labels[y0*plan.w+x0];ids[1]=plan.labels[y0*plan.w+x1];ids[2]=plan.labels[y1*plan.w+x0];ids[3]=plan.labels[y1*plan.w+x1];
   if(ids[0]!==owner||ids[1]!==owner||ids[2]!==owner||ids[3]!==owner){weights[0]=(1-fx)*(1-fy);weights[1]=fx*(1-fy);weights[2]=(1-fx)*fy;weights[3]=fx*fy;blended.fill(0);for(let k=0;k<4;k++)if(weights[k]){read(ids[k],X,Y,colour);for(let c=0;c<3;c++)blended[c]+=colour[c]*weights[k];}for(let c=0;c<3;c++)paint[c]=paint[c]*(1-feather)+blended[c]*feather;}
  }
  for(let c=0;c<3;c++)out[i+c]=a[i+c]*(1-amount)+paint[c]*amount;out[i+3]=255;
 }return out;
}
let cutCache=null,cacheHits=0,cacheMisses=0;
export function clearGraphcutCache(){cutCache=null;cacheHits=cacheMisses=0;}
export function graphcutCacheInfo(){return {hits:cacheHits,misses:cacheMisses,bytes:cutCache?cutCache.source.byteLength+cutCache.plan.labels.byteLength:0};}
const sameCutSource=(a,b)=>{if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
export function graphcut(a,w,h,p){
 if(p.amount===0)return new Uint8ClampedArray(a);
 const key=JSON.stringify([w,h,p.size,p.scatter,p.follow,p.magnify,p.turn,p.refine,p.seam,p.seed]);let plan;
 if(cutCache?.key===key&&sameCutSource(a,cutCache.source)){cacheHits++;plan=cutCache.plan;}
 else{cacheMisses++;plan=graphcutPlan(a,w,h,p);cutCache=w*h<=4_000_000?{key,source:new Uint8ClampedArray(a),plan}:null;}
 return renderGraphcutPlan(a,w,h,p,plan);
}
