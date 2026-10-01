import {clamp,hash,sample,lum,warp,map,field} from './pixels.js';
const TAU=Math.PI*2;
// Image luminance + a smooth analytic potential. Its rotated gradient drives
// midpoint integration on a bounded grid; this is not a Navier-Stokes solver.
export function flow(a,w,h,p){
 if(p.distance===0)return new Uint8ClampedArray(a);
 const f=field(a,w,h,192),fw=f.w,fh=f.h,phase=hash(1,1,p.seed)*TAU,potential=new Float32Array(fw*fh);
 for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
  const u=x/192*p.scale*TAU,v=y/192*p.scale*TAU;
  potential[y*fw+x]=f.v[y*fw+x]*p.tension/100*2+(.7*Math.sin(u+phase)*Math.cos(v*.73)+.23*Math.sin(u*1.7-v*1.3+phase))*(1-p.tension/180);
 }
 const vx=new Float32Array(fw*fh),vy=new Float32Array(fw*fh);
 for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
  const i=y*fw+x;vx[i]=(sample(potential,fw,fh,x,y+1,0,1)-sample(potential,fw,fh,x,y-1,0,1))*1.8;
  vy[i]=-(sample(potential,fw,fh,x+1,y,0,1)-sample(potential,fw,fh,x-1,y,0,1))*1.8;
 }
 const dx=new Float32Array(fw*fh),dy=new Float32Array(fw*fh),dt=p.distance/1000*192/16;
 for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
  let xx=x,yy=y;
  for(let k=0;k<16;k++){
   const mx=xx+sample(vx,fw,fh,xx,yy,0,1)*dt/2,my=yy+sample(vy,fw,fh,xx,yy,0,1)*dt/2;
   xx+=sample(vx,fw,fh,mx,my,0,1)*dt;yy+=sample(vy,fw,fh,mx,my,0,1)*dt;
  }dx[y*fw+x]=(xx-x)*w/fw;dy[y*fw+x]=(yy-y)*h/fh;
 }
 return warp(a,w,h,(x,y,q)=>{q[0]=x+sample(dx,fw,fh,x*fw/w,y*fh/h,0,1);q[1]=y+sample(dy,fw,fh,x*fw/w,y*fh/h,0,1);});
}
// A fixed simulation grid makes preview/export share the same growth history.
export function reaction(a,w,h,p){
 const f=field(a,w,h,192),fw=f.w,fh=f.h,n=fw*fh;
 let A=new Float32Array(n).fill(1),B=new Float32Array(n),na=new Float32Array(n),nb=new Float32Array(n);
 for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
  const i=y*fw+x;
  if(hash(Math.floor(x/6),Math.floor(y/6),p.seed)>.62&&Math.hypot(x%6-2.5,y%6-2.5)<1.8&&f.v[i]>.06){A[i]=.25;B[i]=.9;}
 }
 for(let step=0;step<p.time*4;step++){
  for(let y=0;y<fh;y++)for(let x=0;x<fw;x++){
   const i=y*fw+x,left=x?i-1:i,right=x<fw-1?i+1:i,up=y?i-fw:i,down=y<fh-1?i+fw:i;
   const ul=(y?y-1:y)*fw+(x?x-1:x),ur=(y?y-1:y)*fw+(x<fw-1?x+1:x),dl=(y<fh-1?y+1:y)*fw+(x?x-1:x),dr=(y<fh-1?y+1:y)*fw+(x<fw-1?x+1:x);
   const la=-A[i]+.2*(A[left]+A[right]+A[up]+A[down])+.05*(A[ul]+A[ur]+A[dl]+A[dr]);
   const lb=-B[i]+.2*(B[left]+B[right]+B[up]+B[down])+.05*(B[ul]+B[ur]+B[dl]+B[dr]);
   const feed=p.feed/1000+(f.v[i]-.5)*.015,kill=.062,react=A[i]*B[i]*B[i];
   na[i]=clamp(A[i]+la-react+feed*(1-A[i]),0,1);nb[i]=clamp(B[i]+.5*lb+react-(kill+feed)*B[i],0,1);
  }[A,na]=[na,A];[B,nb]=[nb,B];
 }
 return map(a,w,h,(o,i,x,y)=>{
  const xx=x*fw/w,yy=y*fh/h,v=sample(B,fw,fh,xx,yy,0,1),gx=sample(B,fw,fh,xx+1,yy,0,1)-sample(B,fw,fh,xx-1,yy,0,1),gy=sample(B,fw,fh,xx,yy+1,0,1)-sample(B,fw,fh,xx,yy-1,0,1);
  const light=(gx-gy)*p.relief*5,ink=clamp(v*2.7,0,1);
  for(let c=0;c<3;c++)o[i+c]=a[i+c]*(.16+1.25*ink)+light;
 });
}
// A scan head remembers RGB and relaxes more slowly after high-contrast edges.
export function memory(a,w,h,p){
 const s=Math.max(w,h)/1000,band=Math.max(1,p.band*s),o=new Uint8ClampedArray(a.length);
 for(let y=0;y<h;y++){
  const k=Math.floor(y/band),sy=(k+.5)*band,direction=hash(k,0,p.seed)>.5?1:-1,state=[0,0,0];
  const start=direction===1?0:w-1;
  for(let c=0;c<3;c++)state[c]=sample(a,w,h,start,sy,c);
  let debt=0,last=0;
  for(let t=0;t<w;t++){
   const x=direction===1?t:w-1-t,yy=sy+Math.sin(x/w*TAU*2+k*.04)*p.drift*s,idx=(y*w+x)*4;
   const r=sample(a,w,h,x,yy,0),g=sample(a,w,h,x,yy,1),b=sample(a,w,h,x,yy,2),l=(r+g+b)/3;
   debt=Math.max(debt*.98,Math.abs(l-last)/255);last=l;
   const keep=Math.exp(-1/Math.max(.1,p.drag/(100-p.drag)*16*s))*(.997+.003*debt),v=[r,g,b];
   for(let c=0;c<3;c++){state[c]=state[c]*keep+v[c]*(1-keep);o[idx+c]=state[c]*.88+v[c]*.12;}
   o[idx+3]=255;
  }
 }return o;
}
function segment(x,y,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,t=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-ax-t*dx,y-ay-t*dy);}
export function score(a,w,h,p){
 const s=Math.max(w,h)/1000,cell=Math.max(1,p.size*s),cols=Math.ceil(w/cell),rows=Math.ceil(h/cell),cells=[];
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
  const cx=(x+.5)*cell,cy=(y+.5)*cell,colors=[0,1,2].map(c=>sample(a,w,h,cx,cy,c)),l=(colors[0]*.2126+colors[1]*.7152+colors[2]*.0722)/255;
  const gx=sample(a,w,h,cx+cell/2,cy,1)-sample(a,w,h,cx-cell/2,cy,1),gy=sample(a,w,h,cx,cy+cell/2,1)-sample(a,w,h,cx,cy-cell/2,1);
  cells.push({colors,l,angle:Math.round(Math.atan2(gy,gx)/(Math.PI/4))*Math.PI/4+Math.PI/2});
 }
 return map(a,w,h,(o,i,x,y)=>{
  const bx=Math.min(cols-1,Math.floor(x/cell)),by=Math.min(rows-1,Math.floor(y/cell)),t=cells[by*cols+bx],u=x/cell-bx-.5,v=y/cell-by-.5,co=Math.cos(t.angle),si=Math.sin(t.angle),xx=u*co-v*si,yy=u*si+v*co;
  let d=segment(xx,yy,-.35,0,.35,0);
  if(t.l<.72)d=Math.min(d,segment(xx,yy,-.25,-.28,-.25,.28));
  if(t.l<.43)d=Math.min(d,segment(xx,yy,.25,-.28,.25,.28));
  if(t.l<.22)d=Math.min(d,segment(xx,yy,-.25,-.28,.25,-.28),segment(xx,yy,-.25,.28,.25,.28));
  const thickness=(.018+p.weight/100*.075)*(1.3-t.l*.5),ink=clamp((thickness-d)*cell+ .5,0,1);
  for(let c=0;c<3;c++){const paper=244*(1-p.paper/100)+a[i+c]*p.paper/100;o[i+c]=paper*(1-ink)+t.colors[c]*.65*ink;}
 });
}
export function adaptive(a,w,h,p){
 const o=new Uint8ClampedArray(a.length),s=Math.max(w,h)/1000,min=Math.max(2,7*s),max=Math.max(4,Math.round(p.size*s));
 const tile=(x,y,tw,th)=>{
  const colors=[0,1,2].map(c=>sample(a,w,h,x+tw/2,y+th/2,c)),center=colors[0]*.2126+colors[1]*.7152+colors[2]*.0722;
  let variation=0;
  for(let yy=0;yy<3;yy++)for(let xx=0;xx<3;xx++){
   const sx=Math.min(w-1,Math.floor(x+(xx+.5)*tw/3)),sy=Math.min(h-1,Math.floor(y+(yy+.5)*th/3));
   variation=Math.max(variation,Math.abs(lum(a,(sy*w+sx)*4)-center));
  }
  if(variation>p.detail&&tw>min*2&&th>min*2){const hw=Math.floor(tw/2),hh=Math.floor(th/2);tile(x,y,hw,hh);tile(x+hw,y,tw-hw,hh);tile(x,y+hh,hw,th-hh);tile(x+hw,y+hh,tw-hw,th-hh);return;}
  for(let yy=y;yy<Math.min(h,y+th);yy++)for(let xx=x;xx<Math.min(w,x+tw);xx++){const i=(yy*w+xx)*4,shade=(xx===x||yy===y)?.8:1;for(let c=0;c<3;c++)o[i+c]=colors[c]*shade;o[i+3]=255;}
 };
 for(let y=0;y<h;y+=max)for(let x=0;x<w;x+=max)tile(x,y,Math.min(max,w-x),Math.min(max,h-y));
 return o;
}
