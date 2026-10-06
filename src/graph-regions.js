import Delaunator from 'delaunator';
import {hash,clamp} from './pixels.js';
import {curveGuide} from './diffusion-curves.js';
import {pointTree,nearestPair} from './structure-voronoi.js';

// Independent two-pass graph adaptation of Javid, Lord & Mould (2026).
// Coordinates below are guide pixels; output paths are rasterized at native size.
export const GRAPH_GUIDE_MAX=768;
const clip=v=>clamp(v,0,1);
const mean=a=>a.reduce((s,v)=>s+v,0)/Math.max(1,a.length);

export function graphMesh(points){
 const mesh=Delaunator.from(points),adj=points.map(()=>new Set()),triangles=new Uint32Array(mesh.triangles.length);
 // Normalize Delaunator's consistent winding by index, once. Computing the
 // winding again from tiny subpolygon areas can lose its sign to cancellation.
 for(let k=0;k<mesh.triangles.length;k+=3){triangles.set([mesh.triangles[k],mesh.triangles[k+2],mesh.triangles[k+1]],k);const t=triangles.subarray(k,k+3);for(let j=0;j<3;j++){adj[t[j]].add(t[(j+1)%3]);adj[t[(j+1)%3]].add(t[j]);}}
 return {points,triangles,adj:adj.map(a=>[...a].sort((a,b)=>a-b))};
}

// Priority follows CURRENT distance to mid-grey. Revision-stamped heap entries
// permit re-prioritizing every affected, still-unlabelled neighbor deterministically.
export function graphDiffuse(graph,values,{base=.5,detail=6,seed=17}={}){
 const {points,adj}=graph,n=points.length,current=Float64Array.from(values),labels=new Int8Array(n).fill(-1),versions=new Uint32Array(n),heap=[],order=[],averages=values.map((v,i)=>mean([v,...adj[i].map(j=>values[j])])),ties=values.map((_,i)=>hash(i,91,seed));
 const before=(a,b)=>a.priority>b.priority||(a.priority===b.priority&&(ties[a.id]<ties[b.id]||(ties[a.id]===ties[b.id]&&a.id<b.id)));
 function push(id){const entry={id,version:versions[id],priority:Math.abs(current[id]-.5)};let k=heap.length;heap.push(entry);while(k>0){const j=(k-1)>>1;if(!before(entry,heap[j]))break;heap[k]=heap[j];k=j;}heap[k]=entry;}
 function pop(){const top=heap[0],last=heap.pop();if(heap.length){let k=0;while(k*2+1<heap.length){let j=k*2+1;if(j+1<heap.length&&before(heap[j+1],heap[j]))j++;if(before(last,heap[j]))break;heap[k]=heap[j];k=j;}heap[k]=last;}return top;}
 for(let i=0;i<n;i++)push(i);
 let discarded=0;
 while(heap.length){const q=pop(),i=q.id;if(labels[i]!==-1||q.version!==versions[i])continue;
  const label=current[i]>=.5?1:0,error=current[i]-label;labels[i]=label;order.push(i);
  const alpha=base+(Math.sign(error)===Math.sign(values[i]-.5)?detail*Math.abs(values[i]-averages[i]):0),targets=adj[i].filter(j=>labels[j]===-1);
  // The normalized node-value transfer is NOT area conservation for unequal cells.
  const logWeights=targets.map(j=>-((Math.abs(values[i]-values[j])+.1*Math.hypot(points[i][0]-points[j][0],points[i][1]-points[j][1]))**2)),max=Math.max(...logWeights),weights=logWeights.map(v=>Math.exp(v-max)),sum=weights.reduce((a,b)=>a+b,0);
  if(!targets.length){discarded+=alpha*error;continue;}
  for(let k=0;k<targets.length;k++){const j=targets[k];current[j]+=alpha*error*weights[k]/sum;versions[j]++;push(j);}
 }
 return {labels,current,order,discarded};
}

function boxAverage(values,w,h,radius){
 const stride=w+1,table=new Float64Array(stride*(h+1)),out=new Float64Array(w*h);
 for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=values[y*w+x];table[(y+1)*stride+x+1]=table[y*stride+x+1]+row;}}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const l=Math.max(0,x-radius),r=Math.min(w,x+radius+1),t=Math.max(0,y-radius),b=Math.min(h,y+radius+1);out[y*w+x]=(table[b*stride+r]-table[t*stride+r]-table[b*stride+l]+table[t*stride+l])/((r-l)*(b-t));}
 return out;
}

export function graphImportance(luma,w,h,adapt){
 const local=boxAverage(luma,w,h,Math.max(1,Math.round(Math.max(w,h)*.018))),out=new Float64Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,dx=luma[y*w+Math.min(w-1,x+1)]-luma[y*w+Math.max(0,x-1)],dy=luma[Math.min(h-1,y+1)*w+x]-luma[Math.max(0,y-1)*w+x];out[i]=.3+adapt/100*.65*clip(Math.hypot(dx,dy)*3+Math.abs(luma[i]-local[i])*5);}
 return out;
}

export function graphCells(points,field,w,h){
 const tree=pointTree(points),sums=new Float64Array(points.length),areas=sums.slice(),sx=sums.slice(),sy=sums.slice();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=nearestPair(tree,x+.5,y+.5).first;areas[j]++;sums[j]+=field[y*w+x];sx[j]+=x+.5;sy[j]+=y+.5;}
 return {values:Array.from(sums,(v,i)=>areas[i]?v/areas[i]:field[Math.min(h-1,Math.floor(points[i][1]))*w+Math.min(w-1,Math.floor(points[i][0]))]),areas,centroids:points.map((p,i)=>areas[i]?[sx[i]/areas[i],sy[i]/areas[i]]:[...p])};
}

export function graphSites(luma,w,h,p,extent=Math.max(w,h)){
 const pitch=Math.max(.9,p.size*extent/1000),stepY=pitch*Math.sqrt(3)/2,points=[];
 for(let y=stepY/2,row=0;y<h;y+=stepY,row++)for(let x=pitch/2+(row%2)*pitch/2;x<w;x+=pitch)points.push([x,y]);
 if(!points.length)points.push([w/2,h/2]);
 const first=graphMesh(points),importance=graphImportance(luma,w,h,p.adapt),mapped=graphCells(points,importance,w,h),selected=graphDiffuse(first,mapped.values,{base:1,detail:0,seed:p.seed}).labels;
 let kept=points.filter((_,i)=>selected[i]);
 if(!kept.length)kept=[[w/2,h/2]];
 kept=kept.map(([x,y],i)=>[clamp(x+(hash(i,15,p.seed)-.5)*pitch*.3,pitch*.05,w-pitch*.05),clamp(y+(hash(i,21,p.seed)-.5)*pitch*.3,pitch*.05,h-pitch*.05)]);
 // A fixed collar closes the complete image rectangle, including sparse areas.
 const fixed=[],nx=Math.ceil(w/pitch),ny=Math.ceil(h/stepY);
 for(let i=0;i<=nx;i++){const x=i*w/nx;fixed.push([x,0],[x,h]);}
 for(let i=1;i<ny;i++){const y=i*h/ny;fixed.push([0,y],[w,y]);}
 const unique=new Map();for(const pt of [...kept,...fixed])unique.set(pt.join(','),pt);kept=[...unique.values()];
 const cells=graphCells(kept,luma,w,h),relaxed=kept.map((pt,i)=>pt[0]===0||pt[0]===w||pt[1]===0||pt[1]===h?pt:cells.centroids[i]);
 // Discrete Voronoi quadrature can put two subpixel sites on the same centroid.
 const seen=new Set(),result=[];for(const pt of relaxed){const key=pt.join(',');if(!seen.has(key)){seen.add(key);result.push(pt);}}
 return {graph:graphMesh(result),importance,firstCount:points.length,selectedCount:selected.reduce((a,b)=>a+b,0)};
}

export function polygonArea(loop){let s=0;for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length];s+=a[0]*b[1]-a[1]*b[0];}return s/2;}

// Each mixed triangle is divided at the midpoints of its two crossed edges.
// Cancelling shared oriented edges extracts component loops WITH their holes.
export function graphRegions(graph,labels){
 const {points,triangles,adj}=graph,parent=points.map((_,i)=>i);
 function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
 for(let i=0;i<points.length;i++)for(const j of adj[i])if(labels[i]===labels[j])parent[root(j)]=root(i);
 const groups=new Map(),vertices=new Map(points.map((p,i)=>['n'+i,p]));
 for(let i=0;i<points.length;i++){const r=root(i);if(!groups.has(r))groups.set(r,{label:labels[i],nodes:[],edges:new Map()});groups.get(r).nodes.push(i);}
 function mid(a,b){const key='m'+Math.min(a,b)+'_'+Math.max(a,b);if(!vertices.has(key))vertices.set(key,[(points[a][0]+points[b][0])/2,(points[a][1]+points[b][1])/2]);return key;}
 function piece(node,keys){const edges=groups.get(root(node)).edges;for(let i=0;i<keys.length;i++){const a=keys[i],b=keys[(i+1)%keys.length],key=a+'>'+b,reverse=b+'>'+a;if(edges.has(reverse))edges.delete(reverse);else edges.set(key,[a,b]);}}
 for(let k=0;k<triangles.length;k+=3){const t=Array.from(triangles.subarray(k,k+3));if(labels[t[0]]===labels[t[1]]&&labels[t[1]]===labels[t[2]]){piece(t[0],t.map(i=>'n'+i));continue;}
  const j=t.findIndex((id,i)=>labels[id]!==labels[t[(i+1)%3]]&&labels[id]!==labels[t[(i+2)%3]]),[a,b,c]=[t[j],t[(j+1)%3],t[(j+2)%3]],ab=mid(a,b),ac=mid(a,c);piece(a,['n'+a,ab,ac]);piece(b,['n'+b,'n'+c,ac,ab]);
 }
 const regions=[];
 for(const group of groups.values()){
  const next=new Map([...group.edges.values()].map(([a,b])=>[a,b])),loops=[];
  while(next.size){const start=next.keys().next().value;let at=start,keys=[];
   do{keys.push(at);const to=next.get(at);if(to===undefined)throw new Error('Unclosed graph region boundary');next.delete(at);at=to;}while(at!==start);
   loops.push(keys.map(k=>vertices.get(k)));
  }
  regions.push({label:group.label,nodes:group.nodes,loops,area:loops.reduce((s,l)=>s+polygonArea(l),0)});
 }
 return regions;
}

export function roundGraphLoop(loop,amount,w,h){
 let result=loop.map(p=>[...p]);const t=amount/100*.24;
 for(let pass=0;pass<2&&t>0;pass++){
  const next=[];for(let i=0;i<result.length;i++){const p=result[i],prev=result[(i+result.length-1)%result.length],after=result[(i+1)%result.length];if(p[0]===0||p[0]===w||p[1]===0||p[1]===h)next.push(p);else next.push([p[0]*(1-t)+prev[0]*t,p[1]*(1-t)+prev[1]*t],[p[0]*(1-t)+after[0]*t,p[1]*(1-t)+after[1]*t]);}result=next;
 }return result;
}

function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=clip(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}

export function graphPrimitives(regions,points,p,w,h){
 return regions.map(region=>{
  const loops=region.loops.map(l=>roundGraphLoop(l,p.round,w,h));
  if(region.nodes.length!==1)return {...region,loops};
  const center=points[region.nodes[0]],distances=loops.flatMap(l=>l.flatMap((a,i)=>{const b=l[(i+1)%l.length];const border=(a[0]===b[0]&&(a[0]===0||a[0]===w))||(a[1]===b[1]&&(a[1]===0||a[1]===h));return border?[]:[segmentDistance(center,a,b)];})),radius=(distances.length?Math.min(...distances):0)*p.dot/100;
  return {...region,loops,center,radius};
 });
}

function hsl(h,s,l){const a=s*Math.min(l,1-l),f=n=>{const k=(n+h/30)%12;return 255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)));};return [f(0),f(8),f(4)];}
export function graphColors(p){const t=p.tint/100,ink=hsl(p.hue,1,.2),paper=hsl(p.paper,.55,.93);return [ink.map(v=>v*t),paper.map(v=>255*(1-t)+v*t)];}

// Scan paths with a half-open edge convention at 2x2 sample positions. One byte
// stores four white bits per output pixel; no magnified image buffer is allocated.
export function renderGraphPrimitives(primitives,w,h,domainW,domainH,p){
 const white=new Uint8Array(w*h).fill(15),sx=w/domainW,sy=h/domainH;
 function span(y,left,right,value){const first=Math.max(0,Math.ceil(left*2-.5)),last=Math.min(w*2,Math.ceil(right*2-.5)),row=(y>>1)*w,bit0=(y&1)*2;
  for(let x=first;x<last;x++){const i=row+(x>>1),bit=1<<(bit0+(x&1));if(value)white[i]|=bit;else white[i]&=15^bit;}
 }
 function path(loops,value){const segments=[],buckets=new Map();let yMin=h*2,yMax=0;
  for(const loop of loops)for(let i=0;i<loop.length;i++){let [x0,y0]=loop[i], [x1,y1]=loop[(i+1)%loop.length];x0*=sx;x1*=sx;y0*=sy;y1*=sy;if(y0===y1)continue;if(y0>y1){[x0,x1]=[x1,x0];[y0,y1]=[y1,y0];}
   const first=Math.max(0,Math.ceil(y0*2-.5)),last=Math.min(h*2,Math.ceil(y1*2-.5));if(first>=last)continue;const segment={x0,y0,slope:(x1-x0)/(y1-y0),last};segments.push(segment);if(!buckets.has(first))buckets.set(first,[]);buckets.get(first).push(segment);yMin=Math.min(yMin,first);yMax=Math.max(yMax,last);
  }
  let active=[];for(let y=yMin;y<yMax;y++){active=active.filter(s=>s.last>y);active.push(...(buckets.get(y)||[]));const values=active.map(s=>s.x0+((y+.5)/2-s.y0)*s.slope).sort((a,b)=>a-b);for(let i=0;i+1<values.length;i+=2)span(y,values[i],values[i+1],value);}
 }
 function dot(center,radius,value){if(radius<=0)return;const cx=center[0]*sx,cy=center[1]*sy,rx=radius*sx,ry=radius*sy;
  for(let y=Math.max(0,Math.ceil((cy-ry)*2-.5));y<Math.min(h*2,Math.ceil((cy+ry)*2-.5));y++){const dy=((y+.5)/2-cy)/ry,dx=rx*Math.sqrt(Math.max(0,1-dy*dy));span(y,cx-dx,cx+dx,value);}
 }
 // Regions have even-odd holes. Since their interiors do not overlap, draw order
 // is immaterial. A white singleton replaces its full white hole by a black cell
 // plus a white inscribed dot. Black singletons use the white initial canvas.
 for(const q of primitives)if(!q.center&&q.label===0)path(q.loops,0);
 for(const q of primitives)if(q.center){if(q.label===1)path(q.loops,0);dot(q.center,q.radius,q.label);}
 const [ink,paper]=graphColors(p),count=Uint8Array.from({length:16},(_,v)=>v.toString(2).replaceAll('0','').length),out=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<white.length;i++){const t=count[white[i]]/4;for(let c=0;c<3;c++)out[i*4+c]=ink[c]*(1-t)+paper[c]*t;out[i*4+3]=255;}
 return out;
}

export function graphImage(a,w,h,p){
 const guide=curveGuide(a,w,h,Math.min(GRAPH_GUIDE_MAX,Math.max(256,Math.round(3000/p.size)))),W=guide.w,H=guide.h,source=Float64Array.from({length:W*H},(_,i)=>guide.rgb[i*3]*.2126+guide.rgb[i*3+1]*.7152+guide.rgb[i*3+2]*.0722);
 // Close the graph outside the photograph. A fixed collar ON the actual crop
 // produced an unwanted row of regularly spaced edge dots. Edge-clamped
 // overscan gives these artificial boundary nodes and their errors room outside.
 const extent=Math.max(W,H),pad=Math.ceil(Math.max(.9,p.size*extent/1000)*3),PW=W+pad*2,PH=H+pad*2,luma=new Float64Array(PW*PH);
 for(let y=0;y<PH;y++)for(let x=0;x<PW;x++)luma[y*PW+x]=source[clamp(y-pad,0,H-1)*W+clamp(x-pad,0,W-1)];
 const result=graphSites(luma,PW,PH,p,extent),cells=graphCells(result.graph.points,luma,PW,PH),diffused=graphDiffuse(result.graph,cells.values,{base:p.diffusion/100,detail:p.detail/100*6,seed:p.seed}),graph={...result.graph,points:result.graph.points.map(([x,y])=>[x-pad,y-pad])},regions=graphRegions(graph,diffused.labels),primitives=graphPrimitives(regions,graph.points,p,W,H),importance=Float64Array.from({length:W*H},(_,i)=>result.importance[(Math.floor(i/W)+pad)*PW+i%W+pad]);
 return {...result,graph,importance,cells:{...cells,centroids:cells.centroids.map(([x,y])=>[x-pad,y-pad])},labels:diffused.labels,regions,primitives,w:W,h:H,coverageArea:PW*PH,padding:pad};
}

export function graphPlates(a,w,h,p){const image=graphImage(a,w,h,p);return renderGraphPrimitives(image.primitives,w,h,image.w,image.h,p);}
