import {lum,clamp} from './pixels.js';
import {gaussianBlur} from './research-math.js';
import {renderPeelScene} from './curl-sheet.js';
export const pinnedDefaults={threshold:70,smooth:20,side:1,pickX:32,pickY:28,pinX:38,pinY:20,hold:35,pull:130,direction:110,gather:40,twist:20,lift:90,mode:0,paper:94,shadow:60,light:315};
export function pinnedSelection(a,w,h,p,edge=128){
 const r=Math.min(1,edge/Math.max(w,h)),W=Math.max(1,Math.round(w*r)),H=Math.max(1,Math.round(h*r)),sum=new Float64Array(W*H),count=new Uint32Array(sum.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=Math.min(H-1,Math.floor((y+.5)*H/h))*W+Math.min(W-1,Math.floor((x+.5)*W/w));sum[j]+=lum(a,(y*w+x)*4)/255;count[j]++;}
 const means=Float32Array.from(sum,(v,i)=>v/count[i]),field=gaussianBlur(means,W,H,p.smooth*Math.max(W,H)/1000),sorted=[...field].sort((a,b)=>a-b),cut=sorted[Math.floor((sorted.length-1)*p.threshold/100)],eligible=Uint8Array.from(field,v=>p.side?Number(v>=cut):Number(v<cut)),mask=new Uint8Array(W*H),queue=new Int32Array(W*H);let start=-1,best=Infinity;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(eligible[y*W+x]){const d=((x+.5)*w/W-p.pickX*w/100)**2+((y+.5)*h/H-p.pickY*h/100)**2;if(d<best){best=d;start=y*W+x;}}
 if(start<0)return {w:W,h:H,mask,means,field,cut,empty:true};
 let read=0,write=1;queue[0]=start;mask[start]=1;
 while(read<write){const i=queue[read++],x=i%W,y=Math.floor(i/W);for(const j of [x?i-1:-1,x<W-1?i+1:-1,y?i-W:-1,y<H-1?i+W:-1])if(j>=0&&eligible[j]&&!mask[j]){mask[j]=1;queue[write++]=j;}}
 let pin=null,score=Infinity;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(mask[y*W+x]){const u=(x+.5)*w/W,v=(y+.5)*h/H,d=(u-p.pinX*w/100)**2+(v-p.pinY*h/100)**2;if(d<score){score=d;pin={x:u,y:v};}}
 return {w:W,h:H,mask,means,field,cut,empty:false,start,count:write,pin};
}
export function pinnedPoint(u,v,pin,longest,p){
 const dx=u-pin.x,dy=v-pin.y,R=longest*p.hold/1000,t=clamp((Math.hypot(dx,dy)-R)/(longest*.32),0,1),weight=t*t*(3-2*t),scale=1-p.gather/100*weight,angle=p.twist*Math.PI/180*weight,d=p.direction*Math.PI/180;
 return {x:pin.x+scale*(dx*Math.cos(angle)-dy*Math.sin(angle))+longest*p.pull/1000*weight*Math.cos(d),y:pin.y+scale*(dx*Math.sin(angle)+dy*Math.cos(angle))+longest*p.pull/1000*weight*Math.sin(d),z:longest*p.lift/1000*weight*(1-.45*weight),u,v,weight};
}
const blend=(a,b,t)=>Object.fromEntries(Object.keys(a).map(k=>[k,a[k]+(b[k]-a[k])*t]));
export function clipPinnedTriangle(vertices){
 const poly=[];
 for(let i=0;i<3;i++){const a=vertices[i],b=vertices[(i+1)%3],A=a.label,B=b.label;if(A>=0)poly.push(a);if((A<0)!==(B<0))poly.push(blend(a,b,A/(A-B)));}
 const out=[];for(let i=1;i+1<poly.length;i++)out.push([poly[0],poly[i],poly[i+1]]);return out;
}
export function pinnedScene(selection,w,h,p){
 const {w:W,h:H,mask,pin,field,cut}=selection,longest=Math.max(w,h),vertices=[],cols=W+2,rows=H+2,triangles=[],holes=[];
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  const u=clamp((x-.5)*w/W,0,w),v=clamp((y-.5)*h/H,0,h),i=Math.min(H-1,Math.max(0,y-1))*W+Math.min(W-1,Math.max(0,x-1)),value=(field[i]-cut)*(p.side?1:-1),label=mask[i]?Math.max(0,value):-Math.max(1e-7,Math.abs(value)),q=pinnedPoint(u,v,pin,longest,p),eps=.25,A=pinnedPoint(u-eps,v,pin,longest,p),B=pinnedPoint(u+eps,v,pin,longest,p),C=pinnedPoint(u,v-eps,pin,longest,p),D=pinnedPoint(u,v+eps,pin,longest,p),tx=B.x-A.x,ty=B.y-A.y,tz=B.z-A.z,sx=D.x-C.x,sy=D.y-C.y,sz=D.z-C.z,nx=ty*sz-tz*sy,ny=tz*sx-tx*sz,nz=tx*sy-ty*sx,n=Math.hypot(nx,ny,nz)||1;
  vertices.push({...q,label,nx:nx/n,ny:ny/n,nz:nz/n});
 }
 for(let y=0;y<rows-1;y++)for(let x=0;x<cols-1;x++){const k=y*cols+x;for(const ids of [[k,k+1,k+cols+1],[k,k+cols+1,k+cols]])for(const v of clipPinnedTriangle(ids.map(i=>vertices[i]))){holes.push({id:0,v:v.map(q=>({...q,x:q.u,y:q.v,z:0,nx:0,ny:0,nz:1}))});if(!p.mode)triangles.push({id:0,v});}}
 return {triangles,holes,paths:[],selection};
}
export function pinnedFilm(a,w,h,params={}){
 const p={...pinnedDefaults,...params};if(!p.mode&&!p.pull&&!p.gather&&!p.twist&&!p.lift)return new Uint8ClampedArray(a);
 const selection=pinnedSelection(a,w,h,p);if(selection.empty)return new Uint8ClampedArray(a);
 return renderPeelScene(a,w,h,pinnedScene(selection,w,h,p),{paper:p.paper,shadow:p.shadow,light:p.light,back:96,view:20});
}
