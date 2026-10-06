// Dedicated paper material renderer derived from the local curl-sheet rasterizer.
// Kept separate so previously approved sheet and pinned-film rendering stays unchanged.
import {sample,hash} from './pixels.js';
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function rasterTriangle(v,x0,y0,tw,th,ss,write){
 const area=cross(...v);if(Math.abs(area)<1e-12)return;
 const xmin=Math.max(0,Math.ceil((Math.min(...v.map(p=>p.x))-x0)*ss-.5)),xmax=Math.min(tw*ss-1,Math.floor((Math.max(...v.map(p=>p.x))-x0)*ss-.5)),ymin=Math.max(0,Math.ceil((Math.min(...v.map(p=>p.y))-y0)*ss-.5)),ymax=Math.min(th*ss-1,Math.floor((Math.max(...v.map(p=>p.y))-y0)*ss-.5));
 for(let yy=ymin;yy<=ymax;yy++)for(let xx=xmin;xx<=xmax;xx++){
  const p={x:x0+(xx+.5)/ss,y:y0+(yy+.5)/ss},a=cross(v[1],v[2],p)/area,b=cross(v[2],v[0],p)/area,c=1-a-b;if(a>=-1e-10&&b>=-1e-10&&c>=-1e-10)write(yy*tw*ss+xx,a,b,c);
 }
}

// Tiled supersampling bounds depth/coverage memory independently of output
// dimensions. Photographic texture is sampled from the native input, not a
// reduced paint grid. A z buffer resolves front/back folds and other flaps.
export function peelProjection(p,view=25){const amount=Math.tan(view*Math.PI/180)/Math.sqrt(2);return {...p,x:p.x+p.z*amount,y:p.y+p.z*amount};}

export function renderPeelScene(a,w,h,scene,{paper=90,under=0,back=96,light=315,shadow=60,view=25}={}, {tileSize=96,samples=2,diagnostics=false}={}){
 const pop=Uint8Array.from({length:4096},(_,m)=>{let n=0;while(m){m&=m-1;n++;}return n;});
 const out=new Uint8ClampedArray(a),cols=Math.ceil(w/tileSize),buckets=new Map(),phase=light*Math.PI/180,L=[Math.cos(phase)*.45,Math.sin(phase)*.45,Math.sqrt(1-.45**2)],lights=Array.from({length:12},(_,i)=>[L[0]/L[2]+Math.cos(i*Math.PI*2/12)*.055,L[1]/L[2]+Math.sin(i*Math.PI*2/12)*.055]);
 function bucketTriangle(v,type,index){
  const x0=Math.max(0,Math.floor(Math.min(...v.map(p=>p.x))/tileSize)),x1=Math.min(cols-1,Math.floor(Math.max(...v.map(p=>p.x))/tileSize)),y0=Math.max(0,Math.floor(Math.min(...v.map(p=>p.y))/tileSize)),y1=Math.min(Math.ceil(h/tileSize)-1,Math.floor(Math.max(...v.map(p=>p.y))/tileSize));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const key=y*cols+x;if(!buckets.has(key))buckets.set(key,{holes:[],triangles:[],shadows:[]});buckets.get(key)[type].push(index);}
 }
 const visible=scene.triangles.map(t=>{const v=t.v.map(p=>peelProjection(p,view));return {...t,v,back:cross(...v)*cross(...v.map(p=>({x:p.u,y:p.v})))<0};});
 scene.holes.forEach((t,i)=>bucketTriangle(t.v,'holes',i));scene.triangles.forEach((t,i)=>{
  bucketTriangle(visible[i].v,'triangles',i);if(!shadow)return;
  for(let j=0;j<12;j++){const v=t.v.map(p=>({x:p.x-p.z*lights[j][0],y:p.y-p.z*lights[j][1]})),index=i*12+j;bucketTriangle(v,'shadows',index);}
 });
 const ground=[paper/100*255,paper/100*253,paper/100*246],underside=[back/100*255,back/100*251,back/100*238],stats={tiles:buckets.size,triangles:scene.triangles.length,frontSamples:0,backSamples:0,coveredSamples:0};
 for(const [key,bucket] of buckets){
  const x0=key%cols*tileSize,y0=Math.floor(key/cols)*tileSize,tw=Math.min(tileSize,w-x0),th=Math.min(tileSize,h-y0),sw=tw*samples,n=sw*th*samples,pixels=new Uint8ClampedArray(n*3),depth=new Float32Array(n),occlusion=new Uint16Array(n),kind=diagnostics?new Uint8Array(n):null;
  for(let y=0;y<th*samples;y++)for(let x=0;x<sw;x++){const i=y*sw+x,j=((y0+Math.floor(y/samples))*w+x0+Math.floor(x/samples))*4;for(let c=0;c<3;c++)pixels[i*3+c]=a[j+c];}
  for(const index of bucket.holes)rasterTriangle(scene.holes[index].v,x0,y0,tw,th,samples,i=>{for(let c=0;c<3;c++){const X=x0+(i%sw+.5)/samples,Y=y0+(Math.floor(i/sw)+.5)/samples,ink=sample(a,w,h,X-w*.045,Y+h*.018,c);pixels[i*3+c]=ground[c]*(1-under/100)+ink*under/100-.8*hash(Math.floor(X),Math.floor(Y),17);}});
  for(const index of bucket.shadows){const ray=index%12,t=scene.triangles[Math.floor(index/12)],v=t.v.map(p=>({x:p.x-p.z*lights[ray][0],y:p.y-p.z*lights[ray][1]}));rasterTriangle(v,x0,y0,tw,th,samples,i=>{occlusion[i]|=1<<ray;});}
  if(shadow)for(let i=0;i<n;i++){const m=occlusion[i],count=pop[m],shade=1-count/12*shadow/100*.52;for(let c=0;c<3;c++)pixels[i*3+c]*=shade;}
  for(const index of bucket.triangles){
   const q=visible[index],v=q.v;rasterTriangle(v,x0,y0,tw,th,samples,(i,aa,bb,cc)=>{
    const z=v[0].z*aa+v[1].z*bb+v[2].z*cc;if(z<depth[i]-1e-7)return;depth[i]=z;
    let nx=v[0].nx*aa+v[1].nx*bb+v[2].nx*cc,ny=v[0].ny*aa+v[1].ny*bb+v[2].ny*cc,nz=v[0].nz*aa+v[1].nz*bb+v[2].nz*cc;const den=Math.max(1e-12,Math.hypot(nx,ny,nz)),sign=q.back?-1:1,dot=Math.max(0,(nx*L[0]+ny*L[1]+nz*L[2])/den*sign),shade=(.4+.6*dot)/(.4+.6*L[2]),u=v[0].u*aa+v[1].u*bb+v[2].u*cc-.5,t=v[0].v*aa+v[1].v*bb+v[2].v*cc-.5;
    for(let c=0;c<3;c++)pixels[i*3+c]=(q.back?underside[c]*(.985+.015*hash(Math.floor(u),Math.floor(t),17))-.7*Math.sin(u*2.9+t*.12):sample(a,w,h,u,t,c))*shade;
    if(kind)kind[i]=q.back?2:1;
   });
  }
  if(kind)for(const k of kind)if(k){stats[k===2?'backSamples':'frontSamples']++;stats.coveredSamples++;}
  for(let y=0;y<th;y++)for(let x=0;x<tw;x++){
   const i=((y0+y)*w+x0+x)*4;for(let c=0;c<3;c++){let sum=0;for(let yy=0;yy<samples;yy++)for(let xx=0;xx<samples;xx++)sum+=pixels[((y*samples+yy)*sw+x*samples+xx)*3+c];out[i+c]=sum/(samples*samples);}out[i+3]=255;
  }
 }
 return diagnostics?{out,stats}:out;
}
