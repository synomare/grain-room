import {clamp,hash,sample} from './pixels.js';

export const closedRouteDefaults={size:26,follow:80,random:35,angle:0,round:80,width:70,weight:70,gamma:120,reverse:0,mode:0,paper:0,lift:20};

// Every source pixel contributes to its requested cell; rendering stays native.
export function routeGrid(source,w,h,size=26){
 const cell=Math.max(1,size*Math.max(w,h)/1000),nx=Math.max(1,Math.round(w/cell)),ny=Math.max(1,Math.round(h/cell)),cw=w/nx,ch=h/ny,n=nx*ny;
 const colour=Array.from({length:3},()=>new Float64Array(n)),counts=new Uint32Array(n);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=Math.floor((2*y+1)*ny/(2*h))*nx+Math.floor((2*x+1)*nx/(2*w)),i=(y*w+x)*4;
  counts[j]++;for(let c=0;c<3;c++)colour[c][j]+=source[i+c];
 }
 for(let j=0;j<n;j++)for(let c=0;c<3;c++)colour[c][j]/=counts[j];
 return {nx,ny,cw,ch,n,colour,counts};
}

export function routeEdges(g,p=closedRouteDefaults){
 const {nx,ny,colour}=g,edges=[],value=j=>.2126*colour[0][j]+.7152*colour[1][j]+.0722*colour[2][j];
 const at=(x,y)=>value(clamp(y,0,ny-1)*nx+clamp(x,0,nx-1)),theta=p.angle*Math.PI/180,co=Math.cos(theta),si=Math.sin(theta);
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const a=y*nx+x,gx=at(x+1,y)-at(x-1,y),gy=at(x,y+1)-at(x,y-1),len=Math.hypot(gx,gy),tx=len?-gy/len:co,ty=len?gx/len:si;
  for(const [dx,dy] of [[1,0],[0,1]]){
   if(x+dx>=nx||y+dy>=ny)continue;
   const b=a+dx+dy*nx,alignment=(1-p.follow/100)*(1-Math.abs(dx*co+dy*si))+p.follow/100*(1-Math.abs(dx*tx+dy*ty));
   const difference=Math.hypot(...colour.map(c=>c[a]-c[b]))/(255*Math.sqrt(3));
   edges.push({a,b,weight:alignment*(1-p.random/100)*3+difference*p.follow/100*4+hash(a,b,p.seed??17)*p.random/100*2});
  }
 }
 return edges;
}

export function routeTree(g,p=closedRouteDefaults){
 const edges=routeEdges(g,p).sort((a,b)=>a.weight-b.weight||a.a-b.a||a.b-b.b),parent=Int32Array.from({length:g.n},(_,i)=>i),rank=new Uint8Array(g.n),tree=[];
 const root=x=>{while(parent[x]!==x){parent[x]=parent[parent[x]];x=parent[x];}return x;};
 for(const edge of edges){
  let a=root(edge.a),b=root(edge.b);if(a===b)continue;
  if(rank[a]<rank[b])[a,b]=[b,a];parent[b]=a;if(rank[a]===rank[b])rank[a]++;
  tree.push(edge);if(tree.length===g.n-1)break;
 }
 return tree;
}

export function stitchRoute(g,tree){
 const {n,nx,cw,ch}=g,count=n*4,first=new Int32Array(count),second=new Int32Array(count);
 if(tree.length!==n-1)throw new Error('A spanning tree is required for the closed route.');
 for(let j=0;j<n;j++)for(let k=0;k<4;k++){first[j*4+k]=j*4+(k+3)%4;second[j*4+k]=j*4+(k+1)%4;}
 const replace=(a,b,next)=>{if(first[a]===b)first[a]=next;else if(second[a]===b)second[a]=next;else throw new Error('Invalid route stitch.');};
 for(const {a,b} of tree){
  if(a<0||b>=n)throw new Error('Route stitch outside the grid.');
  if(b===a+1&&Math.floor(a/nx)===Math.floor(b/nx)){
   replace(a*4+1,a*4+2,b*4);replace(a*4+2,a*4+1,b*4+3);
   replace(b*4,b*4+3,a*4+1);replace(b*4+3,b*4,a*4+2);
  }else if(b===a+nx){
   replace(a*4+2,a*4+3,b*4+1);replace(a*4+3,a*4+2,b*4);
   replace(b*4,b*4+1,a*4+3);replace(b*4+1,b*4,a*4+2);
  }else throw new Error('Only adjacent grid cells can be stitched.');
 }
 const points=new Float64Array(count*2),ids=new Int32Array(count),visited=new Uint8Array(count),xs=[.25,.75,.75,.25],ys=[.25,.25,.75,.75];
 let before=-1,at=0;
 for(let k=0;k<count;k++){
  if(visited[at])throw new Error('Route contains separate cycles.');visited[at]=1;ids[k]=at;
  const cell=Math.floor(at/4),corner=at%4;points[k*2]=(cell%nx+xs[corner])*cw;points[k*2+1]=(Math.floor(cell/nx)+ys[corner])*ch;
  const next=first[at]===before?second[at]:first[at];before=at;at=next;
 }
 if(at!==0)throw new Error('Route does not close.');
 return {points,ids,first,second};
}

// Local quadratic fillets stay inside each corner's adjacent segments.
export function roundRoute(points,round=80){
 const n=points.length/2;
 if(!round){const out=new Float64Array(points.length+2);out.set(points);out.set(points.subarray(0,2),points.length);return out;}
 const enter=new Float64Array(points.length),leave=new Float64Array(points.length),out=new Float64Array((n*7+1)*2);
 for(let j=0;j<n;j++){
  const i=j*2,b=((j+n-1)%n)*2,a=((j+1)%n)*2,x=points[i],y=points[i+1],l0=Math.hypot(x-points[b],y-points[b+1]),l1=Math.hypot(points[a]-x,points[a+1]-y),radius=Math.min(l0,l1)*.44*round/100;
  enter[i]=x+(points[b]-x)*radius/(l0||1);enter[i+1]=y+(points[b+1]-y)*radius/(l0||1);
  leave[i]=x+(points[a]-x)*radius/(l1||1);leave[i+1]=y+(points[a+1]-y)*radius/(l1||1);
 }
 out.set(enter.subarray(0,2));let offset=2;
 for(let j=0;j<n;j++){
  const i=j*2;
  for(let k=1;k<=6;k++){
   const t=k/6,u=1-t;out[offset++]=u*u*enter[i]+2*t*u*points[i]+t*t*leave[i];out[offset++]=u*u*enter[i+1]+2*t*u*points[i+1]+t*t*leave[i+1];
  }
  const next=((j+1)%n)*2;out[offset++]=enter[next];out[offset++]=enter[next+1];
 }
 return out;
}

export function strokeRouteMask(mask,w,h,x0,y0,x1,y1,radius){
 const dx=x1-x0,dy=y1-y0,length=dx*dx+dy*dy,minx=Math.max(0,Math.floor(Math.min(x0,x1)-radius-.5)),maxx=Math.min(w-1,Math.ceil(Math.max(x0,x1)+radius+.5)),miny=Math.max(0,Math.floor(Math.min(y0,y1)-radius-.5)),maxy=Math.min(h-1,Math.ceil(Math.max(y0,y1)+radius+.5));
 for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){
  const t=length?clamp(((x+.5-x0)*dx+(y+.5-y0)*dy)/length,0,1):0,d=Math.hypot(x+.5-x0-t*dx,y+.5-y0-t*dy),coverage=clamp(radius+.5-d,0,1),i=y*w+x;
  mask[i]=Math.max(mask[i],coverage);
 }
}

export function routeMask(source,w,h,p=closedRouteDefaults){
 const grid=routeGrid(source,w,h,p.size),tree=routeTree(grid,p),route=stitchRoute(grid,tree),curve=roundRoute(route.points,p.round),mask=new Float32Array(w*h),radius=Math.min(grid.cw,grid.ch)*(.01+p.width/100*.21);
 for(let k=2;k<curve.length;k+=2){
  const x=(curve[k-2]+curve[k])/2,y=(curve[k-1]+curve[k+1])/2;
  let light=(sample(source,w,h,x,y,0)*.2126+sample(source,w,h,x,y,1)*.7152+sample(source,w,h,x,y,2)*.0722)/255;
  if(p.reverse)light=1-light;light=Math.pow(light,p.gamma/100);
  const r=radius*((1-p.weight/100)+p.weight/100*(.2+.8*light));
  strokeRouteMask(mask,w,h,curve[k-2],curve[k-1],curve[k],curve[k+1],r);
 }
 return {mask,grid,tree,route,curve};
}

export function closedRoute(source,w,h,p=closedRouteDefaults){
 const {mask}=routeMask(source,w,h,p),out=new Uint8ClampedArray(source.length),background=p.paper*2.55,power=1-p.lift*.007;
 const tone=Float32Array.from({length:256},(_,v)=>255*(v/255)**power);
 for(let j=0;j<w*h;j++){
  const i=j*4;
  for(let c=0;c<3;c++){
   const ink=p.mode===0?tone[source[i+c]]:p.mode===1?0:p.mode===2?255:tone[255-source[i+c]];
   out[i+c]=background+(ink-background)*mask[j];
  }
  out[i+3]=255;
 }
 return out;
}
