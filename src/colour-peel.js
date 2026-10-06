import {sample,hash} from './pixels.js';
import {renderPeelScene} from './colour-sheet-raster.js';
import {gaussianBlur} from './research-math.js';
import {clipPinnedTriangle} from './pinned-film.js';
export const colourPeelDefaults={size:210,boundary:80,amount:65,curl:145,direction:250,scatter:65,paper:94,under:25,shadow:60,light:315,seed:17};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function colourRegions(a,w,h,p){
 const r=Math.min(1,320/Math.max(w,h)),W=Math.max(1,Math.round(w*r)),H=Math.max(1,Math.round(h*r)),n=W*H,step=Math.max(3,Math.max(W,H)*p.size/1000),rgb=new Float32Array(n*3),labels=new Int32Array(n),dist=new Float32Array(n),sites=[];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let c=0;c<3;c++)rgb[(y*W+x)*3+c]=sample(a,w,h,(x+.5)*w/W-.5,(y+.5)*h/H-.5,c);
 for(let c=0;c<3;c++){const channel=Float32Array.from({length:n},(_,i)=>rgb[i*3+c]),soft=gaussianBlur(channel,W,H,1.15);for(let i=0;i<n;i++)rgb[i*3+c]=soft[i];}
 for(let y=0;y<Math.ceil(H/step);y++)for(let x=0;x<Math.ceil(W/step);x++){const X=Math.min(W-1,(x+.25+.5*hash(x,y,p.seed))*step),Y=Math.min(H-1,(y+.25+.5*hash(x,y,p.seed+1))*step),i=(Math.floor(Y)*W+Math.floor(X))*3;sites.push({x:X,y:Y,c:[...rgb.slice(i,i+3)]});}
 for(let iter=0;iter<5;iter++){
  dist.fill(Infinity);
  for(let id=0;id<sites.length;id++){const s=sites[id],R=step*2.8;for(let y=Math.max(0,Math.floor(s.y-R));y<Math.min(H,s.y+R);y++)for(let x=Math.max(0,Math.floor(s.x-R));x<Math.min(W,s.x+R);x++){
   const i=y*W+x,k=i*3,d=((x-s.x)**2+(y-s.y)**2)/step**2+((rgb[k]-s.c[0])**2+(rgb[k+1]-s.c[1])**2+(rgb[k+2]-s.c[2])**2)/(90000/(1+p.boundary*.18));if(d<dist[i]){dist[i]=d;labels[i]=id;}
  }}
  const sums=sites.map(()=>[0,0,0,0,0,0]);for(let i=0;i<n;i++){const s=sums[labels[i]];s[0]+=i%W;s[1]+=Math.floor(i/W);for(let c=0;c<3;c++)s[c+2]+=rgb[i*3+c];s[5]++;}for(let id=0;id<sites.length;id++){const s=sums[id];if(s[5])sites[id]={x:s[0]/s[5],y:s[1]/s[5],c:s.slice(2,5).map(v=>v/s[5])};}
 }
 // Split every disconnected island; a fragment has exactly one connected footprint.
 const visited=new Uint8Array(n),ids=new Int32Array(n).fill(-1),queue=new Int32Array(n),parts=[];
 for(let i=0;i<n;i++)if(!visited[i]){let read=0,end=1;queue[0]=i;visited[i]=1;const cells=[];while(read<end){const j=queue[read++],x=j%W,y=Math.floor(j/W);cells.push(j);for(const k of[x?j-1:-1,x<W-1?j+1:-1,y?j-W:-1,y<H-1?j+W:-1])if(k>=0&&!visited[k]&&labels[k]===labels[i]){visited[k]=1;queue[end++]=k;}}
  if(cells.length<Math.max(6,step*step*.10))continue;const id=parts.length;for(const j of cells)ids[j]=id;parts.push({cells,id});
 }
 return {W,H,ids,parts};
}
export function colourScene(a,w,h,p){
 const f=colourRegions(a,w,h,p),{W,H,ids,parts}=f,triangles=[],holes=[];
 for(const part of parts){const id=part.id;if(hash(id,113,p.seed)*100>=p.amount)continue;
  const angle=(p.direction+(hash(id,3,p.seed)-.5)*p.scatter*2)*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle),coords=part.cells.map(i=>({x:(i%W+.5)*w/W,y:(Math.floor(i/W)+.5)*h/H})),projections=coords.map(q=>q.x*co+q.y*si),lo=Math.min(...projections),hi=Math.max(...projections),span=Math.max(w/W,hi-lo),hinge=lo+span*.10,k=p.curl*Math.PI/180*(.7+.6*hash(id,7,p.seed))/(span*.90);
  const move=(u,v)=>{const s=Math.max(0,u*co+v*si-hinge),t=k*s,shift=k?(Math.sin(t)/k-s):0,z=k?(1-Math.cos(t))/k:0;return{x:u+co*shift,y:v+si*shift,z,u,v,nx:-co*Math.sin(t),ny:-si*Math.sin(t),nz:Math.cos(t)};};
  const x0=Math.max(0,Math.floor(Math.min(...coords.map(q=>q.x))*W/w)-2),x1=Math.min(W,Math.ceil(Math.max(...coords.map(q=>q.x))*W/w)+2),y0=Math.max(0,Math.floor(Math.min(...coords.map(q=>q.y))*H/h)-2),y1=Math.min(H,Math.ceil(Math.max(...coords.map(q=>q.y))*H/h)+2),cols=x1-x0+1,vs=[];
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   let s=0,n=0;for(let yy=-1;yy<=0;yy++)for(let xx=-1;xx<=0;xx++){const X=clamp(x+xx,0,W-1),Y=clamp(y+yy,0,H-1);s+=ids[Y*W+X]===id?1:0;n++;}
   const label=s/n-.50+(hash(x,y,p.seed+id)*2-1)*.10;vs.push({...move(x*w/W,y*h/H),label});
  }
  for(let y=0;y<y1-y0;y++)for(let x=0;x<x1-x0;x++){const j=y*cols+x;for(const index of[[j,j+1,j+cols+1],[j,j+cols+1,j+cols]])for(const v of clipPinnedTriangle(index.map(i=>vs[i]))){holes.push({id,v:v.map(q=>({...q,x:q.u,y:q.v,z:0,nx:0,ny:0,nz:1}))});triangles.push({id,v});}}
 }
 return {triangles,holes,paths:[],field:f};
}
export function colourPeel(a,w,h,params={}){const p={...colourPeelDefaults,...params};if(!p.amount||!p.curl)return new Uint8ClampedArray(a);return renderPeelScene(a,w,h,colourScene(a,w,h,p),{...p,back:96,view:15});}
