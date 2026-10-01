import {hash,clamp,sample} from './pixels.js';
import {grid,at,blur} from './research-math.js';

// Dual of a nonsingular N-grid; N=4 gives square/45-degree-rhombus prototiles.
// Tile geometry is shared across neighbors. Photo sampling and opening are original.
export function multigridTiles(families=4,radius=8,seed=17){
 const e=Array.from({length:families},(_,j)=>[Math.cos(j*Math.PI/families),Math.sin(j*Math.PI/families)]),shifts=e.map((_,j)=>.17+.61*hash(j,924,seed)),tiles=[];
 for(let i=0;i<families;i++)for(let j=i+1;j<families;j++){
  const det=e[i][0]*e[j][1]-e[i][1]*e[j][0];
  for(let m=-radius;m<=radius;m++)for(let n=-radius;n<=radius;n++){
   const px=((m-shifts[i])*e[j][1]-(n-shifts[j])*e[i][1])/det,py=(e[i][0]*(n-shifts[j])-e[j][0]*(m-shifts[i]))/det;
   if(Math.hypot(px,py)>radius)continue;
   const k=e.map((v,q)=>q===i?m:q===j?n:Math.ceil(v[0]*px+v[1]*py+shifts[q]));
   const base=[0,0];for(let q=0;q<families;q++){base[0]+=(k[q]-shifts[q])*e[q][0];base[1]+=(k[q]-shifts[q])*e[q][1];}
   const vertices=[[base[0],base[1]],[base[0]+e[i][0],base[1]+e[i][1]],[base[0]+e[i][0]+e[j][0],base[1]+e[i][1]+e[j][1]],[base[0]+e[j][0],base[1]+e[j][1]]];
   tiles.push({vertices,i,j,key:k.join(','),area:Math.abs(det)});
  }
 }return tiles;
}
export function barycentric(px,py,a,b,c){
 const d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(d)<1e-10)return null;
 const u=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/d,v=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/d;
 return [u,v,1-u-v];
}
export function quasicut(a,w,h,p){
 const span=Math.max(w,h),size=p.size/1000*span,theta=p.angle*Math.PI/180,ca=Math.cos(theta),sa=Math.sin(theta),R=Math.ceil(1.8*span/size/p.symmetry)+5;
 const tiles=multigridTiles(p.symmetry,R,p.seed),out=new Uint8ClampedArray(a.length),g=grid(a,w,h,256),l=blur(g.l,g.w,g.h,3);
 for(let i=0;i<out.length;i+=4){out[i]=out[i+1]=out[i+2]=p.paper*2.55;out[i+3]=255;}
 const point=v=>[w/2+size*(v[0]*ca-v[1]*sa),h/2+size*(v[0]*sa+v[1]*ca)];
 for(const tile of tiles){
  const base=tile.vertices.map(point),cx=base.reduce((s,v)=>s+v[0],0)/4,cy=base.reduce((s,v)=>s+v[1],0)/4;
  if(cx<-size*2||cy<-size*2||cx>w+size*2||cy>h+size*2)continue;
  const light=at(l,g.w,g.h,cx*g.w/w,cy*g.h/h),angle=(light-.5)*p.turn/100*1.8,cs=Math.cos(angle),sn=Math.sin(angle),shrink=1-p.gap/120;
  const vertices=base.map(v=>{const dx=v[0]-cx,dy=v[1]-cy;return [cx+(cs*dx-sn*dy)*shrink,cy+(sn*dx+cs*dy)*shrink];});
  const minX=Math.max(0,Math.floor(Math.min(...vertices.map(v=>v[0]))-1)),maxX=Math.min(w-1,Math.ceil(Math.max(...vertices.map(v=>v[0]))+1)),minY=Math.max(0,Math.floor(Math.min(...vertices.map(v=>v[1]))-1)),maxY=Math.min(h-1,Math.ceil(Math.max(...vertices.map(v=>v[1]))+1));
  const uv=[[0,0],[1,0],[1,1],[0,1]],tone=[0,1,2].map(c=>(sample(a,w,h,cx,cy,c)+sample(a,w,h,cx+size*.2,cy,c)+sample(a,w,h,cx,cy+size*.2,c))/3);
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   let coords=null;
   for(const triangle of [[0,1,2],[0,2,3]]){const b=barycentric(x+.5,y+.5,...triangle.map(i=>vertices[i]));if(b&&Math.min(...b)>=-1e-8){coords=[0,0];for(let q=0;q<3;q++)for(let c=0;c<2;c++)coords[c]+=b[q]*uv[triangle[q]][c];break;}}
   if(!coords)continue;const [u,v]=coords,edge=Math.min(u,1-u,v,1-v),aa=1.3/Math.max(1,size),coverage=clamp(edge/aa,0,1),hole=p.aperture/100;
   // Circle in the square; ellipse in the rhombus, both centered in tile coordinates.
   const du=u-.5,dv=v-.5,distance=Math.sqrt(du*du+dv*dv+2*Math.cos((tile.j-tile.i)*Math.PI/p.symmetry)*du*dv);
   const inside=hole?clamp((distance-hole*(.12+.29*light))/aa,0,1):1,bevel=Math.exp(-edge*30)*p.relief/100,shade=1+bevel*((u<v)?-.6:.6),alpha=coverage*inside;
   const drift=(light-.5)*p.scatter/100*span*.45,direction=(tile.i+tile.j)*Math.PI/p.symmetry+theta;
   const X=cx+Math.cos(direction)*drift+(base[0][0]+u*(base[1][0]-base[0][0])+v*(base[3][0]-base[0][0])-cx)*p.zoom/100,Y=cy+Math.sin(direction)*drift+(base[0][1]+u*(base[1][1]-base[0][1])+v*(base[3][1]-base[0][1])-cy)*p.zoom/100,ix=(y*w+x)*4;
   for(let c=0;c<3;c++){const ink=tone[c]*(1-p.texture/100)+sample(a,w,h,X,Y,c)*p.texture/100;out[ix+c]=out[ix+c]*(1-alpha)+clamp(ink*shade)*alpha;}
  }
 }return out;
}
