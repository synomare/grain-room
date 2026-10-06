import {hash,clamp} from './pixels.js';
// Independent digital resist-opening model. Every image pixel is a graph node.
// Source: Cordier's lexicon and Collins' account of delayed resist removal.
// Eight-neighbour travel and competing one-way reservoirs are design rules,
// not calibrated varnish, silver chemistry or a continuum erosion solver.
export const resistDefaults={threshold:105,smooth:8,resist:75,texture:45,scale:60,opening:1,lines:5,angle:12,period:24,cycles:28,first:0,develop:8,fix:8,colour:65,paper:96,keep:0,hold:0,seed:17};
export function box(v,w,h,r){
 if(!r)return Float32Array.from(v);const a=new Float32Array(v.length),b=new Float32Array(v.length);
 for(let y=0;y<h;y++){let sum=0;for(let x=-r;x<=r;x++)sum+=v[y*w+clamp(x,0,w-1)];for(let x=0;x<w;x++){a[y*w+x]=sum/(2*r+1);sum+=v[y*w+clamp(x+r+1,0,w-1)]-v[y*w+clamp(x-r,0,w-1)];}}
 for(let x=0;x<w;x++){let sum=0;for(let y=-r;y<=r;y++)sum+=a[clamp(y,0,h-1)*w+x];for(let y=0;y<h;y++){b[y*w+x]=sum/(2*r+1);sum+=a[clamp(y+r+1,0,h-1)*w+x]-a[clamp(y-r,0,h-1)*w+x];}}
 return b;
}
export function arrival(cost,seeds,w,h){
 const n=w*h,d=new Float64Array(n).fill(Infinity),heap=new Int32Array(n),pos=new Int32Array(n).fill(-1);let size=0;
 const swap=(a,b)=>{const x=heap[a];heap[a]=heap[b];heap[b]=x;pos[heap[a]]=a;pos[heap[b]]=b;};
 const up=k=>{while(k){const a=(k-1)>>1;if(d[heap[a]]<=d[heap[k]])break;swap(a,k);k=a;}};
 for(let j=0;j<n;j++)if(seeds[j]){d[j]=0;pos[j]=size;heap[size++]=j;}
 const relax=(j,k,length=1)=>{if(pos[k]===-2)return;const q=d[j]+length*.5*(cost[j]+cost[k]);if(q>=d[k])return;d[k]=q;if(pos[k]<0){pos[k]=size;heap[size++]=k;}up(pos[k]);};
 while(size){
  const j=heap[0];size--;if(size){heap[0]=heap[size];pos[heap[0]]=0;let k=0;while(k*2+1<size){let b=k*2+1;if(b+1<size&&d[heap[b+1]]<d[heap[b]])b++;if(d[heap[k]]<=d[heap[b]])break;swap(k,b);k=b;}}
  pos[j]=-2;const x=j%w,y=Math.floor(j/w);if(x)relax(j,j-1);if(x+1<w)relax(j,j+1);if(y)relax(j,j-w);if(y+1<h)relax(j,j+w);
  if(x&&y)relax(j,j-w-1,Math.SQRT2);if(x+1<w&&y)relax(j,j-w+1,Math.SQRT2);if(x&&y+1<h)relax(j,j+w-1,Math.SQRT2);if(x+1<w&&y+1<h)relax(j,j+w+1,Math.SQRT2);
 }
 return d;
}
export function resistPlan(a,w,h,params={}){
 const p={...resistDefaults,...params},S=Math.max(w,h)/1000,n=w*h,light=Float32Array.from({length:n},(_,j)=>(.2126*a[j*4]+.7152*a[j*4+1]+.0722*a[j*4+2])/255),guide=box(light,w,h,Math.round(p.smooth*S)),cost=new Float32Array(n),seeds=new Uint8Array(n),co=Math.cos(p.angle*Math.PI/180),si=Math.sin(p.angle*Math.PI/180);let count=0,best=0;
 const period=Math.max(1,p.scale*S),spacing=Math.max(w,h)/(p.lines+1);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const j=y*w+x,u=x/period,v=y/period,ix=Math.floor(u),iy=Math.floor(v),fx=u-ix,fy=v-iy,X=fx*fx*(3-2*fx),Y=fy*fy*(3-2*fy),noise=(hash(ix,iy,p.seed)*(1-X)+hash(ix+1,iy,p.seed)*X)*(1-Y)+(hash(ix,iy+1,p.seed)*(1-X)+hash(ix+1,iy+1,p.seed)*X)*Y;
  cost[j]=1+p.resist/100*8*(1-guide[j])*(1+p.texture/100*(noise*2-1)*.9);
  const line=(x*co+y*si)/spacing,cut=Math.abs(line-Math.round(line))*spacing<=Math.max(.75,S),open=p.opening===0?guide[j]*255>=p.threshold:cut&&(p.opening===1||guide[j]*255>=p.threshold);
  if(open){seeds[j]=1;count++;}if(guide[j]>guide[best])best=j;
 }
 if(!count){seeds[best]=1;count=1;}
 return {p,w,h,S,guide,cost,seeds,count,arrival:arrival(cost,seeds,w,h)};
}
function bathFactors(p){
 const develop=Math.exp(-p.develop),fix=Math.exp(-p.fix),q=develop*fix,n=Math.floor(p.cycles/2)+1,power=new Float64Array(n),sum=new Float64Array(n);
 for(let j=0;j<n;j++){power[j]=q**j;sum[j]=q===1?j:(1-power[j])/(1-q);}
 return {develop,fix,power,sum};
}
export function bathState(t,p,out=[1,0,0],factors=bathFactors(p)){
 const end=p.period*p.cycles;
 if(t>=end){out[0]=1;out[1]=out[2]=0;return out;}let R=1,D=0,F=0;
 const k=Math.floor(t/p.period),dev=(k+p.first)%2===0,span=(k+1)-t/p.period,converted=-Math.expm1(-span*(dev?p.develop:p.fix));
 if(dev)D=converted;else F=converted;R=1-converted;
 const left=p.cycles-k-1,pairs=Math.floor(left/2),A=dev?factors.fix:factors.develop,B=dev?factors.develop:factors.fix;
 const sum=factors.sum[pairs],first=R*(1-A)*sum,second=R*A*(1-B)*sum;
 if(dev){F+=first;D+=second;}else{D+=first;F+=second;}
 R*=factors.power[pairs];
 if(left%2){const extra=R*(1-A);R*=A;if(dev)F+=extra;else D+=extra;}
 out[0]=R;out[1]=D;out[2]=F;return out;
}
export function resistFronts(a,w,h,params={}){
 const {p,S,arrival:d}=resistPlan(a,w,h,params),out=new Uint8ClampedArray(a.length),paper=[p.paper*2.55,p.paper*2.52,p.paper*2.45],factors=bathFactors(p),b=[0,0,0],holdY=h*(1-p.hold/100),final=p.period*(p.cycles-1);
 for(let j=0;j<w*h;j++){
  const x=j%w,y=Math.floor(j/w),i=j*4;let R=0,D=0,F=0;
  // Four quarter-pixel samples integrate the bath response, not source colour.
  // Bilinear interpolation of the native arrival field softens raster stairs;
  // it does not change the eight-neighbour travel metric into a continuum.
  for(let dy=-1;dy<=1;dy+=2)for(let dx=-1;dx<=1;dx+=2){
   const X=clamp(x+dx,0,w-1),Y=clamp(y+dy,0,h-1),held=p.hold>0&&y+.5+dy*.25>=holdY;
   const t=held?final:(d[j]*.5625+(d[y*w+X]+d[Y*w+x])*.1875+d[Y*w+X]*.0625)/S;
   bathState(t,p,b,factors);R+=b[0]*.25;D+=b[1]*.25;F+=b[2]*.25;
  }
  for(let c=0;c<3;c++){
   const ink=(1-p.colour/100)*([18,13,9][c])+p.colour/100*(255-a[i+c])*.65,protectedTone=p.keep/100*a[i+c]+(1-p.keep/100)*paper[c];
   // Snap sub-byte arithmetic noise before the specified ties-to-even clamp.
   // Node and Chromium may place an exact half byte on opposite sides by ulps.
   const value=R*protectedTone+D*ink+F*paper[c];out[i+c]=Math.round(value*1e9)/1e9;
  }out[i+3]=255;
 }
 return out;
}
