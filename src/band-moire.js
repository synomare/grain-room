// Independent straight-band encoding and finite-aperture reveal.
// Hersch & Chosson, Band Moire Images (2004), sections 3-4.
// RGB is integrated as linear light; the source is constant within each
// original x pixel and at most 512 area-averaged vertical cells.
export const BAND_SOURCE_ROWS=512;
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const linear=Float64Array.from({length:256},(_,v)=>v/255<=.04045?v/255/12.92:((v/255+.055)/1.055)**2.4);
const encode=v=>255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055);

export function bandGeometry(h,{compression=192,repeats=1,aperture=1,spacing=100,phase=0,tilt=0,soften=100}={}){
 const base=h/(compression*repeats),revealer=base*compression/(compression-1)*spacing/100,angle=tilt*Math.PI/180;
 return {base,revealer,duty:aperture/100,offset:((phase%100)+100)%100/100*revealer,sin:Math.sin(angle),cos:Math.cos(angle),window:Math.max(1,soften/100*revealer/Math.cos(angle))};
}

export function createBandColumn(a,w,h,x,{rows=BAND_SOURCE_ROWS,scratch}={}){
 const n=Math.min(h,rows),full=scratch?.full??new Float64Array((h+1)*3),prefix=scratch?.prefix??new Float64Array((n+1)*3),moment=scratch?.moment??new Float64Array((n+1)*3);
 full.fill(0,0,3);prefix.fill(0,0,3);moment.fill(0,0,3);
 for(let y=0;y<h;y++)for(let c=0;c<3;c++)full[(y+1)*3+c]=full[y*3+c]+linear[a[(y*w+x)*4+c]];
 for(let y=1;y<=n;y++){
  const source=y*h/n,j=Math.min(h-1,Math.floor(source)),f=source-j;
  for(let c=0;c<3;c++){
   prefix[y*3+c]=(full[j*3+c]*(1-f)+full[(j+1)*3+c]*f)/h;
   moment[y*3+c]=moment[(y-1)*3+c]+(prefix[y*3+c]-prefix[(y-1)*3+c])*(y-.5)/n;
  }
 }
 return {n,prefix,moment,full};
}

// Primitive and first moment of a periodically repeated source column.
// Fractional cells have constant density equal to their area average.
export function bandPrimitive(column,t,c,weighted=false){
 const {n,prefix,moment}=column,k=Math.floor(t),f=t-k,q=f*n,j=Math.min(n-1,Math.floor(q)),part=q-j,P=prefix[j*3+c],delta=prefix[(j+1)*3+c]-P,p=P+delta*part,mean=prefix[n*3+c];
 if(!weighted)return k*mean+p;
 const m=moment[j*3+c]+delta*part*(j/n+part/(2*n));
 return k*moment[n*3+c]+mean*k*(k-1)/2+k*p+m;
}

export function integrateEncodedBand(column,base,a,b,c){return base*(bandPrimitive(column,b/base,c)-bandPrimitive(column,a/base,c));}
const aperturePrimitive=(u,duty)=>{const k=Math.floor(u);return k*duty+Math.min(u-k,duty);};
const apertureAt=(u,duty)=>u-Math.floor(u)<duty?1:0;

// Exact aperture coverage across the width of an original source pixel.
export function bandApertureCoverage(x,y,w,g){
 const {sin:s,cos,offset,revealer:r,duty:d}=g,u=(cos*y+s*(x-w/2)-offset)/r+d/2;
 if(Math.abs(s)<1e-12)return apertureAt(u,d);
 const v=u+s/r,k=Math.floor(Math.min(u,v));
 return clamp(r/s*(aperturePrimitive(v-k,d)-aperturePrimitive(u-k,d)));
}

// Between aperture edges coverage is affine in y. Integrating that affine
// weight against both source primitives avoids sampling aliases or replacing
// the encoded image by a direct warp of the original.
export function createBandSweep(column,x,w,g,minY,maxY){
 const {base,cos,sin:s,offset,revealer:r,duty:d}=g,events=[minY,maxY],left=s*(x-w/2),right=s*(x+1-w/2),low=cos*minY+Math.min(left,right)-offset,high=cos*maxY+Math.max(left,right)-offset;
 const first=Math.floor(low/r-d/2)-1,last=Math.ceil(high/r+d/2)+1;
 for(let k=first;k<=last;k++)for(const side of [-1,1]){
  const line=(k+side*d/2)*r+offset;
  for(const shift of Math.abs(s)<1e-12?[left]:[left,right]){const y=(line-shift)/cos;if(y>minY&&y<maxY)events.push(y);}
 }
 events.sort((a,b)=>a-b);const edges=[];for(const y of events)if(!edges.length||y-edges.at(-1)>1e-11)edges.push(y);
 const sum=new Float64Array(edges.length*3),maskSum=new Float64Array(edges.length),values=new Float64Array(edges.length-1),slopes=new Float64Array(edges.length-1);
 const integral=(i,y,c)=>{
  const a=edges[i],b=y,mid=(edges[i]+edges[i+1])/2,p0=integrateEncodedBand(column,base,a,b,c),slope=slopes[i];
  if(!slope)return values[i]*p0;
  const p1=base*base*(bandPrimitive(column,b/base,c,true)-bandPrimitive(column,a/base,c,true));
  return values[i]*p0+slope*(p1-mid*p0);
 };
 for(let i=0;i<edges.length-1;i++){
  const a=edges[i],b=edges[i+1],mid=(a+b)/2,u=(cos*mid+left-offset)/r+d/2,v=(cos*mid+right-offset)/r+d/2;
  values[i]=bandApertureCoverage(x,mid,w,g);slopes[i]=Math.abs(s)<1e-12?0:cos/s*(apertureAt(v,d)-apertureAt(u,d));
  for(let c=0;c<3;c++)sum[(i+1)*3+c]=sum[i*3+c]+integral(i,b,c);
  maskSum[i+1]=maskSum[i]+values[i]*(b-a);
 }
 function segment(y){let lo=0,hi=edges.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(edges[mid]<=y)lo=mid;else hi=mid;}return Math.min(lo,edges.length-2);}
 function cumulative(y,c){const i=segment(y);return sum[i*3+c]+integral(i,y,c);}
 function maskCumulative(y){const i=segment(y),a=edges[i],mid=(a+edges[i+1])/2;return maskSum[i]+values[i]*(y-a)+slopes[i]*((y-mid)**2-(a-mid)**2)/2;}
 return {edges,sum,values,slopes,integrate:(a,b,c)=>cumulative(b,c)-cumulative(a,c),mask:(a,b)=>maskCumulative(b)-maskCumulative(a)};
}

export function bandMoire(a,w,h,p){
 const g=bandGeometry(h,p),view=p.view??2,out=new Uint8ClampedArray(a.length),n=Math.min(h,BAND_SOURCE_ROWS),scratch={full:new Float64Array((h+1)*3),prefix:new Float64Array((n+1)*3),moment:new Float64Array((n+1)*3)},window=view===2?g.window:1;
 for(let x=0;x<w;x++){
  const column=createBandColumn(a,w,h,x,{scratch}),sweep=view===0?null:createBandSweep(column,x,w,g,.5-window/2,h-.5+window/2);
  for(let y=0;y<h;y++){
   const i=(y*w+x)*4,low=y+.5-window/2,high=low+window;
   for(let c=0;c<3;c++){
    const value=view===0?integrateEncodedBand(column,g.base,y,y+1,c):view===3?sweep.mask(y,y+1):sweep.integrate(low,high,c)/window/(view===2?g.duty:1);
    out[i+c]=encode(clamp(value));
   }out[i+3]=255;
  }
 }return out;
}
