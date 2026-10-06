import {lum,clamp} from './pixels.js';
import {availableGlyph,glyphCoverage} from './glyph-contours.js';

export const addressDefaults={size:30,select:2,threshold:20,coverage:15,records:3,spread:8,angle:0,originX:50,originY:50,basis:2,mode:0,fill:65,source:55,paper:97,text:86};
const wrap=(v,n)=>((v%n)+n)%n;
let numericGlyphs;
function glyphs(){return numericGlyphs||(numericGlyphs=new Map(Array.from('0123456789-',char=>[char,availableGlyph(char)])));}
export function recordColour(h){
 h=wrap(h,360)/60;const x=1-Math.abs(h%2-1),v=h<1?[1,x,0]:h<2?[x,1,0]:h<3?[0,1,x]:h<4?[0,x,1]:h<5?[x,0,1]:[1,0,x];return v.map(q=>28+206*q);
}

// Every native source pixel contributes to its explicit visual grid cell.
// Selection is a signal threshold and area fraction, never object recognition.
export function addressGrid(a,w,h,p){
 const size=Math.max(w,h)*p.size/1000,nx=Math.max(1,Math.min(w,Math.round(w/size))),ny=Math.max(1,Math.min(h,Math.round(h/size))),n=nx*ny,counts=new Uint32Array(n),chosen=new Uint32Array(n),colour=Array.from({length:3},()=>new Float64Array(n));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=Math.floor((x+.5)*nx/w)+Math.floor((y+.5)*ny/h)*nx,i=(y*w+x)*4;
  counts[j]++;for(let c=0;c<3;c++)colour[c][j]+=a[i+c];
  const light=lum(a,i)/255,chroma=(Math.max(a[i],a[i+1],a[i+2])-Math.min(a[i],a[i+1],a[i+2]))/255,signal=p.select===0?light:p.select===1?1-light:chroma;
  // Preserve inclusive endpoints through the floating-point luminance sum.
  if(signal+1e-12>=p.threshold/100)chosen[j]++;
 }
 const occupancy=Uint8Array.from(chosen,(v,j)=>v>0&&v/counts[j]>=p.coverage/100?1:0);
 for(let j=0;j<n;j++)for(let c=0;c<3;c++)colour[c][j]/=counts[j];
 return {nx,ny,n,cw:w/nx,ch:h/ny,counts,chosen,occupancy,colour};
}

export function addressPlan(a,w,h,p){
 const g=addressGrid(a,w,h,p),ox=Math.round((g.nx-1)*p.originX/100),oy=Math.round((g.ny-1)*p.originY/100),origin=oy*g.nx+ox,theta=p.angle*Math.PI/180,r=[];
 for(let k=0;k<p.records;k++){
  const d=k-(p.records-1)/2,dx=Math.round(d*p.spread/100*g.nx*Math.cos(theta))||0,dy=Math.round(d*p.spread/100*g.ny*Math.sin(theta))||0,colour=recordColour(335+k*120);
  r.push({dx,dy,colour,entries:Array.from({length:g.n},(_,j)=>{
   const x=j%g.nx,y=Math.floor(j/g.nx),sx=wrap(x-dx,g.nx),sy=wrap(y-dy,g.ny),sourceIndex=sy*g.nx+sx,value=p.basis===0?sx-ox:p.basis===1?sy-oy:sourceIndex-origin;
   return {sourceIndex,occupied:!!g.occupancy[sourceIndex],label:String(value)};
  })});
 }
 return {g,r,origin,ox,oy};
}

function textLayout(label,cw,ch,factor){
 const H=Math.min(ch*factor,.9*cw/(label.length*.6)),W=H*.6;
 return {label,H,W,x0:(cw-W*label.length)/2,y0:(ch-H)/2,pixel:24/W};
}
export function addressRecords(a,w,h,p){
 const {g,r}=addressPlan(a,w,h,p),paper=p.paper*2.55,bandHeight=g.ch/r.length,G=glyphs(),out=new Uint8ClampedArray(a.length),cells=Array.from({length:g.n},(_,j)=>{
  const bands=r.map(record=>{
   const e=record.entries[j];if(!e.occupied)return null;
   const colour=record.colour.map((q,c)=>q*(1-p.source/100)+g.colour[c][e.sourceIndex]*p.source/100);
   return {colour,layout:textLayout(e.label,g.cw,bandHeight,p.text/100)};
  }),overlap=[paper,paper,paper];
  if(p.mode===1)for(const b of bands)if(b)for(let c=0;c<3;c++)overlap[c]*=1-p.fill/100*(1-b.colour[c]/255);
  for(const b of bands)if(b){
   b.background=p.mode===0?b.colour.map(v=>paper*(1-p.fill/100*(1-v/255))):overlap;
   const light=b.background[0]*.2126+b.background[1]*.7152+b.background[2]*.0722;
   b.ink=p.mode===2?b.colour:light>140?[18,22,25]:[251,251,249];
  }
  return {bands,overlap};
 });
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=(x+.5)/g.cw,Y=(y+.5)/g.ch,cx=Math.min(g.nx-1,Math.floor(X)),cy=Math.min(g.ny-1,Math.floor(Y)),u=X-cx,v=Y-cy,band=Math.min(r.length-1,Math.floor(v*r.length)),cell=cells[cy*g.nx+cx],b=cell.bands[band],i=(y*w+x)*4;
  let coverage=0;
  if(b){
   const l=b.layout,tx=(u*g.cw-l.x0)/l.W,ty=((v*r.length-band)*bandHeight-l.y0)/l.H;
   if(tx>=0&&tx<l.label.length&&ty>=0&&ty<1)coverage=glyphCoverage(G.get(l.label[Math.floor(tx)]),tx%1,ty,130,l.pixel);
  }
  const edge=Math.min(u,1-u)*g.cw,edgeY=Math.min(v,1-v)*g.ch,line=clamp(.45*Math.max(w,h)/1000-Math.min(edge,edgeY)+.5,0,1)*.32;
  for(let c=0;c<3;c++){
   const background=b?b.background[c]:p.mode===1?cell.overlap[c]:paper,ink=b?b.ink[c]:background;
   out[i+c]=(background+coverage*(ink-background))*(1-line)+125*line;
  }
  out[i+3]=255;
 }
 return out;
}
