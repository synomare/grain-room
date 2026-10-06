import {clamp,hash,lum,sample} from './pixels.js';

export const stereoDefaults={pitch:18,depth:40,smooth:6,gamma:130,reverse:0,pattern:0,size:3,phase:0,texture:100,guide:0,display:0};

// Replicated-edge box filtering keeps depth planning at the input resolution.
export function smoothStereoHeight(input,w,h,radius){
 radius=Math.max(0,Math.round(radius));
 if(!radius)return input.slice();
 const horizontal=new Float32Array(input.length),out=new Float32Array(input.length),diameter=2*radius+1;
 for(let y=0;y<h;y++){
  let sum=0;
  for(let k=-radius;k<=radius;k++)sum+=input[y*w+clamp(k,0,w-1)];
  for(let x=0;x<w;x++){
   horizontal[y*w+x]=sum/diameter;
   sum+=input[y*w+clamp(x+radius+1,0,w-1)]-input[y*w+clamp(x-radius,0,w-1)];
  }
 }
 for(let x=0;x<w;x++){
  let sum=0;
  for(let k=-radius;k<=radius;k++)sum+=horizontal[clamp(k,0,h-1)*w+x];
  for(let y=0;y<h;y++){
   out[y*w+x]=sum/diameter;
   sum+=horizontal[clamp(y+radius+1,0,h-1)*w+x]-horizontal[clamp(y-radius,0,h-1)*w+x];
  }
 }
 return out;
}

export function stereoDepth(source,w,h,p=stereoDefaults){
 const luminance=Float32Array.from({length:w*h},(_,j)=>lum(source,j*4)/255);
 const out=smoothStereoHeight(luminance,w,h,p.smooth*Math.max(w,h)/1000);
 for(let j=0;j<out.length;j++){
  const value=Math.pow(clamp(out[j],0,1),p.gamma/100);
  out[j]=p.reverse?1-value:value;
 }
 return out;
}

export function stereoSeparation(z,eyeDistance,mu){
 // Stabilize exact half-pixel ties against floating-point cancellation.
 return Math.max(1,Math.floor((1-mu*z)*eyeDistance/(2-mu*z)+.5+1e-10));
}

export function stereoVisible(depth,x,eyeDistance,mu){
 if(!mu)return true;
 const z=depth[x],slope=2*(2-mu*z)/(mu*eyeDistance);
 for(let t=1;z+slope*t<=1;t++){
  const ray=z+slope*t;
  if((x-t>=0&&depth[x-t]>=ray)||(x+t<depth.length&&depth[x+t]>=ray))return false;
 }
 return true;
}

export function stereoRowLinks(depth,far,mu,row=0,withPairs=false){
 const w=depth.length,parent=Int32Array.from({length:w},(_,x)=>x),rank=new Uint8Array(w),pairs=withPairs?[]:null;
 function root(x){
  let r=x;
  while(parent[r]!==r)r=parent[r];
  while(parent[x]!==x){const next=parent[x];parent[x]=r;x=next;}
  return r;
 }
 for(let x=0;x<w;x++){
  const separation=stereoSeparation(depth[x],far*2,mu);
  const left=x-Math.floor((separation+(separation&row&1))/2),right=left+separation;
  if(left<0||right>=w||!stereoVisible(depth,x,far*2,mu))continue;
  let a=root(left),b=root(right);
  if(a!==b){
   if(rank[a]<rank[b])[a,b]=[b,a];
   parent[b]=a;
   if(rank[a]===rank[b])rank[a]++;
  }
  if(pairs)pairs.push([left,right,x,separation]);
 }
 // Keep the forest intact until every representative has been extracted.
 const representatives=new Int32Array(w).fill(-1),links=new Int32Array(w);
 for(let x=0;x<w;x++){const r=root(x);representatives[r]=Math.max(representatives[r],x);}
 for(let x=0;x<w;x++)links[x]=representatives[root(x)];
 return {links,pairs};
}

export function stereoGuideBand(h,enabled){return enabled?Math.min(h,Math.max(4,Math.round(h*.055))):0;}

function drawStereoGuides(out,w,h,far,band){
 const cy=h-band/2,radius=Math.max(1,Math.min(w,h)*.006);
 const left=(w-far)/2,right=left+far;
 for(let y=h-band;y<h;y++)for(let x=0;x<w;x++){
  const distance=Math.min(Math.hypot(x+.5-left,y+.5-cy),Math.hypot(x+.5-right,y+.5-cy));
  const value=245-215*clamp(radius+.5-distance,0,1),i=(y*w+x)*4;
  out[i]=out[i+1]=out[i+2]=value;out[i+3]=255;
 }
}

export function stereoRelief(source,w,h,p=stereoDefaults){
 const depth=stereoDepth(source,w,h,p),out=new Uint8ClampedArray(source.length);
 if(p.display===1){
  for(let j=0;j<w*h;j++){out[j*4]=out[j*4+1]=out[j*4+2]=depth[j]*255;out[j*4+3]=255;}
  return out;
 }
 const far=Math.max(1,Math.round(w*p.pitch/100)),mu=p.depth/100;
 const scale=Math.max(w,h)/1000,cell=Math.max(1,p.size*scale),phase=p.phase/100*far;
 const tileHeight=far*h/w,guideBand=stereoGuideBand(h,p.guide),seed=p.seed??17;
 for(let y=0;y<h-guideBand;y++){
  const {links}=stereoRowLinks(depth.subarray(y*w,(y+1)*w),far,mu,y);
  const tileY=(y%tileHeight)/tileHeight*(h-1);
  for(let x=0;x<w;x++){
   const representative=links[x],cellX=Math.floor((representative+phase)/cell),cellY=Math.floor(y/cell);
   const n=hash(cellX,cellY,seed),i=(y*w+x)*4;
   const u=((representative+phase)%far)/far;
   let sx,sy;
   if(p.pattern===1){sx=hash(cellX,cellY,seed+31)*(w-1);sy=hash(cellX,cellY,seed+73)*(h-1);}
   for(let c=0;c<3;c++){
    let value;
    if(p.pattern===0)value=sample(source,w,h,u*(w-1),tileY,c)*(.9+.2*n)+(n-.5)*10;
    else if(p.pattern===1)value=(sample(source,w,h,sx,sy,c)+70)*(.3+1.2*n);
    else value=n>.5?255:0;
    out[i+c]=127.5+(clamp(value)-127.5)*p.texture/100;
   }
   out[i+3]=255;
  }
 }
 if(guideBand)drawStereoGuides(out,w,h,far,guideBand);
 return out;
}
