import {hash,clamp} from './pixels.js';
import {grid,blur,at,expand} from './research-math.js';
export function physarum(a,w,h,p){
 const g=grid(a,w,h,320),W=g.w,H=g.h,n=W*H,scale=Math.max(W,H)/320;
 let trail=new Float32Array(n);
 const count=Math.min(14000,n*2),xs=new Float32Array(count),ys=xs.slice(),angles=xs.slice(),food=blur(g.l,W,H,2);
 for(let k=0;k<count;k++){xs[k]=hash(k,1,p.seed)*(W-1);ys[k]=hash(k,2,p.seed)*(H-1);angles[k]=hash(k,3,p.seed)*Math.PI*2;}
 const sense=(x,y,t)=>{const sx=x+Math.cos(t)*p.sensor*scale,sy=y+Math.sin(t)*p.sensor*scale;return at(trail,W,H,sx,sy)+at(food,W,H,sx,sy)*p.attraction/14;};
 for(let t=0;t<p.time;t++){
  for(let k=0;k<count;k++){
   let angle=angles[k],x=xs[k],y=ys[k];
   const f=sense(x,y,angle),l=sense(x,y,angle-.7),r=sense(x,y,angle+.7);
   if(f<l&&f<r)angle+=(hash(k,t,p.seed)-.5)*1.5;
   else if(l>r)angle-=.45;else if(r>l)angle+=.45;
   x+=Math.cos(angle)*1.1*scale;y+=Math.sin(angle)*1.1*scale;
   if(x<0||x>W-1){angle=Math.PI-angle;x=clamp(x,0,W-1);}
   if(y<0||y>H-1){angle=-angle;y=clamp(y,0,H-1);}
   xs[k]=x;ys[k]=y;angles[k]=angle;trail[Math.round(y)*W+Math.round(x)]+=.65;
  }
  const diff=blur(trail,W,H,1);for(let i=0;i<n;i++)trail[i]=(trail[i]*.35+diff[i]*.65)*.965;
 }
 const sorted=Array.from(trail).sort((a,b)=>a-b),high=sorted[Math.floor(n*.985)]||1;
 const out=g.rgb.map(()=>new Float32Array(n));
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,z=Math.pow(clamp(trail[i]/high,0,1),1.8),rim=Math.max(0,at(trail,W,H,x-1,y-1)-at(trail,W,H,x+1,y+1))/high;
  for(let c=0;c<3;c++)out[c][i]=g.rgb[c][i]*.12+(g.rgb[c][i]*1.15+.16)*z+rim*.6;
 }
 return expand(out,W,H,w,h);
}
export function turing(a,w,h,p){
 const g=grid(a,w,h,320),W=g.w,H=g.h,n=W*H,unit=Math.max(W,H)/320;
 let v=new Float32Array(n);for(let i=0;i<n;i++)v[i]=(g.l[i]-.5)*.8+(hash(i%W,Math.floor(i/W),p.seed)-.5)*.4;
 v=blur(v,W,H,2);
 const radii=[2,4,8,16,32].map(r=>Math.max(1,Math.round(r*p.scale/5*unit)));
 for(let t=0;t<p.time;t++){
  const best=new Float32Array(n).fill(Infinity),change=new Float32Array(n);
  for(let k=0;k<radii.length;k++){
   const r=radii[k],smooth=(field,radius)=>{const rr=Math.max(1,Math.round(radius/.577/3));return blur(blur(blur(field,W,H,rr),W,H,rr),W,H,rr);},act=smooth(v,r),inh=smooth(v,r*2),delta=new Float32Array(n);
   for(let i=0;i<n;i++)delta[i]=Math.abs(act[i]-inh[i]);
   const variation=blur(delta,W,H,r);
   for(let i=0;i<n;i++)if(variation[i]<best[i]){best[i]=variation[i];change[i]=(act[i]>inh[i]?1:-1)*(.035+k*.007);}
  }
  let lo=Infinity,hi=-Infinity;
  for(let i=0;i<n;i++){v[i]+=change[i]+(g.l[i]-.5)*.003;lo=Math.min(lo,v[i]);hi=Math.max(hi,v[i]);}
  const span=hi-lo||1;for(let i=0;i<n;i++)v[i]=(v[i]-lo)*2/span-1;
 }
 const out=g.rgb.map(()=>new Float32Array(n));
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,level=.5+.5*v[i],gx=at(v,W,H,x+1,y)-at(v,W,H,x-1,y),gy=at(v,W,H,x,y+1)-at(v,W,H,x,y-1),shine=clamp((gx-gy)*p.relief/50,-.7,.7);
  for(let c=0;c<3;c++)out[c][i]=(g.rgb[c][i]*.9+.12)*(.4+level*.9)+shine*.65;
 }
 return expand(out,W,H,w,h);
}
