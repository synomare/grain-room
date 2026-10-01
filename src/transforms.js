import {clamp,hash,sample,lum,warp,map,field} from './pixels.js';
import {flow,reaction,memory,score,adaptive} from './field-effects.js';
const TAU=Math.PI*2;
export function transform(a,w,h,id,p){
 const s=Math.max(w,h)/1000,cell=(p.size||10)*s,seed=p.seed;
 if(id==='flow')return flow(a,w,h,p);
 if(id==='reaction')return reaction(a,w,h,p);
 if(id==='memory')return memory(a,w,h,p);
 if(id==='score')return score(a,w,h,p);
 if(id==='adaptive')return adaptive(a,w,h,p);
 if(id==='wave')return warp(a,w,h,(x,y,q)=>{q[0]=x+Math.sin(y/h*TAU*p.frequency+p.phase*Math.PI/180)*p.amplitude*s;q[1]=y;});
 if(id==='prism'){
  const angle=p.angle*Math.PI/180,dx=Math.cos(angle)*p.distance*s,dy=Math.sin(angle)*p.distance*s;
  return map(a,w,h,(o,i,x,y)=>{for(let c=0;c<3;c++)o[i+c]=sample(a,w,h,x+(c-1)*dx,y+(c-1)*dy,c);});
 }
 if(id==='riso')return map(a,w,h,(o,i,x,y)=>{
  for(let c=0;c<3;c++){
   const t=(15+c*30)*Math.PI/180,co=Math.cos(t),si=Math.sin(t),xx=x+(c-1)*p.offset*s,yy=y+(c===1?-1:1)*p.offset*s;
   const u=xx*co+yy*si,v=-xx*si+yy*co,cx=(Math.floor(u/cell)+.5)*cell,cy=(Math.floor(v/cell)+.5)*cell;
   const ink=1-sample(a,w,h,cx*co-cy*si,cx*si+cy*co,c)/255;
   const dot=clamp(Math.sqrt(ink/Math.PI)*cell-Math.hypot(u-cx,v-cy)+.5,0,1);
   o[i+c]=246-dot*229;
  }
 });
 if(id==='sort'){
  const o=new Uint8ClampedArray(a),span=Math.max(1,Math.round(p.span*s));
  for(let x=0;x<w;x++){
   let y=0;
   while(y<h){
    if(lum(a,(y*w+x)*4)<p.threshold){y++;continue;}
    const start=y,index=[];
    while(y<h&&y-start<span&&lum(a,(y*w+x)*4)>=p.threshold){index.push((y*w+x)*4);y++;}
    index.sort((i,j)=>lum(a,i)-lum(a,j));
    for(let k=0;k<index.length;k++)for(let c=0;c<3;c++)o[((start+k)*w+x)*4+c]=a[index[k]+c];
   }
  }return o;
 }
 if(id==='slit')return warp(a,w,h,(x,y,q)=>{const k=Math.floor(x/cell);q[0]=x;q[1]=y+(hash(k,0,seed)-.5)*p.shift*s*2;});
 if(id==='weave')return map(a,w,h,(o,i,x,y)=>{
  const bx=Math.floor(x/cell),by=Math.floor(y/cell),vertical=(bx+by)%2===0,fx=x/cell-bx,fy=y/cell-by;
  const xx=vertical?(bx+.5)*cell:x+Math.sin(by*2.4)*p.shift*s,yy=vertical?y+Math.cos(bx*2.4)*p.shift*s:(by+.5)*cell;
  const shade=.73+.27*Math.sin((vertical?fx:fy)*Math.PI);
  for(let c=0;c<3;c++)o[i+c]=sample(a,w,h,xx,yy,c)*shade;
 });
 if(id==='echo')return map(a,w,h,(o,i,x,y)=>{
  let xx=x-w/2,yy=y-h/2,div=0,r=0,g=0,b=0;
  const t=p.twist*Math.PI/180,co=Math.cos(t),si=Math.sin(t);
  for(let k=0;k<p.depth;k++){
   const weight=Math.pow(.82,k);r+=sample(a,w,h,xx+w/2,yy+h/2,0)*weight;g+=sample(a,w,h,xx+w/2,yy+h/2,1)*weight;b+=sample(a,w,h,xx+w/2,yy+h/2,2)*weight;div+=weight;
   const nx=(xx*co-yy*si)*p.zoom/100;yy=(xx*si+yy*co)*p.zoom/100;xx=nx;
  }o[i]=r/div;o[i+1]=g/div;o[i+2]=b/div;
 });
 if(id==='glass'){
  const f=field(a,w,h),get=(x,y)=>sample(f.v,f.w,f.h,x*f.w/w,y*f.h/h,0,1),d=cell;
  return warp(a,w,h,(x,y,q)=>{q[0]=x+(get(x+d,y)-get(x-d,y))*p.distance*s*3;q[1]=y+(get(x,y+d)-get(x,y-d))*p.distance*s*3;});
 }
 if(id==='iso')return map(a,w,h,(o,i)=>{
  const l=lum(a,i)/255,t=l*p.levels,b=Math.floor(t),edge=Math.pow(Math.max(0,1-(t-b)*7),2)*p.edge/100;
  for(let c=0;c<3;c++)o[i+c]=(a[i+c]*(.52+.7*(b+.5)/p.levels)+45*Math.sin(b*.8+c*2.1))*(1-edge*.8);
 });
 if(id==='hatch'){
  const t=p.angle*Math.PI/180,co=Math.cos(t),si=Math.sin(t);
  return map(a,w,h,(o,i,x,y)=>{
   const darkness=1-lum(a,i)/255,u=(x*co+y*si)/cell,v=(-x*si+y*co)/cell;
   const line=Math.min(u-Math.floor(u),1-u+Math.floor(u)),cross=Math.min(v-Math.floor(v),1-v+Math.floor(v));
   const ink=line<darkness*.43||(darkness>.5&&cross<(darkness-.5)*.6);
   for(let c=0;c<3;c++)o[i+c]=ink?a[i+c]*.55:245;
  });
 }
 if(id==='relief')return map(a,w,h,(o,i,x,y)=>{
  const v=lum(a,i)/255,yy=y+(v-.5)*p.height*s,contour=.7+.3*Math.cos(v*p.frequency*TAU);
  for(let c=0;c<3;c++)o[i+c]=sample(a,w,h,x,yy,c)*contour;
 });
 if(id==='mosaic')return map(a,w,h,(o,i,x,y)=>{
  const bx=Math.floor(x/cell),by=Math.floor(y/cell);let d1=Infinity,d2=Infinity,px=0,py=0;
  for(let yy=by-1;yy<=by+1;yy++)for(let xx=bx-1;xx<=bx+1;xx++){
   const sx=(xx+.15+hash(xx,yy,seed)*.7)*cell,sy=(yy+.15+hash(xx,yy,seed+1)*.7)*cell,d=(x-sx)**2+(y-sy)**2;
   if(d<d1){d2=d1;d1=d;px=sx;py=sy;}else if(d<d2)d2=d;
  }
  const border=clamp((Math.sqrt(d2)-Math.sqrt(d1))/(cell*.001*p.edge+.01),0,1);
  for(let c=0;c<3;c++)o[i+c]=sample(a,w,h,px,py,c)*(.3+.7*border);
 });
 if(id==='fold')return warp(a,w,h,(x,y,q)=>{
  const xx=x-w/2,yy=y-h/2,r=Math.hypot(xx,yy),sector=TAU/p.segments,t=Math.atan2(yy,xx)+p.phase*Math.PI/180;
  const angle=Math.abs(((t%sector)+sector)%sector-sector/2)+p.phase*Math.PI/180;q[0]=w*p.focus/100-Math.sin(angle)*r*.8;q[1]=h*.45-Math.cos(angle)*r*.8;
 });
 if(id==='shards')return map(a,w,h,(o,i,x,y)=>{
  const bx=Math.floor(x/cell),by=Math.floor(y/cell),fx=x/cell-bx,fy=y/cell-by,half=fx+fy>1?1:0;
  const sx=bx*2+half,turn=(hash(sx,by,seed)-.5)*p.turn*Math.PI/100,co=Math.cos(turn),si=Math.sin(turn),cx=(bx+(half?2/3:1/3))*cell,cy=(by+(half?2/3:1/3))*cell;
  const xx=(x-cx)*co-(y-cy)*si+cx+(hash(sx,by,seed+1)-.5)*p.scatter*s*2,yy=(x-cx)*si+(y-cy)*co+cy+(hash(sx,by,seed+2)-.5)*p.scatter*s*2;
  const shade=.82+.24*hash(sx,by,seed+4);
  for(let c=0;c<3;c++)o[i+c]=sample(a,w,h,xx,yy,c)*shade;
 });
 throw new Error('フィルターの実装が見つかりません。');
}
