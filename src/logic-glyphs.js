import {hash} from './pixels.js';
import {routeGrid,strokeRouteMask} from './closed-route.js';

export const logicGlyphDefaults={size:34,edges:5,rule:0,offset:2,carry:0,flow:0,random:65,yaw:38,pitch:25,stretch:100,width:7,mode:0,paper:0,lift:30};
export const ALL_CUBE_EDGES=4095;
export const cubeEdges=[];
for(let a=0;a<8;a++)for(const axis of [1,2,4])if(!(a&axis))cubeEdges.push([a,a|axis]);

// Operations apply to twelve edge identities before projection, never pixels.
export function combineEdges(a,b,rule=0){
 return (rule===0?a|b:rule===1?a&b:rule===2?a^b:rule===3?a&~b:rule===4?~(a|b):~(a&b))&ALL_CUBE_EDGES;
}

export function projectCube(yaw=38,pitch=25){
 const a=yaw*Math.PI/180,b=pitch*Math.PI/180,points=Array.from({length:8},(_,j)=>{
  const x=(j&1)?1:-1,y=(j&2)?1:-1,z=(j&4)?1:-1,X=x*Math.cos(a)+z*Math.sin(a),Z=-x*Math.sin(a)+z*Math.cos(a);
  return [X,y*Math.cos(b)-Z*Math.sin(b)];
 });
 const xs=points.map(v=>v[0]),ys=points.map(v=>v[1]),minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
 // Fit horizontal and vertical extent separately into a repeatable glyph cell.
 return points.map(([x,y])=>[(x-(minx+maxx)/2)/(maxx-minx),(y-(miny+maxy)/2)/(maxy-miny)]);
}

export function logicGlyphPlan(source,w,h,params={}){
 const p={...logicGlyphDefaults,...params},g=routeGrid(source,w,h,p.size),masks=new Uint16Array(g.n),left=new Uint16Array(g.n),right=new Uint16Array(g.n),result=new Uint16Array(g.n);
 for(let j=0;j<g.n;j++){
  const light=(.2126*g.colour[0][j]+.7152*g.colour[1][j]+.0722*g.colour[2][j])/255,count=Math.max(1,Math.min(12,Math.round(p.edges*(.35+.65*light))));
  const order=cubeEdges.map((_,e)=>({e,rank:hash(e,31,p.seed??17)*(1-p.random/100)+hash(e,j+731,p.seed??17)*p.random/100})).sort((a,b)=>a.rank-b.rank||a.e-b.e);
  for(let k=0;k<count;k++)masks[j]|=1<<order[k].e;
 }
 let state=0;
 for(let y=0;y<g.ny;y++)for(let x=0;x<g.nx;x++){
  const j=y*g.nx+x,k=y*g.nx+((x+p.offset)%g.nx+g.nx)%g.nx;
  if(x===0&&!p.flow)state=0;
  let gate=0;for(let e=0;e<12;e++)if(hash(e,j+973,p.seed??17)*100<p.carry)gate|=1<<e;
  left[j]=masks[j];right[j]=masks[k]|(state&gate);result[j]=combineEdges(left[j],right[j],p.rule);state=result[j];
 }
 return {g,p,masks,left,right,result,points:projectCube(p.yaw,p.pitch)};
}

export function logicGlyphMask(source,w,h,params={}){
 const plan=logicGlyphPlan(source,w,h,params),{g,p,points,result}=plan,mask=new Float32Array(w*h),radius=p.width*Math.max(w,h)/2000;
 for(let y=0;y<g.ny;y++)for(let x=0;x<g.nx;x++){
  const j=y*g.nx+x,cx=(x+.5)*g.cw,cy=(y+.5)*g.ch;
  for(let e=0;e<12;e++)if(result[j]&(1<<e)){
   const [a,b]=cubeEdges[e],A=points[a],B=points[b];
   strokeRouteMask(mask,w,h,cx+A[0]*g.cw*.82,cy+A[1]*g.ch*.82*p.stretch/100,cx+B[0]*g.cw*.82,cy+B[1]*g.ch*.82*p.stretch/100,radius);
  }
 }
 return {...plan,mask};
}

export function logicGlyphs(source,w,h,params={}){
 const {p,mask}=logicGlyphMask(source,w,h,params),out=new Uint8ClampedArray(source.length),paper=p.paper*2.55,gamma=1-p.lift/100*.8;
 for(let j=0;j<w*h;j++){
  for(let c=0;c<3;c++){
   const ink=p.mode===1?255:p.mode===3?0:255*Math.pow((p.mode===2?255-source[j*4+c]:source[j*4+c])/255,gamma);
   out[j*4+c]=paper+(ink-paper)*mask[j];
  }
  out[j*4+3]=255;
 }
 return out;
}
