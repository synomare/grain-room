import {glyphAtlas,glyphAtlasInfo} from './glyph-atlas.js';
import {curveGuide,colorEdges,traceEdgeChains,simplifyPolyline} from './diffusion-curves.js';
import {sample,hash} from './pixels.js';
import {glyphCharacters} from './glyph-characters.js';

export const GLYPH_GUIDE_EDGE=384,SHAPE_W=12,SHAPE_H=20;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),anchors=[];
for(let y=0;y<5;y++)for(let x=0;x<4;x++)anchors.push([(x+.5)*3,(y+.5)*4]);
const BINS=32,RADIUS=6,binTable=anchors.map(([ax,ay])=>Int16Array.from({length:240},(_,i)=>{
 const x=i%12+.5-ax,y=Math.floor(i/12)+.5-ay,r=Math.hypot(x,y);if(r>RADIUS)return -1;
 const radial=Math.min(3,Math.floor(Math.log(1+r)/Math.log(1+RADIUS)*4)),angular=Math.floor(((Math.atan2(y,x)+2*Math.PI)%(2*Math.PI))/(2*Math.PI)*8);return radial*8+angular;
}));

// Fixed-position, fixed-scale log-polar windows retain position/orientation.
// This reduced AISS descriptor uses 4 radial x 8 angular bins at 20 anchors,
// and a 5x5 Gaussian instead of the original paper's denser configuration.
export function shapeDescriptor(shape){
 const tmp=new Float64Array(240),blur=new Float64Array(240),weights=[.06136,.24477,.38774,.24477,.06136];
 for(let y=0;y<20;y++)for(let x=0;x<12;x++)for(let k=-2;k<=2;k++){const xx=x+k;if(xx>=0&&xx<12)tmp[y*12+x]+=shape[y*12+xx]*weights[k+2];}
 for(let y=0;y<20;y++)for(let x=0;x<12;x++)for(let k=-2;k<=2;k++){const yy=y+k;if(yy>=0&&yy<20)blur[y*12+x]+=tmp[yy*12+x]*weights[k+2];}
 const features=new Float64Array(anchors.length*BINS);for(let j=0;j<anchors.length;j++){const bins=binTable[j];for(let i=0;i<240;i++)if(bins[i]>=0)features[j*BINS+bins[i]]+=blur[i];}
 return {features,mass:shape.reduce((s,v)=>s+v,0)};
}

export function shapeDistance(a,b){
 if(a.mass+b.mass<1e-10)return 0;let d=0;
 for(let j=0;j<anchors.length;j++){let q=0;for(let k=0;k<BINS;k++){const v=a.features[j*BINS+k]-b.features[j*BINS+k];q+=v*v;}d+=Math.sqrt(q);}
 return d/(a.mass+b.mass);
}

let prepared;
export function preparedGlyphs(){
 if(prepared)return prepared;
 prepared=glyphAtlas.map(g=>{const bytes=Uint8Array.from(atob(g.sdf),c=>c.charCodeAt(0)),sdf=new Float32Array(glyphAtlasInfo.width*glyphAtlasInfo.height);let i=0,value=128;for(let j=0;j<bytes.length;j+=2)for(let n=0;n<bytes[j];n++){value=glyphAtlasInfo.encoding==='delta-rle-v1'?value+bytes[j+1]-128:bytes[j+1];sdf[i++]=(value-128)/8;}if(i!==sdf.length)throw Error('Invalid bundled glyph atlas');const shape=new Float64Array(240);if(glyphAtlasInfo.shapeEncoding==='sparse-quarter-v1'){for(const[j,v]of g.shape)shape[j]=v/4;}else shape.set(g.shape);const points=[];for(let j=0;j<shape.length;j++)if(shape[j]>.05)points.push([j%12+.5,Math.floor(j/12)+.5]);return {...g,shape,sdf,points,descriptor:shapeDescriptor(shape)};});return prepared;
}

const customGlyphs=new Map();
export function registerCustomGlyph(glyph){customGlyphs.set(glyph.char,glyph);if(customGlyphs.size>512)customGlyphs.delete(customGlyphs.keys().next().value);}
export function availableGlyph(char){return preparedGlyphs().find(g=>g.char===char)||customGlyphs.get(char);}
export function glyphSet(alphabet=0,characters=''){
 const all=preparedGlyphs();if(alphabet===3)return glyphCharacters(characters).map(char=>{const g=availableGlyph(char);if(!g)throw Error('入力した文字の字形を準備できませんでした。');return g;});
 return all.filter(g=>alphabet===2||alphabet===0&&g.latin||alphabet===1&&(!g.latin||' /\\|_-=~()[]{}.,:'.includes(g.char)));
}

export function matchGlyph(shape,glyphs=glyphSet()){const descriptor=shapeDescriptor(shape);if(descriptor.mass<.025||!glyphs.length)return {glyph:preparedGlyphs()[0],error:0,mass:descriptor.mass};let best=null;for(const glyph of glyphs){if(glyph.char===' ')continue;const error=shapeDistance(descriptor,glyph.descriptor);if(!best||error<best.error-1e-12)best={glyph,error,mass:descriptor.mass};}return best;}

export function glyphGeometry(a,w,h,p,{edge=GLYPH_GUIDE_EDGE}={}){
 const guide=curveGuide(a,w,h,edge),edges=colorEdges(guide.rgb,guide.w,guide.h,p.detail),chains=traceEdgeChains(edges.mask,guide.w,guide.h),cellW=Math.max(w,h)*p.size/1000,cellH=cellW*5/3,cols=Math.max(1,Math.ceil(w/cellW)),rows=Math.max(1,Math.ceil(h/cellH)),vertices=[],segments=[],ids=new Map(),sx=w/guide.w/cellW*12,sy=h/guide.h/cellH*20;
 const vertex=(x,y)=>{const key=x+','+y;if(ids.has(key))return ids.get(key);const id=vertices.length;vertices.push({x:x*sx,y:y*sy,x0:x*sx,y0:y*sy,segments:[]});ids.set(key,id);return id;};
 for(const chain of chains){const points=chain.map(i=>[i%guide.w+.5,Math.floor(i/guide.w)+.5]),minimum=Math.max(2,(.05+1.5*p.prune/100)*cellW*guide.w/w);if(points.length<minimum)continue;const simplified=simplifyPolyline(points,1.4);for(let j=0;j<simplified.length-1;j++){const a=vertex(...simplified[j]),b=vertex(...simplified[j+1]);if(a===b)continue;const id=segments.length,A=vertices[a],B=vertices[b],length=Math.hypot(B.x-A.x,B.y-A.y);if(length<1e-8)continue;segments.push({a,b,dx:B.x-A.x,dy:B.y-A.y,length});A.segments.push(id);B.segments.push(id);}}
 return {w,h,cellW,cellH,cols,rows,vertices,segments,guide,edges,domainW:w/cellW*12,domainH:h/cellH*20};
}

export function segmentCells(geometry,segment){const a=geometry.vertices[segment.a],b=geometry.vertices[segment.b],out=[],x0=clamp(Math.floor((Math.min(a.x,b.x)-1)/12),0,geometry.cols-1),x1=clamp(Math.floor((Math.max(a.x,b.x)+1)/12),0,geometry.cols-1),y0=clamp(Math.floor((Math.min(a.y,b.y)-1)/20),0,geometry.rows-1),y1=clamp(Math.floor((Math.max(a.y,b.y)+1)/20),0,geometry.rows-1);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)out.push(y*geometry.cols+x);return out;}

export function rasterGlyphSegments(geometry,segmentIds,selected=null){
 const masks=new Map(),get=i=>{if(selected&&!selected.has(i))return null;if(!masks.has(i))masks.set(i,new Float64Array(240));return masks.get(i);};
 const put=(x,y,value)=>{if(x<0||y<0||x>=geometry.domainW||y>=geometry.domainH)return;const cx=Math.floor(x/12),cy=Math.floor(y/20),mask=get(cy*geometry.cols+cx);if(mask)mask[(y%20)*12+x%12]+=value;};
 for(const id of segmentIds){const s=geometry.segments[id],a=geometry.vertices[s.a],b=geometry.vertices[s.b],length=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(length*2)),weight=length/steps;
  for(let j=0;j<=steps;j++){const t=j/steps,x=a.x+(b.x-a.x)*t-.5,y=a.y+(b.y-a.y)*t-.5,ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,v=weight*(j===0||j===steps?.5:1);put(ix,iy,v*(1-fx)*(1-fy));put(ix+1,iy,v*fx*(1-fy));put(ix,iy+1,v*(1-fx)*fy);put(ix+1,iy+1,v*fx*fy);}
 }
 for(const mask of masks.values())for(let i=0;i<mask.length;i++)mask[i]=Math.min(1,mask[i]);return masks;
}

export function deformationPenalty(geometry,segment,maxMove){
 const a=geometry.vertices[segment.a],b=geometry.vertices[segment.b],dx=b.x-a.x,dy=b.y-a.y,length=Math.max(1e-8,Math.hypot(dx,dy)),angle=Math.atan2(Math.abs(segment.dx*dy-segment.dy*dx),segment.dx*dx+segment.dy*dy),ratio=Math.log(length/segment.length),drift=((a.x-a.x0)**2+(a.y-a.y0)**2+(b.x-b.x0)**2+(b.y-b.y0)**2)/(maxMove*maxMove||1);
 return .35*(4*angle*angle+2*ratio*ratio+.2*drift);
}

// Seeded bounded coordinate descent of shared contour vertices. Glyphs remain
// on the fixed character grid. Local direction/length and absolute anchoring
// constrain deformation; this does not implement paper's accessibility rays.
export function fitGlyphGeometry(geometry,p){
 const glyphs=glyphSet(p.alphabet,p.characters),allIds=geometry.segments.map((_,i)=>i),masks=rasterGlyphSegments(geometry,allIds),cells=Array.from({length:geometry.cols*geometry.rows},(_,i)=>matchGlyph(masks.get(i)||new Float64Array(240),glyphs)),index=cells.map(()=>new Set());for(const id of allIds)for(const cell of segmentCells(geometry,geometry.segments[id]))index[cell].add(id);
 const originalError=cells.reduce((s,c)=>s+c.error,0),maxMove=2.4*p.relax/100;let shapeError=originalError,penalty=0,accepted=0,attempted=0;
 if(maxMove>0&&geometry.vertices.length){
  const order=geometry.vertices.map((_,i)=>i).filter(i=>geometry.vertices[i].segments.some(j=>geometry.segments[j].length>2.5)).sort((a,b)=>hash(a,41,p.seed)-hash(b,41,p.seed)).slice(0,512);
  for(let pass=0;pass<p.passes;pass++)for(const id of order){const v=geometry.vertices[id],oldX=v.x,oldY=v.y,affectedSegments=v.segments,selected=new Set(),oldPenalty=affectedSegments.reduce((s,id)=>s+deformationPenalty(geometry,geometry.segments[id],maxMove),0);
   for(const s of affectedSegments)for(const c of segmentCells(geometry,geometry.segments[s]))selected.add(c);
   const cx=clamp(Math.floor(v.x/12),0,geometry.cols-1),cy=clamp(Math.floor(v.y/20),0,geometry.rows-1),points=cells[cy*geometry.cols+cx].glyph.points;let target=null,bestDistance=Infinity;
   for(const [x,y]of points){const tx=x+cx*12,ty=y+cy*20,d=(tx-v.x)**2+(ty-v.y)**2;if(d<bestDistance){bestDistance=d;target=[tx,ty];}}
   const randomAngle=2*Math.PI*hash(id,pass*2+42,p.seed),angle=target&&pass%2===0?Math.atan2(target[1]-v.y,target[0]-v.x)+.35*(hash(id,pass+77,p.seed)-.5):randomAngle,distance=Math.min(target&&pass%2===0?Math.sqrt(bestDistance):maxMove,maxMove*(.35+.65*hash(id,pass*2+43,p.seed))/(1+pass*.5));v.x=clamp(oldX+Math.cos(angle)*distance,0,geometry.domainW-1e-7);v.y=clamp(oldY+Math.sin(angle)*distance,0,geometry.domainH-1e-7);
   const drift=Math.hypot(v.x-v.x0,v.y-v.y0);if(drift>maxMove){v.x=v.x0+(v.x-v.x0)*maxMove/drift;v.y=v.y0+(v.y-v.y0)*maxMove/drift;}
   for(const s of affectedSegments)for(const c of segmentCells(geometry,geometry.segments[s]))selected.add(c);
   const ids=new Set(affectedSegments);for(const cell of selected)for(const s of index[cell])ids.add(s);const newMasks=rasterGlyphSegments(geometry,ids,selected),matches=new Map();let delta=0;
   for(const cell of selected){const result=matchGlyph(newMasks.get(cell)||new Float64Array(240),glyphs);matches.set(cell,result);delta+=result.error-cells[cell].error;}
   const newPenalty=affectedSegments.reduce((s,id)=>s+deformationPenalty(geometry,geometry.segments[id],maxMove),0);attempted++;
   if(delta+newPenalty-oldPenalty<-1e-10){shapeError+=delta;penalty+=newPenalty-oldPenalty;accepted++;for(const [cell,result]of matches)cells[cell]=result;for(const cell of selected)for(const s of affectedSegments)index[cell].delete(s);for(const s of affectedSegments)for(const cell of segmentCells(geometry,geometry.segments[s]))index[cell].add(s);}
   else{v.x=oldX;v.y=oldY;}
  }
 }
 return {...geometry,cells,originalError,shapeError,penalty,energy:shapeError+penalty,accepted,attempted,maxMove};
}

export function glyphCoverage(glyph,u,v,stroke=100,pixelSize=1){
 const aw=glyphAtlasInfo.width,ah=glyphAtlasInfo.height,x=u*aw-.5,y=v*ah-.5;if(x<-.5||y<-.5||x>aw-.5||y>ah-.5||glyph.char===' ')return 0;
 const distance=sample(glyph.sdf,aw,ah,x,y,0,1)+(stroke/100-1)*.65;return clamp(.5+distance/Math.max(.15,pixelSize),0,1);
}

export function renderGlyphPlan(a,w,h,plan,p){
 const out=new Uint8ClampedArray(a.length),glyphPixel=24/plan.cellW;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const cx=Math.min(plan.cols-1,Math.floor((x+.5)/plan.cellW)),cy=Math.min(plan.rows-1,Math.floor((y+.5)/plan.cellH)),cell=plan.cells[cy*plan.cols+cx],coverage=glyphCoverage(cell.glyph,(x+.5)/plan.cellW-cx,(y+.5)/plan.cellH-cy,p.weight,glyphPixel),i=(y*w+x)*4;
  for(let c=0;c<3;c++){const source=sample(a,w,h,(cx+.5)*plan.cellW,(cy+.5)*plan.cellH,c),ink=24*(1-p.color/100)+source*.55*p.color/100,paper=246*(1-p.paper/100)+a[i+c]*p.paper/100;out[i+c]=paper*(1-coverage)+ink*coverage;}out[i+3]=255;
 }
 return out;
}

export function glyphContours(a,w,h,p){return renderGlyphPlan(a,w,h,fitGlyphGeometry(glyphGeometry(a,w,h,p),p),p);}
