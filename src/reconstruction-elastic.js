import {hash,sample,clamp} from './pixels.js';
import {grid,at} from './research-math.js';

// Closed-form weighted similarity fit, evaluated independently at each point.
export function similarityPoint(x,y,from,to,alpha=1.7){
 let sum=0,px=0,py=0,qx=0,qy=0;const weights=[];
 for(let i=0;i<from.length;i++){
  const d=(x-from[i][0])**2+(y-from[i][1])**2;
  if(d<1e-16)return [...to[i]];
  const wt=1/d**alpha;weights.push(wt);sum+=wt;px+=wt*from[i][0];py+=wt*from[i][1];qx+=wt*to[i][0];qy+=wt*to[i][1];
 }
 px/=sum;py/=sum;qx/=sum;qy/=sum;
 let dot=0,cross=0,den=0;
 for(let i=0;i<from.length;i++){const ax=from[i][0]-px,ay=from[i][1]-py,bx=to[i][0]-qx,by=to[i][1]-qy,wt=weights[i];dot+=wt*(ax*bx+ay*by);cross+=wt*(ax*by-ay*bx);den+=wt*(ax*ax+ay*ay);}
 if(den<1e-20)return [x+qx-px,y+qy-py];
 return [qx+((x-px)*dot-(y-py)*cross)/den,qy+((x-px)*cross+(y-py)*dot)/den];
}

export function elastic(a,w,h,p){
 if(!p.pull)return a.slice();
 const g=grid(a,w,h,260),edge=Math.max(w,h),aspectX=w/edge,aspectY=h/edge;
 const from=[[0,0],[aspectX,0],[0,aspectY],[aspectX,aspectY]],to=from.map(v=>[...v]);
 for(let k=0;k<p.anchors;k++){
  let x=0,y=0,best=-1;
  for(let j=0;j<10;j++){const tx=.08+.84*hash(k,j*2,p.seed),ty=.08+.84*hash(k,j*2+1,p.seed),brightness=at(g.l,g.w,g.h,tx*(g.w-1),ty*(g.h-1));if(brightness>best){best=brightness;x=tx*aspectX;y=ty*aspectY;}}
  const theta=(hash(k,43,p.seed)-.5)*Math.PI*2+p.twist/180*Math.PI,amount=p.pull/100*.22*(.5+hash(k,49,p.seed));
  // Destination handles are constrained to the sheet; inverse fit is not an exact inverse of a forward MLS fit.
  from.push([clamp(x+Math.cos(theta)*amount,.015*aspectX,.985*aspectX),clamp(y+Math.sin(theta)*amount,.015*aspectY,.985*aspectY)]);to.push([x,y]);
 }
 const mx=new Float32Array(g.w*g.h),my=mx.slice();
 for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++){
  const v=similarityPoint((x+.5)/g.w*aspectX,(y+.5)/g.h*aspectY,from,to,p.tension/100),i=y*g.w+x;mx[i]=v[0]*edge-.5;my[i]=v[1]*edge-.5;
 }
 const out=new Uint8ClampedArray(a.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const gx=(x+.5)*g.w/w-.5,gy=(y+.5)*g.h/h-.5,sx=at(mx,g.w,g.h,gx,gy),sy=at(my,g.w,g.h,gx,gy),i=(y*w+x)*4;
  for(let c=0;c<3;c++)out[i+c]=sample(a,w,h,sx,sy,c);out[i+3]=255;
 }return out;
}
