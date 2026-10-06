import {hash,sample} from './pixels.js';
import {curveGuide,extractCurves} from './diffusion-curves.js';

export const PEEL_ANALYSIS_EDGE=256;
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const length=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);

// The source footprint is independent of curl, lighting and paper colors.
// Paths are selected from color boundaries, not inferred material fractures.
function arcTable(points){const arc=[0];for(let i=1;i<points.length;i++)arc.push(arc.at(-1)+length(points[i-1],points[i]));return arc;}
function onArc(points,arc,t){
 let lo=0,hi=arc.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(arc[mid]<=t)lo=mid;else hi=mid;}
 const a=points[lo],b=points[Math.min(lo+1,points.length-1)],f=clamp((t-arc[lo])/Math.max(1e-12,arc[Math.min(lo+1,arc.length-1)]-arc[lo]));return {x:a.x*(1-f)+b.x*f,y:a.y*(1-f)+b.y*f};
}
function inside(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
function crossing(a,b,c,d){const p=cross(a,b,c),q=cross(a,b,d),r=cross(c,d,a),s=cross(c,d,b);return p*q<-1e-20&&r*s<-1e-20;}
function bounds(poly){return {x0:Math.min(...poly.map(p=>p.x)),x1:Math.max(...poly.map(p=>p.x)),y0:Math.min(...poly.map(p=>p.y)),y1:Math.max(...poly.map(p=>p.y))};}
function overlaps(a,b){
 const A=bounds(a),B=bounds(b);if(A.x1<=B.x0||B.x1<=A.x0||A.y1<=B.y0||B.y1<=A.y0)return false;
 for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)if(crossing(a[i],a[(i+1)%a.length],b[j],b[(j+1)%b.length]))return true;
 return a.some(p=>inside(p,b))||b.some(p=>inside(p,a));
}
export function peelFootprint(path){return [...path.points,...path.points.slice(1,-1).reverse().map(p=>({x:p.x+p.nx*p.width,y:p.y+p.ny*p.width}))];}
function simple(poly){for(let i=0;i<poly.length;i++)for(let j=i+2;j<poly.length;j++){if(i===0&&j===poly.length-1)continue;if(crossing(poly[i],poly[(i+1)%poly.length],poly[j],poly[(j+1)%poly.length]))return false;}return true;}

export function selectPeelPaths(a,w,h,{pieces=4,length:span=350,width=100,seed=17}={}){
 const guide=curveGuide(a,w,h,PEEL_ANALYSIS_EDGE),{curves}=extractCurves(guide,{detail:65,length:20,smooth:85}),candidates=[];
 for(let id=0;id<Math.min(80,curves.length);id++){
  const curve=curves[id],arc=arcTable(curve.points),total=arc.at(-1),extent=Math.min(span/1000,total*.85);if(extent<Math.max(.035,width/1000*.6))continue;
  for(let trial=0;trial<3;trial++){
   const start=hash(id,trial*7+1,seed)*(total-extent),n=Math.max(8,Math.ceil(extent*1000/6)),side=hash(id,trial*7+2,seed)>.5?1:-1;
   let points=Array.from({length:n+1},(_,i)=>onArc(curve.points,arc,start+extent*i/n));
   for(let pass=0;pass<3;pass++){const old=points;points=old.map((p,i)=>i===0||i===n?p:{x:(old[i-1].x+2*p.x+old[i+1].x)/4,y:(old[i-1].y+2*p.y+old[i+1].y)/4});}
   for(let i=0;i<=n;i++){
    const p=points[i],before=points[Math.max(0,i-1)],after=points[Math.min(n,i+1)],dx=after.x-before.x,dy=after.y-before.y,L=Math.hypot(dx,dy);
    p.nx=L?-dy/L*side:0;p.ny=L?dx/L*side:0;p.width=width/1000*Math.sin(Math.PI*i/n)**.8*(.9+.2*hash(id,31,seed));p.t=i/n;
    if(i&&i<n){const aa=length(before,p),bb=length(p,after),cc=length(before,after),turn=Math.abs(cross(before,p,after));if(turn>1e-12)p.width=Math.min(p.width,aa*bb*cc/(2*turn)*.4);}
   }
   // A local curvature limit must not turn the free boundary into teeth.
   // The two sweeps bound its slope without growing any narrow section.
   for(let i=1;i<=n;i++)points[i].width=Math.min(points[i].width,points[i-1].width+.7*length(points[i-1],points[i]));
   for(let i=n-1;i>=0;i--)points[i].width=Math.min(points[i].width,points[i+1].width+.7*length(points[i],points[i+1]));
   let regular=true;for(let i=0;i<n;i++){
    const a=points[i],b=points[i+1],c={x:a.x+a.nx*a.width,y:a.y+a.ny*a.width},d={x:b.x+b.nx*b.width,y:b.y+b.ny*b.width};
    if(cross(a,b,c)*side<-1e-12||cross(c,b,d)*side<-1e-12){regular=false;break;}
   }
   if(!regular)continue;
   const path={points,id,score:curve.score*(.6+.8*hash(id,trial*7+3,seed)),length:extent},poly=peelFootprint(path);
   if(!simple(poly)||Math.max(...points.map(p=>p.width))<.008)continue;candidates.push({path,poly});
  }
 }
 candidates.sort((a,b)=>b.path.score-a.path.score);const chosen=[];
 for(const q of candidates){if(chosen.length>=pieces)break;if(chosen.some(r=>overlaps(q.poly,r.poly)))continue;chosen.push(q);}
 return chosen.map(q=>q.path);
}

// Isometric circular cross section, measured from the attached boundary.
// Curved boundaries and longitudinal taper are geometric approximations;
// this does not solve a thin-shell stress or adhesion evolution equation.
export function curlSection(s,width,angle){
 if(width<=1e-14||Math.abs(angle)<1e-8)return {u:s,z:0};const k=angle/width,t=k*s;return {u:Math.sin(t)/k,z:(1-Math.cos(t))/k};
}
function interpolate(a,b,t){const o={};for(const key of ['x','y','z','u','v','nx','ny','nz'])o[key]=a[key]*(1-t)+b[key]*t;return o;}
function clipTriangle(vertices,w,h){
 let poly=vertices;
 for(const [key,bound,sign] of [['u',0,1],['u',w,-1],['v',0,1],['v',h,-1]]){
  const old=poly;poly=[];if(!old.length)break;
  for(let i=0;i<old.length;i++){const a=old[i],b=old[(i+1)%old.length],da=(a[key]-bound)*sign,db=(b[key]-bound)*sign;if(da>=-1e-10)poly.push(a);if((da<0)!==(db<0))poly.push(interpolate(a,b,da/(da-db)));}
 }
 const out=[];for(let i=1;i+1<poly.length;i++)out.push([poly[0],poly[i],poly[i+1]]);return out;
}

export function buildPeelScene(paths,w,h,{curl=190,sections}={}){
 const S=Math.max(w,h),angle=curl*Math.PI/180,across=sections??Math.max(24,Math.ceil(Math.abs(angle)/.075)),triangles=[],holes=[];
 for(let id=0;id<paths.length;id++){
  const path=paths[id],rows=path.points.length,vertices=[];
  for(let i=0;i<rows;i++){
   const p=path.points[i],theta=angle*Math.sin(Math.PI*p.t)**.35;
   for(let j=0;j<=across;j++){
    const s=p.width*j/across,{u,z}=curlSection(s,p.width,theta);vertices.push({x:(p.x+p.nx*u)*S,y:(p.y+p.ny*u)*S,z:z*S,u:(p.x+p.nx*s)*S,v:(p.y+p.ny*s)*S,nx:0,ny:0,nz:1});
   }
  }
  for(let i=0;i<rows;i++)for(let j=0;j<=across;j++){
   const k=i*(across+1)+j,p=vertices[k],a=vertices[Math.max(0,i-1)*(across+1)+j],b=vertices[Math.min(rows-1,i+1)*(across+1)+j],c=vertices[i*(across+1)+Math.max(0,j-1)],d=vertices[i*(across+1)+Math.min(across,j+1)];
   const tx=b.x-a.x,ty=b.y-a.y,tz=b.z-a.z,sx=d.x-c.x,sy=d.y-c.y,sz=d.z-c.z,nx=ty*sz-tz*sy,ny=tz*sx-tx*sz,nz=tx*sy-ty*sx,len=Math.hypot(nx,ny,nz);
   if(len>1e-12){const sign=Math.sign((b.u-a.u)*(d.v-c.v)-(b.v-a.v)*(d.u-c.u))||1;p.nx=nx/len*sign;p.ny=ny/len*sign;p.nz=nz/len*sign;}
  }
  for(let i=0;i<rows-1;i++){
   const k=i*(across+1),l=k+across+1,flat=[vertices[k],vertices[l],vertices[k+across],vertices[l+across]].map(p=>({...p,x:p.u,y:p.v,z:0,nx:0,ny:0,nz:1}));
   for(const ids of [[0,1,2],[2,1,3]])for(const v of clipTriangle(ids.map(i=>flat[i]),w,h))holes.push({v,id});
   for(let j=0;j<across;j++)for(const indices of [[k+j,l+j,k+j+1],[k+j+1,l+j,l+j+1]]){
    for(const v of clipTriangle(indices.map(k=>vertices[k]),w,h)){
     const material=cross(...v.map(p=>({x:p.u,y:p.v}))),a=v[0],b=v[1],c=v[2],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,ex=c.x-a.x,ey=c.y-a.y,ez=c.z-a.z,area3=Math.hypot(dy*ez-dz*ey,dz*ex-dx*ez,dx*ey-dy*ex);
     if(area3<1e-10||Math.abs(material)<1e-10)continue;triangles.push({v,id,back:cross(...v)*material<0});
    }
   }
  }
 }
 return {triangles,holes,paths};
}

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

export function renderPeelScene(a,w,h,scene,{paper=90,back=96,light=315,shadow=60,view=25}={}, {tileSize=96,samples=2,diagnostics=false}={}){
 const out=new Uint8ClampedArray(a),cols=Math.ceil(w/tileSize),buckets=new Map(),phase=light*Math.PI/180,L=[Math.cos(phase)*.45,Math.sin(phase)*.45,Math.sqrt(1-.45**2)],lights=Array.from({length:4},(_,i)=>[L[0]/L[2]+(i%2?1:-1)*.06,L[1]/L[2]+(i<2?1:-1)*.06]),shadows=[];
 function bucketTriangle(v,type,index){
  const x0=Math.max(0,Math.floor(Math.min(...v.map(p=>p.x))/tileSize)),x1=Math.min(cols-1,Math.floor(Math.max(...v.map(p=>p.x))/tileSize)),y0=Math.max(0,Math.floor(Math.min(...v.map(p=>p.y))/tileSize)),y1=Math.min(Math.ceil(h/tileSize)-1,Math.floor(Math.max(...v.map(p=>p.y))/tileSize));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const key=y*cols+x;if(!buckets.has(key))buckets.set(key,{holes:[],triangles:[],shadows:[]});buckets.get(key)[type].push(index);}
 }
 const visible=scene.triangles.map(t=>{const v=t.v.map(p=>peelProjection(p,view));return {...t,v,back:cross(...v)*cross(...v.map(p=>({x:p.u,y:p.v})))<0};});
 scene.holes.forEach((t,i)=>bucketTriangle(t.v,'holes',i));scene.triangles.forEach((t,i)=>{
  bucketTriangle(visible[i].v,'triangles',i);if(!shadow)return;
  for(let j=0;j<4;j++){const v=t.v.map(p=>({x:p.x-p.z*lights[j][0],y:p.y-p.z*lights[j][1]})),index=shadows.length;shadows.push({v,bit:1<<j});bucketTriangle(v,'shadows',index);}
 });
 const ground=[paper/100*255,paper/100*253,paper/100*246],underside=[back/100*255,back/100*251,back/100*238],stats={tiles:buckets.size,triangles:scene.triangles.length,frontSamples:0,backSamples:0,coveredSamples:0};
 for(const [key,bucket] of buckets){
  const x0=key%cols*tileSize,y0=Math.floor(key/cols)*tileSize,tw=Math.min(tileSize,w-x0),th=Math.min(tileSize,h-y0),sw=tw*samples,n=sw*th*samples,pixels=new Uint8ClampedArray(n*3),depth=new Float32Array(n),occlusion=new Uint8Array(n),kind=diagnostics?new Uint8Array(n):null;
  for(let y=0;y<th*samples;y++)for(let x=0;x<sw;x++){const i=y*sw+x,j=((y0+Math.floor(y/samples))*w+x0+Math.floor(x/samples))*4;for(let c=0;c<3;c++)pixels[i*3+c]=a[j+c];}
  for(const index of bucket.holes)rasterTriangle(scene.holes[index].v,x0,y0,tw,th,samples,i=>{for(let c=0;c<3;c++)pixels[i*3+c]=ground[c];});
  for(const index of bucket.shadows){const q=shadows[index];rasterTriangle(q.v,x0,y0,tw,th,samples,i=>{occlusion[i]|=q.bit;});}
  if(shadow)for(let i=0;i<n;i++){const m=occlusion[i],count=(m&1)+((m>>1)&1)+((m>>2)&1)+((m>>3)&1),shade=1-count/4*shadow/100*.65;for(let c=0;c<3;c++)pixels[i*3+c]*=shade;}
  for(const index of bucket.triangles){
   const q=visible[index],v=q.v;rasterTriangle(v,x0,y0,tw,th,samples,(i,aa,bb,cc)=>{
    const z=v[0].z*aa+v[1].z*bb+v[2].z*cc;if(z<depth[i]-1e-7)return;depth[i]=z;
    let nx=v[0].nx*aa+v[1].nx*bb+v[2].nx*cc,ny=v[0].ny*aa+v[1].ny*bb+v[2].ny*cc,nz=v[0].nz*aa+v[1].nz*bb+v[2].nz*cc;const den=Math.max(1e-12,Math.hypot(nx,ny,nz)),sign=q.back?-1:1,dot=Math.max(0,(nx*L[0]+ny*L[1]+nz*L[2])/den*sign),shade=(.4+.6*dot)/(.4+.6*L[2]),u=v[0].u*aa+v[1].u*bb+v[2].u*cc-.5,t=v[0].v*aa+v[1].v*bb+v[2].v*cc-.5;
    for(let c=0;c<3;c++)pixels[i*3+c]=(q.back?underside[c]:sample(a,w,h,u,t,c))*shade;
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

export function curlSheet(a,w,h,p){
 if(!p.curl||!p.width||!p.pieces)return new Uint8ClampedArray(a);const paths=selectPeelPaths(a,w,h,p);if(!paths.length)return new Uint8ClampedArray(a);return renderPeelScene(a,w,h,buildPeelScene(paths,w,h,p),p);
}
