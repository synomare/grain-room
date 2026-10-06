import {clamp,lum} from './pixels.js';

export const polarizedPairDefaults={mapping:0,angle:22.5,gate:90,axes:45,first:100,second:100,bias:0,partner:0,offsetX:0,offsetY:0,share:0,order:0,keep:0};
export const polarizedBands=[[610,640,670],[500,530,560],[420,450,480]];
const radians=a=>a*Math.PI/180;
export const linearToSrgb=v=>v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;

// Projection of J(axes, second) J(0, first) onto the analyzer. Reverse order
// changes the antisymmetric real term; this is a coherent two-layer result.
export function doubleRetarderIntensity(first,second,wavelength,angle,gate,axes=Math.PI/4,reverse=false){
 const c1=Math.cos(Math.PI*first/wavelength),s1=Math.sin(Math.PI*first/wavelength),c2=Math.cos(Math.PI*second/wavelength),s2=Math.sin(Math.PI*second/wavelength),a=Math.cos(2*axes),b=Math.sin(2*axes);
 const k=c1*c2-a*s1*s2,B=b*s1*s2,L=c2*s1+a*c1*s2,M=b*c1*s2;
 const real=k*Math.cos(gate)-(reverse?-1:1)*B*Math.sin(gate),imaginary=L*Math.cos(2*angle+gate)+M*Math.sin(2*angle+gate);
 return real*real+imaginary*imaginary;
}
export function polarizedColour(first,second,angle,gate=90,axes=45,reverse=false){
 return polarizedBands.map(band=>linearToSrgb(clamp(band.reduce((sum,wavelength)=>sum+doubleRetarderIntensity(first,second,wavelength,radians(angle),radians(gate),radians(axes),reverse),0)/band.length,0,1))*255);
}
let referencePalette;
export function polarizedPalette(){
 if(!referencePalette){
  referencePalette=new Float64Array(256*3);
  for(let i=0;i<256;i++)referencePalette.set(polarizedColour(0,i*1800/255,0),i*3);
 }return referencePalette;
}
export function closestPolarizedColour(red,green,blue,palette=polarizedPalette()){
 let best=Infinity,index=0;
 for(let i=0;i<256;i++){const j=i*3,d=(red-palette[j])**2+(green-palette[j+1])**2+(blue-palette[j+2])**2;if(d<best){best=d;index=i;}}
 return index;
}
// Exact RGB query; bounded call-local cache retains no photograph between runs.
// The 256 choices are material palette samples, not a reduced spatial grid.
export function polarizedPhotoField(a,mapping){
 const N=a.length/4;
 if(mapping===1)return Float32Array.from({length:N},(_,i)=>lum(a,i*4)/255);
 const field=new Uint8Array(N),cache=new Map(),palette=polarizedPalette();
 for(let i=0;i<N;i++){
  const j=i*4,key=(a[j]<<16)|(a[j+1]<<8)|a[j+2];let value=cache.get(key);
  if(value===undefined){value=closestPolarizedColour(a[j],a[j+1],a[j+2],palette);if(cache.size>=65536)cache.clear();cache.set(key,value);}field[i]=value;
 }return field;
}
const wrap=(v,n)=>((v%n)+n)%n;
export function polarizedPartner(x,y,w,h,p){
 if(p.partner===0||p.partner===2)x=w-1-x;
 if(p.partner===1||p.partner===2)y=h-1-y;
 x=wrap(x+Math.round(p.offsetX*w/100),w);y=wrap(y+Math.round(p.offsetY*h/100),h);
 return y*w+x;
}
export function makePolarizedTable(p,resolution=256){
 const a=new Float32Array(resolution*resolution*3),angle=radians(p.angle),gate=radians(p.gate),axes=radians(p.axes),reverse=p.order===1;
 const delay=(v,scale)=>p.bias+(p.mapping===1?80+1350*v:1800*v)*scale/100;
 for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
  const first=delay(x/(resolution-1),p.first),second=delay(y/(resolution-1),p.second),i=(y*resolution+x)*3;
  for(let c=0;c<3;c++){let sum=0;for(const wavelength of polarizedBands[c])sum+=doubleRetarderIntensity(first,second,wavelength,angle,gate,axes,reverse);a[i+c]=clamp(sum/polarizedBands[c].length,0,1);}
 }return {a,resolution};
}
export function samplePolarizedTable(table,X,Y,c){
 const {a,resolution:N}=table;X=clamp(X,0,N-1);Y=clamp(Y,0,N-1);
 const x=Math.min(N-2,Math.floor(X)),y=Math.min(N-2,Math.floor(Y)),u=X-x,v=Y-y;
 return a[(y*N+x)*3+c]*(1-u)*(1-v)+a[(y*N+x+1)*3+c]*u*(1-v)+a[((y+1)*N+x)*3+c]*(1-u)*v+a[((y+1)*N+x+1)*3+c]*u*v;
}
export function polarizedPair(a,w,h,p){
 const field=polarizedPhotoField(a,p.mapping),table=makePolarizedTable(p),factor=p.mapping===0?1:255,share=p.share/100,keep=p.keep/100,out=new Uint8ClampedArray(a.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const k=y*w+x,i=k*4,j=polarizedPartner(x,y,w,h,p),X=field[k]*factor,Y=(field[j]*(1-share)+field[k]*share)*factor;
  for(let c=0;c<3;c++){
   const colour=linearToSrgb(clamp(samplePolarizedTable(table,X,Y,c),0,1))*255,value=colour*(1-keep)+a[i+c]*keep;
   out[i+c]=Math.round(value*1e9)/1e9;
  }out[i+3]=255;
 }return out;
}
