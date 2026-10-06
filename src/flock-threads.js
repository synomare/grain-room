import{sample,hash,clamp}from'./pixels.js';
export const flockDefaults={time:90,density:45,radius:32,align:80,cohesion:40,separation:80,follow:65,width:1.2,carry:80,photo:40,paper:0,amount:100};
const SPEED=2.5,FORCE=.18;
export function flockIndex(s,W,H,r){const cols=Math.max(1,Math.floor(W/r)+1),rows=Math.max(1,Math.floor(H/r)+1),head=new Int32Array(cols*rows).fill(-1),next=new Int32Array(s.x.length);for(let i=0;i<s.x.length;i++){const cell=Math.floor(s.y[i]/r)*cols+Math.floor(s.x[i]/r);next[i]=head[cell];head[cell]=i;}return{cols,rows,head,next};}
export function flockUrges(s,i,near,r,seed=17){
 let x=0,y=0,vx=0,vy=0,sx=0,sy=0,count=0,close=0;const r2=r*r,near2=r2*.2025;
 for(const j of near){if(j===i)continue;const dx=s.x[j]-s.x[i],dy=s.y[j]-s.y[i],d2=dx*dx+dy*dy;if(d2>r2)continue;x+=dx;y+=dy;vx+=s.vx[j];vy+=s.vy[j];count++;
  if(d2<near2){if(d2<1e-12){const a=hash(Math.min(i,j),Math.max(i,j),seed)*Math.PI*2,k=i<j?1:-1;sx+=Math.cos(a)*k;sy+=Math.sin(a)*k;}else{sx-=dx/d2;sy-=dy/d2;}close++;}
 }
 const steer=(x,y,desired=true)=>{const length=Math.hypot(x,y);if(desired&&length>1e-12){x*=SPEED/length;y*=SPEED/length;}x-=s.vx[i];y-=s.vy[i];const factor=Math.min(1,FORCE/(Math.hypot(x,y)||1));return[x*factor,y*factor];};
 return{alignment:count?steer(vx/count,vy/count,false):[0,0],cohesion:count?steer(x/count,y/count):[0,0],separation:close?steer(sx/close,sy/close):[0,0],count};
}
export function flockReflect(x,v,extent){if(extent<=0)return[0,0];const period=2*extent,q=((x%period)+period)%period;return q<=extent?[q,v]:[period-q,-v];}
export function flockStep(s,W,H,p=flockDefaults,guide=null,out={x:new Float64Array(s.x.length),y:new Float64Array(s.x.length),vx:new Float64Array(s.x.length),vy:new Float64Array(s.x.length)}){
 const index=flockIndex(s,W,H,p.radius),near=[];
 for(let i=0;i<s.x.length;i++){near.length=0;const cx=Math.floor(s.x[i]/p.radius),cy=Math.floor(s.y[i]/p.radius);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=index.cols||y>=index.rows)continue;for(let j=index.head[y*index.cols+x];j!==-1;j=index.next[j])near.push(j);}
  const u=flockUrges(s,i,near,p.radius,p.seed),g=guide?.(s.x[i],s.y[i],s.vx[i],s.vy[i])??[0,0];let ax=u.alignment[0]*p.align/100+u.cohesion[0]*p.cohesion/100+u.separation[0]*p.separation/100+g[0]*p.follow/100,ay=u.alignment[1]*p.align/100+u.cohesion[1]*p.cohesion/100+u.separation[1]*p.separation/100+g[1]*p.follow/100;
  const limited=Math.min(1,.35/(Math.hypot(ax,ay)||1));let vx=s.vx[i]+ax*limited,vy=s.vy[i]+ay*limited,length=Math.hypot(vx,vy);if(length>3){vx*=3/length;vy*=3/length;}else if(length<1&&length>1e-12){vx/=length;vy/=length;}else if(length<=1e-12){vx=SPEED;vy=0;}
  [out.x[i],out.vx[i]]=flockReflect(s.x[i]+vx,vx,W);[out.y[i],out.vy[i]]=flockReflect(s.y[i]+vy,vy,H);
 }return out;
}
export function flockStroke(out,w,h,ax,ay,bx,by,width,colour,opacity=.22){
 const r=width/2,dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy,x0=Math.max(0,Math.floor(Math.min(ax,bx)-r-1)),x1=Math.min(w-1,Math.ceil(Math.max(ax,bx)+r+1)),y0=Math.max(0,Math.floor(Math.min(ay,by)-r-1)),y1=Math.min(h-1,Math.ceil(Math.max(ay,by)+r+1));
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const t=den?clamp(((x-ax)*dx+(y-ay)*dy)/den,0,1):0,coverage=clamp(r+.5-Math.hypot(x-ax-t*dx,y-ay-t*dy),0,1)*opacity;if(!coverage)continue;const i=(y*w+x)*4;for(let c=0;c<3;c++)out[i+c]+=(colour[c]-out[i+c])*coverage;}
}
export function flockSeeds(a,w,h,p=flockDefaults){
 const scale=Math.max(w,h)/1000,W=(w-1)/scale,H=(h-1)/scale,n=Math.max(1,Math.round(p.density*50*w*h/Math.max(w,h)**2)),s={x:new Float64Array(n),y:new Float64Array(n),vx:new Float64Array(n),vy:new Float64Array(n)},rgb=new Float32Array(n*3);
 for(let i=0;i<n;i++){s.x[i]=hash(i,1,p.seed)*W;s.y[i]=hash(i,2,p.seed)*H;const angle=hash(i,3,p.seed)*Math.PI*2;s.vx[i]=Math.cos(angle)*SPEED;s.vy[i]=Math.sin(angle)*SPEED;for(let c=0;c<3;c++)rgb[i*3+c]=sample(a,w,h,s.x[i]*scale,s.y[i]*scale,c);}return{s,rgb,scale,W,H};
}
export function flockPhotoGuide(a,w,h,scale){
 const l=(x,y)=>.2126*sample(a,w,h,x,y,0)+.7152*sample(a,w,h,x,y,1)+.0722*sample(a,w,h,x,y,2),r=Math.max(.5,2*scale);
 return(x,y,vx,vy)=>{x*=scale;y*=scale;const gx=l(x+r,y)-l(x-r,y),gy=l(x,y+r)-l(x,y-r),length=Math.hypot(gx,gy);if(length<1e-8)return[0,0];let tx=-gy/length,ty=gx/length;if(tx*vx+ty*vy<0){tx=-tx;ty=-ty;}const ax=tx*SPEED-vx,ay=ty*SPEED-vy,factor=Math.min(1,FORCE/(Math.hypot(ax,ay)||1))*Math.min(1,length/12);return[ax*factor,ay*factor];};
}
export function flockThreads(a,w,h,p=flockDefaults){
 if(!p.time||!p.amount)return a.slice();const{rgb,scale,W,H,...initial}=flockSeeds(a,w,h,p);let s=initial.s,next={x:s.x.slice(),y:s.y.slice(),vx:s.vx.slice(),vy:s.vy.slice()};const out=new Float32Array(a.length),colour=[0,0,0],guide=flockPhotoGuide(a,w,h,scale),pick=(1-p.carry/100)*.25;
 for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++)out[i+c]=a[i+c]*p.photo/100+(255*p.paper/100)*(1-p.photo/100);out[i+3]=255;}
 for(let t=0;t<p.time;t++){flockStep(s,W,H,p,guide,next);for(let i=0;i<s.x.length;i++){for(let c=0;c<3;c++){const j=i*3+c;rgb[j]+=(sample(a,w,h,next.x[i]*scale,next.y[i]*scale,c)-rgb[j])*pick;colour[c]=rgb[j];}flockStroke(out,w,h,s.x[i]*scale,s.y[i]*scale,next.x[i]*scale,next.y[i]*scale,p.width*scale,colour);}[s,next]=[next,s];}
 const result=new Uint8ClampedArray(a.length),amount=p.amount/100;for(let i=0;i<out.length;i++)result[i]=i%4===3?255:a[i]+(out[i]-a[i])*amount;return result;
}
