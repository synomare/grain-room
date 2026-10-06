import {sample} from './pixels.js';

const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
export const PLATE_COUNT=6;
export const PALETTE_GUIDE_EDGE=192;

// RGB here is encoded sRGB, not linear light or pigment concentration.
export function replacementColor(hue,chroma,tone){
 const h=((hue%360)+360)%360/60,s=chroma/100,l=tone/100,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h%2-1)),m=l-c/2;
 const v=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];
 return v.map(q=>q+m);
}
function colorOrder(v){
 const hi=Math.max(v[0],v[1],v[2]),lo=Math.min(v[0],v[1],v[2]),d=hi-lo;
 if(d<.08||d/Math.max(hi,1e-12)<.14)return 360+(hi+lo)/2;
 const h=hi===v[0]?(v[1]-v[2])/d:hi===v[1]?2+(v[2]-v[0])/d:4+(v[0]-v[1])/d;
 return ((h*60)%360+360)%360;
}
function distance(a,b){let d=0;for(let c=0;c<3;c++)d+=(a[c]-b[c])**2;return d;}

// Deterministic RGB-only palette extraction. Global color groups, not Voronoi sites.
// Farthest-first starts at the most chromatic sampled pixel; ties use raster order.
export function extractPalette(points,maxColors=PLATE_COUNT){
 let first=0,best=-1;
 for(let i=0;i<points.length;i++){const q=points[i],score=Math.max(q[0],q[1],q[2])-Math.min(q[0],q[1],q[2]);if(score>best){best=score;first=i;}}
 let palette=[points[first].slice(0,3)];
 while(palette.length<maxColors){
  let far=-1,id=0;for(let i=0;i<points.length;i++){let d=Infinity;for(const q of palette)d=Math.min(d,distance(points[i],q));if(d>far){far=d;id=i;}}
  if(far<1e-7)break;palette.push(points[id].slice(0,3));
 }
 let sums,mass;
 for(let iteration=0;iteration<10;iteration++){
  sums=palette.map(()=>new Float64Array(5));mass=new Uint32Array(palette.length);
  for(const point of points){let id=0,best=Infinity;for(let k=0;k<palette.length;k++){const d=distance(point,palette[k]);if(d<best){best=d;id=k;}}
   mass[id]++;for(let d=0;d<5;d++)sums[id][d]+=point[d];
  }
  for(let k=0;k<palette.length;k++)if(mass[k])palette[k]=Array.from(sums[k],v=>v/mass[k]);
 }
 return palette.filter((_,k)=>mass[k]>0).sort((a,b)=>colorOrder(a)-colorOrder(b)||a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
}

// Independent convex RGBXY fit, not Tan et al.'s hull/tessellation algorithm.
// min 1/2||sum_k w_k*(RGB,lambda*XY)_k - (RGB,lambda*XY)_p||²
//   + ridge/2||w||², subject to w>=0, sum(w)=1.
// Projected accelerated gradient with a conservative trace Lipschitz bound.
export function fitWeights(target,anchors,position=0,iterations=64){
 const count=anchors.length,lambda=position/100*.65,ridge=.0001;
 const basis=anchors.map(q=>[q[0],q[1],q[2],q[3]*lambda,q[4]*lambda]);
 const b=[target[0],target[1],target[2],target[3]*lambda,target[4]*lambda];
 const w=new Float64Array(count),y=w.slice(),next=w.slice(),sorted=w.slice(),error=new Float64Array(5);
 let lipschitz=ridge,t=1;
 for(const q of basis)for(const v of q)lipschitz+=v*v;
 w.fill(1/count);y.set(w);
 for(let iteration=0;iteration<iterations;iteration++){
  for(let d=0;d<5;d++){error[d]=-b[d];for(let k=0;k<count;k++)error[d]+=y[k]*basis[k][d];}
  for(let k=0;k<count;k++){let grad=ridge*y[k];for(let d=0;d<5;d++)grad+=basis[k][d]*error[d];next[k]=y[k]-grad/lipschitz;sorted[k]=next[k];}
  // Insertion sort avoids allocating an array inside the pixel/iteration loop.
  for(let k=1;k<count;k++){const v=sorted[k];let j=k-1;while(j>=0&&sorted[j]<v){sorted[j+1]=sorted[j];j--;}sorted[j+1]=v;}
  let total=0,theta=0;for(let k=0;k<count;k++){total+=sorted[k];const candidate=(total-1)/(k+1);if(sorted[k]>candidate)theta=candidate;}
  for(let k=0;k<count;k++)next[k]=Math.max(0,next[k]-theta);
  const nextT=(1+Math.sqrt(1+4*t*t))/2,momentum=(t-1)/nextT;
  for(let k=0;k<count;k++){y[k]=next[k]+momentum*(next[k]-w[k]);w[k]=next[k];}t=nextT;
 }
 return w;
}

export function decomposePalette(a,w,h,position=25){
 const factor=Math.min(1,PALETTE_GUIDE_EDGE/Math.max(w,h)),gw=Math.max(1,Math.round(w*factor)),gh=Math.max(1,Math.round(h*factor)),points=[];
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
  const sx=(x+.5)*w/gw-.5,sy=(y+.5)*h/gh-.5;
  points.push([sample(a,w,h,sx,sy,0)/255,sample(a,w,h,sx,sy,1)/255,sample(a,w,h,sx,sy,2)/255,(x+.5)/gw,(y+.5)/gh]);
 }
 const anchors=extractPalette(points),weights=new Float32Array(gw*gh*PLATE_COUNT);let squaredError=0;
 for(let i=0;i<points.length;i++){
  const values=fitWeights(points[i],anchors,position);for(let k=0;k<values.length;k++)weights[i*PLATE_COUNT+k]=values[k];
  for(let c=0;c<3;c++){let estimate=0;for(let k=0;k<anchors.length;k++)estimate+=values[k]*anchors[k][c];squaredError+=(estimate-points[i][c])**2;}
 }
 return {w:gw,h:gh,anchors,weights,rms:Math.sqrt(squaredError/(points.length*3))};
}

export function recolorPalette(a,w,h,analysis,component,target,replace=100,view=0){
 if(replace===0&&view===0)return a.slice();
 const k=component-1,original=analysis.anchors[k],out=new Uint8ClampedArray(a.length),amount=replace/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,weight=original?sample(analysis.weights,analysis.w,analysis.h,(x+.5)*analysis.w/w-.5,(y+.5)*analysis.h/h-.5,k,PLATE_COUNT):0;
  for(let c=0;c<3;c++){
   // Retain the original residual/detail: source + w_k*(replacement-original).
   // Replacement and view never participate in extraction or weight fitting.
   const value=view?weight:a[i+c]/255+(original?weight*(target[c]-original[c])*amount:0);
   out[i+c]=255*clamp(value);
  }out[i+3]=255;
 }
 return out;
}
export function palettePlates(a,w,h,p){
 if(p.replace===0&&p.view===0)return a.slice();
 const analysis=decomposePalette(a,w,h,p.position);
 return recolorPalette(a,w,h,analysis,p.component,replacementColor(p.hue,p.chroma,p.tone),p.replace,p.view);
}
