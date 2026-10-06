import {clamp,hash,sample} from './pixels.js';
import {reflectIndex} from './speckle-field.js';

export const PAINTERLY_EDGE=512;

// These references and colour distances use encoded RGB, as a drawing model;
// they are not a radiometric reconstruction of paint or the photographed scene.
export function painterlyGuide(a,w,h,edge=PAINTERLY_EDGE){
 const scale=Math.min(1,edge/Math.max(w,h)),W=Math.max(1,Math.round(w*scale)),H=Math.max(1,Math.round(h*scale)),sx=w/W,sy=h/H,rows=new Float32Array(W*h*3),rgb=new Float32Array(W*H*3);
 for(let y=0;y<h;y++)for(let x=0;x<W;x++)for(let xx=Math.floor(x*sx);xx<Math.ceil((x+1)*sx);xx++){
  const weight=(Math.min((x+1)*sx,xx+1)-Math.max(x*sx,xx))/sx,i=(y*w+Math.min(w-1,xx))*4,j=(y*W+x)*3;
  for(let c=0;c<3;c++)rows[j+c]+=a[i+c]*weight;
 }
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let yy=Math.floor(y*sy);yy<Math.ceil((y+1)*sy);yy++){
  const weight=(Math.min((y+1)*sy,yy+1)-Math.max(y*sy,yy))/sy,i=(Math.min(h-1,yy)*W+x)*3,j=(y*W+x)*3;
  for(let c=0;c<3;c++)rgb[j+c]+=rows[i+c]*weight;
 }
 return {w:W,h:H,rgb};
}
export function gaussianPaintReference(rgb,w,h,sigma){
 if(sigma<=1e-8)return rgb.slice();
 const radius=Math.ceil(3*sigma),kernel=Float64Array.from({length:radius*2+1},(_,k)=>Math.exp(-((k-radius)**2)/(2*sigma*sigma))),total=kernel.reduce((s,v)=>s+v,0);
 for(let i=0;i<kernel.length;i++)kernel[i]/=total;
 const tmp=new Float32Array(rgb.length),out=tmp.slice();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){
  let sum=0;for(let k=-radius;k<=radius;k++)sum+=rgb[(y*w+reflectIndex(x+k,w))*3+c]*kernel[k+radius];tmp[(y*w+x)*3+c]=sum;
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){
  let sum=0;for(let k=-radius;k<=radius;k++)sum+=tmp[(reflectIndex(y+k,h)*w+x)*3+c]*kernel[k+radius];out[(y*w+x)*3+c]=sum;
 }
 return out;
}
export function paintGradient(rgb,w,h){
 const l=Float32Array.from({length:w*h},(_,i)=>.30*rgb[i*3]+.59*rgb[i*3+1]+.11*rgb[i*3+2]),gx=new Float32Array(w*h),gy=gx.slice(),at=(x,y)=>l[reflectIndex(y,h)*w+reflectIndex(x,w)];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  gx[y*w+x]=(at(x+1,y-1)+2*at(x+1,y)+at(x+1,y+1)-at(x-1,y-1)-2*at(x-1,y)-at(x-1,y+1))/8;
  gy[y*w+x]=(at(x-1,y+1)+2*at(x,y+1)+at(x+1,y+1)-at(x-1,y-1)-2*at(x,y-1)-at(x+1,y-1))/8;
 }
 return {gx,gy};
}
const colourDistance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const colourAt=(rgb,w,h,x,y,stride=3)=>[0,1,2].map(c=>sample(rgb,w,h,x,y,c,stride));
export function choosePaintSeeds(canvas,reference,w,h,spacing,threshold,first=false){
 const errors=Float32Array.from({length:w*h},(_,i)=>Math.hypot(reference[i*3]-canvas[i*4],reference[i*3+1]-canvas[i*4+1],reference[i*3+2]-canvas[i*4+2])),seeds=[],step=Math.max(1,spacing);
 for(let by=0;by<Math.ceil(h/step);by++)for(let bx=0;bx<Math.ceil(w/step);bx++){
  const x0=Math.floor(bx*step),x1=Math.min(w,Math.floor((bx+1)*step)),y0=Math.floor(by*step),y1=Math.min(h,Math.floor((by+1)*step));
  let sum=0,max=-1,x=x0,y=y0;
  for(let yy=y0;yy<y1;yy++)for(let xx=x0;xx<x1;xx++){const e=errors[yy*w+xx];sum+=e;if(e>max){max=e;x=xx;y=yy;}}
  const mean=sum/((x1-x0)*(y1-y0));
  if(first){x=Math.floor((x0+x1-1)/2);y=Math.floor((y0+y1-1)/2);}
  if(first||mean>threshold)seeds.push({x,y,mean,max,region:[x0,y0,x1,y1]});
 }
 return {seeds,errors};
}
export function makePaintStroke(seed,radius,reference,gradient,canvas,w,h,p,index=0,stage=0){
 const colour=colourAt(reference,w,h,seed.x,seed.y).map((v,c)=>clamp(v+(hash(index,c+stage*101,p.seed)*2-1)*p.jitter*.85)),points=[[seed.x,seed.y]],maxLength=p.length,minLength=Math.min(4,Math.floor(maxLength*.35)),fc=p.curve/100;
 let x=seed.x,y=seed.y,lastX=0,lastY=0;
 for(let k=1;k<=maxLength;k++){
  const target=colourAt(reference,w,h,x,y);
  if(k>minLength&&colourDistance(target,colourAt(canvas,w,h,x,y,4))<colourDistance(target,colour))break;
  const gx=sample(gradient.gx,w,h,x,y,0,1),gy=sample(gradient.gy,w,h,x,y,0,1),g=Math.hypot(gx,gy);
  if(g<1e-8)break;
  let dx=-gy/g,dy=gx/g;
  if(k===1){if(hash(index,801+stage,p.seed)<.5){dx=-dx;dy=-dy;}}
  else{
   if(lastX*dx+lastY*dy<0){dx=-dx;dy=-dy;}
   dx=fc*dx+(1-fc)*lastX;dy=fc*dy+(1-fc)*lastY;
   const m=Math.hypot(dx,dy);if(m<1e-12)break;dx/=m;dy/=m;
  }
  const nx=x+radius*dx,ny=y+radius*dy;
  if(nx<0||nx>w-1||ny<0||ny>h-1)break;
  x=nx;y=ny;lastX=dx;lastY=dy;points.push([x,y]);
 }
 return {points,colour,radius,opacity:p.opacity/100,order:hash(index,990+stage,p.seed),stage};
}
const pointSegmentSquared=(x,y,a,b)=>{
 const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?clamp(((x-a[0])*dx+(y-a[1])*dy)/l,0,1):0;
 return (x-a[0]-t*dx)**2+(y-a[1]-t*dy)**2;
};
export function splinePolyline(points,tolerance=.22){
 if(points.length<2)return points.map(p=>p.slice());
 const out=[],at=k=>points[clamp(k,0,points.length-1)],blend=(a,b,c,wa,wb,wc)=>[(a[0]*wa+b[0]*wb+c[0]*wc)/6,(a[1]*wa+b[1]*wb+c[1]*wc)/6],mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
 function append(a,b,c,d,depth=0){
  if(depth>=10||Math.max(pointSegmentSquared(b[0],b[1],a,d),pointSegmentSquared(c[0],c[1],a,d))<=tolerance*tolerance){out.push(d);return;}
  const ab=mid(a,b),bc=mid(b,c),cd=mid(c,d),abc=mid(ab,bc),bcd=mid(bc,cd),q=mid(abc,bcd);
  append(a,ab,abc,q,depth+1);append(q,bcd,cd,d,depth+1);
 }
 for(let i=-1;i<points.length;i++){
  const p0=at(i-1),p1=at(i),p2=at(i+1),p3=at(i+2),a=blend(p0,p1,p2,1,4,1),b=blend(p0,p1,p2,0,4,2),c=blend(p1,p2,p3,2,4,0),d=blend(p1,p2,p3,1,4,1);
  if(!out.length)out.push(a);append(a,b,c,d);
 }
 return out;
}

// A capsule is its segment rectangle plus two endpoint discs. Its intersection
// with a scanline is a single interval, so opaque interiors need no per-pixel
// distances. Only the one-pixel coverage fringe evaluates the exact distance.
function capsuleSpan(a,b,radius,y){
 if(radius<0)return null;
 let left=Infinity,right=-Infinity;
 for(const p of [a,b]){
  const dy=y-p[1];if(Math.abs(dy)>radius)continue;
  const dx=Math.sqrt(Math.max(0,radius*radius-dy*dy));left=Math.min(left,p[0]-dx);right=Math.max(right,p[0]+dx);
 }
 const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
 if(length>1e-12){
  let lo=-Infinity,hi=Infinity,valid=true;
  for(const [u,v,min,max] of [[-dy/length,dx/length,-radius,radius],[dx/length,dy/length,0,length]]){
   const q=v*(y-a[1]);
   if(Math.abs(u)<1e-12){if(q<min||q>max){valid=false;break;}}
   else{const x0=a[0]+(min-q)/u,x1=a[0]+(max-q)/u;lo=Math.max(lo,Math.min(x0,x1));hi=Math.min(hi,Math.max(x0,x1));}
  }
  if(valid&&lo<=hi){left=Math.min(left,lo);right=Math.max(right,hi);}
 }
 return left<=right?[left,right]:null;
}

// Each stroke is one union of circular sweeps. Overlapping subdivisions receive
// its opacity once; only distinct strokes accumulate paint.
export function rasterPaintStrokes(canvas,w,h,strokes,{sx=1,sy=1,scale=1}={}){
 let mask=new Uint8Array(0),rowMin=new Int32Array(0),rowMax=new Int32Array(0);
 for(const stroke of strokes){
  const controls=stroke.points.map(([x,y])=>[(x+.5)*sx-.5,(y+.5)*sy-.5]),points=splinePolyline(controls),radius=stroke.radius*scale,reach=radius+.5;
  let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity;
  for(const [x,y] of points){xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
  const left=Math.max(0,Math.floor(xmin-reach)),right=Math.min(w-1,Math.ceil(xmax+reach)),top=Math.max(0,Math.floor(ymin-reach)),bottom=Math.min(h-1,Math.ceil(ymax+reach)),W=right-left+1,H=bottom-top+1;
  if(W<=0||H<=0)continue;
  if(mask.length<W*H)mask=new Uint8Array(W*H);
  if(rowMin.length<H){rowMin=new Int32Array(H);rowMax=new Int32Array(H);}
  rowMin.fill(W,0,H);rowMax.fill(-1,0,H);
  for(let k=0;k<Math.max(1,points.length-1);k++){
   const a=points[k],b=points[Math.min(k+1,points.length-1)],y0=Math.max(top,Math.ceil(Math.min(a[1],b[1])-reach)),y1=Math.min(bottom,Math.floor(Math.max(a[1],b[1])+reach));
   for(let y=y0;y<=y1;y++){
    const outer=capsuleSpan(a,b,reach,y);if(!outer)continue;
    const x0=Math.max(left,Math.ceil(outer[0]-1e-10)),x1=Math.min(right,Math.floor(outer[1]+1e-10));if(x0>x1)continue;
    const row=y-top,offset=row*W-left,inner=capsuleSpan(a,b,radius-.5,y);
    let full0=x1+1,full1=x0-1;
    if(inner){full0=Math.max(x0,Math.ceil(inner[0]));full1=Math.min(x1,Math.floor(inner[1]));}
    rowMin[row]=Math.min(rowMin[row],x0-left);rowMax[row]=Math.max(rowMax[row],x1-left);
    if(full0<=full1)mask.fill(255,offset+full0,offset+full1+1);
    function fringe(lo,hi){
     for(let x=lo;x<=hi;x++){
      const q=offset+x;if(mask[q]===255)continue;
      const d2=pointSegmentSquared(x,y,a,b);if(d2>=reach*reach)continue;
      const coverage=Math.round(255*clamp(reach-Math.sqrt(d2),0,1));if(coverage>mask[q])mask[q]=coverage;
     }
    }
    if(full0<=full1){fringe(x0,full0-1);fringe(full1+1,x1);}else fringe(x0,x1);
   }
  }
  for(let y=0;y<H;y++){
   const offset=y*W;
   for(let x=rowMin[y];x<=rowMax[y];x++){
    const q=offset+x;if(!mask[q])continue;
    const i=((y+top)*w+x+left)*4,alpha=stroke.opacity*mask[q]/255;
    for(let c=0;c<3;c++)canvas[i+c]=canvas[i+c]*(1-alpha)+stroke.colour[c]*alpha;
    canvas[i+3]=255;
   }
   if(rowMin[y]<=rowMax[y])mask.fill(0,offset+rowMin[y],offset+rowMax[y]+1);
  }
 }
 return canvas;
}
const background=(w,h,paper)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:paper*2.55);
export function painterlyPlan(a,w,h,p,{edge=PAINTERLY_EDGE}={}){
 const guide=painterlyGuide(a,w,h,edge),W=guide.w,H=guide.h,base=Math.max(.65,p.size*Math.max(W,H)/1000),canvas=background(W,H,p.paper),strokes=[],stages=[];
 for(let pass=0;pass<p.levels;pass++){
  const radius=base*2**(p.levels-1-pass),reference=gaussianPaintReference(guide.rgb,W,H,radius*p.blur/100),gradient=paintGradient(reference,W,H),threshold=p.threshold*2.5,{seeds,errors}=choosePaintSeeds(canvas,reference,W,H,radius*p.spacing/100,threshold,pass===0),layer=seeds.map((seed,k)=>makePaintStroke(seed,radius,reference,gradient,canvas,W,H,p,k,pass)).sort((a,b)=>a.order-b.order),start=strokes.length;
  rasterPaintStrokes(canvas,W,H,layer);for(const stroke of layer)strokes.push(stroke);
  let after=0;for(let i=0;i<W*H;i++)after+=Math.hypot(reference[i*3]-canvas[i*4],reference[i*3+1]-canvas[i*4+1],reference[i*3+2]-canvas[i*4+2]);
  stages.push({radius,count:layer.length,start,end:strokes.length,meanBefore:errors.reduce((s,v)=>s+v,0)/(W*H),meanAfter:after/(W*H)});
 }
 return {guide,strokes,stages,canvas};
}
function paintNativePlan(w,h,p,plan){
 const canvas=background(w,h,p.paper);
 rasterPaintStrokes(canvas,w,h,plan.strokes,{sx:w/plan.guide.w,sy:h/plan.guide.h,scale:Math.max(w,h)/Math.max(plan.guide.w,plan.guide.h)});
 return canvas;
}
function composePainting(a,p,painting){
 const out=new Uint8ClampedArray(a.length),strength=p.amount/100*(1-p.photo/100);
 for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++)out[i+c]=a[i+c]*(1-strength)+painting[i+c]*strength;out[i+3]=255;}
 return out;
}
export function renderPainterlyPlan(a,w,h,p,plan){
 if(p.amount===0||p.photo===100)return new Uint8ClampedArray(a);
 return composePainting(a,p,paintNativePlan(w,h,p,plan));
}

let paintingCache=null,cacheHits=0,cacheMisses=0;
export function clearPainterlyCache(){paintingCache=null;cacheHits=cacheMisses=0;}
export function painterlyCacheInfo(){return {hits:cacheHits,misses:cacheMisses,bytes:paintingCache?paintingCache.source.byteLength+paintingCache.painting.byteLength:0};}
const sameSource=(a,b)=>{if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
export function painterly(a,w,h,p){
 if(p.amount===0||p.photo===100)return new Uint8ClampedArray(a);
 const key=JSON.stringify([w,h,p.size,p.levels,p.threshold,p.length,p.curve,p.blur,p.opacity,p.jitter,p.paper,p.spacing,p.seed]);
 let painting;
 if(paintingCache?.key===key&&sameSource(a,paintingCache.source)){cacheHits++;painting=paintingCache.painting;}
 else{
  cacheMisses++;painting=paintNativePlan(w,h,p,painterlyPlan(a,w,h,p));
  // Retain one preview-sized painting. Exact byte comparison prevents false
  // reuse on a changed photo or common preprocessing; large exports retain no
  // extra frame. Every returned composition owns its buffer.
  paintingCache=w*h<=4_000_000?{key,source:new Uint8ClampedArray(a),painting}:null;
 }
 return composePainting(a,p,painting);
}
