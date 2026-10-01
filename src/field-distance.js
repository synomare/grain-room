import {clamp} from './pixels.js';
import {grid,blur,at,expand} from './research-math.js';

// Lower envelope of parabolas, omitting infinite sites to avoid Infinity-Infinity.
export function distance1D(f){
 const n=f.length,d=new Float64Array(n).fill(Infinity),arg=new Int32Array(n).fill(-1),v=new Int32Array(n),z=new Float64Array(n+1);let k=-1;
 for(let q=0;q<n;q++){
  if(!Number.isFinite(f[q]))continue;
  let s=-Infinity;
  while(k>=0){s=((f[q]+q*q)-(f[v[k]]+v[k]*v[k]))/(2*(q-v[k]));if(s>z[k])break;k--;}
  k++;v[k]=q;z[k]=k===0?-Infinity:s;z[k+1]=Infinity;
 }
 if(k<0)return {d,arg};
 let j=0;for(let q=0;q<n;q++){while(j<k&&z[j+1]<q)j++;arg[q]=v[j];d[q]=(q-v[j])**2+f[v[j]];}
 return {d,arg};
}
export function distanceTransform(sites,w,h){
 const row=new Float64Array(w*h),rowArg=new Int32Array(w*h),distance=new Float64Array(w*h),nearest=new Int32Array(w*h).fill(-1);
 for(let y=0;y<h;y++){const f=Float64Array.from({length:w},(_,x)=>sites[y*w+x]?0:Infinity),r=distance1D(f);row.set(r.d,y*w);rowArg.set(r.arg,y*w);}
 for(let x=0;x<w;x++){
  const r=distance1D(Float64Array.from({length:h},(_,y)=>row[y*w+x]));
  for(let y=0;y<h;y++){const i=y*w+x,j=r.arg[y];distance[i]=r.d[y];if(j>=0)nearest[i]=j*w+rowArg[j*w+x];}
 }
 return {distance,nearest};
}
export function accrete(a,w,h,p){
 if(p.reach===0)return a.slice();
 const g=grid(a,w,h,900),W=g.w,H=g.h,n=W*H,unit=Math.max(W,H)/1000;
 const l=blur(blur(g.l,W,H,Math.max(1,Math.round(unit*8))),W,H,Math.max(1,Math.round(unit*8)));
 const sorted=Array.from(l).sort((a,b)=>a-b),threshold=sorted[Math.min(n-1,Math.floor(n*p.threshold/100))];
 const mask=Uint8Array.from(l,v=>v>threshold),sites=new Uint8Array(n);let count=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x;if(mask[i]&&((x>0&&!mask[i-1])||(x+1<W&&!mask[i+1])||(y>0&&!mask[i-W])||(y+1<H&&!mask[i+W]))){sites[i]=1;count++;}
 }
 if(!count)return a.slice();
 const {distance,nearest}=distanceTransform(sites,W,H),d=Float32Array.from(distance,v=>Math.sqrt(v)),out=g.rgb.map(()=>new Float32Array(n));
 const radius=p.reach*unit,period=Math.max(2,p.spacing*unit),light=p.light*Math.PI/180;
 const colors=g.rgb.map(v=>blur(v,W,H,Math.max(1,Math.round(4*unit))));
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,j=nearest[i],signed=mask[i]?-d[i]:d[i],phase=signed/period*Math.PI*2;
  const gx=(at(d,W,H,x+1,y)-at(d,W,H,x-1,y))*.5,gy=(at(d,W,H,x,y+1)-at(d,W,H,x,y-1))*.5;
  const slope=-Math.sin(phase)*p.relief/65*(mask[i]?-1:1),nx=-gx*slope,ny=-gy*slope,nz=1,den=Math.hypot(nx,ny,nz);
  const diffuse=Math.max(0,(nx*Math.cos(light)*.65+ny*Math.sin(light)*.65+.76)/den),spec=Math.max(0,(nx*Math.cos(light)*.3+ny*Math.sin(light)*.3+.954)/den)**32;
  const ridge=1-.82*Math.exp(-((Math.sin(phase*.5)/.18)**2)),coverage=mask[i]?1:clamp((radius-d[i])/(period*.7),0,1);
  for(let c=0;c<3;c++){
   const body=colors[c][j]*.72+g.rgb[c][i]*.28,ink=body*1.65*ridge*(.65+.65*diffuse)+spec*p.relief/100*.18;
   const paper=p.paper/100*(c===2?.92:1),background=paper*.94+g.rgb[c][i]*.035;
   out[c][i]=background+(ink-background)*coverage;
  }
 }
 return expand(out,W,H,w,h);
}
