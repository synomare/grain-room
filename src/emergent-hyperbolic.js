import {clamp,hash,sample} from './pixels.js';

// Ouyang et al., AMC 510 (2026), equations 3-12, Algorithm 1 and section 3.
// Circle reflections and Klein barycentrics are implemented independently.
export function triangleDomain(a,b,c=4){
 if(1/a+1/b+1/c>=1)throw new Error('A hyperbolic triangle needs an angle sum below pi');
 const A=Math.PI/a,B=Math.PI/b,C=Math.PI/c;
 const xi=Math.atan2(Math.cos(B)*Math.sin(A),Math.cos(C)+Math.cos(A)*Math.cos(B));
 const den=Math.sqrt(Math.cos(B)**2-Math.sin(xi)**2),t=Math.cos(B)/den;
 const cx=t*Math.cos(xi),cy=t*Math.sin(xi),r=Math.sin(xi)/den;
 const qa=1/(cx+Math.sqrt(Math.max(0,cx*cx-1))),d=cx*Math.cos(A)+cy*Math.sin(A),qb=1/(d+Math.sqrt(Math.max(0,d*d-1)));
 const bx=qb*Math.cos(A),by=qb*Math.sin(A),kx=2*qa/(1+qa*qa),factor=2/(1+qb*qb);
 return {A,cx,cy,r,r2:r*r,qa,qb,kx,bx:bx*factor,by:by*factor};
}
export function circleReflect(x,y,d){const dx=x-d.cx,dy=y-d.cy,k=d.r2/(dx*dx+dy*dy);return [d.cx+k*dx,d.cy+k*dy];}
export function foldTriangle(x,y,d){
 let count=0;
 for(let i=0;i<80;i++){
  const radius=Math.hypot(x,y);let angle=Math.atan2(y,x);
  // The dihedral pair of straight mirrors can be reduced in one step.
  angle=((angle%(2*d.A))+2*d.A)%(2*d.A);if(angle>d.A)angle=2*d.A-angle;
  x=radius*Math.cos(angle);y=radius*Math.sin(angle);
  const dx=x-d.cx,dy=y-d.cy,sq=dx*dx+dy*dy;
  if(sq>=d.r2-1e-13)return [x,y,count,true];
  const k=d.r2/sq;x=d.cx+dx*k;y=d.cy+dy*k;count++;
 }
 return [x,y,count,false];
}
export function kleinBarycentric(x,y,d){const factor=2/(1+x*x+y*y),v=y*factor/d.by,u=(x*factor-v*d.bx)/d.kx;return [1-u-v,u,v];}
export function diskTranslate(x,y,ax,ay){
 // (z+a)/(1+conjugate(a)*z), an automorphism of the unit disk.
 const dr=1+ax*x+ay*y,di=ax*y-ay*x,nr=x+ax,ni=y+ay,q=dr*dr+di*di;
 return [(nr*dr+ni*di)/q,(ni*dr-nr*di)/q];
}
export function stripToDisk(x,y){const den=Math.cosh(Math.PI*x/2)+Math.cos(Math.PI*y/2);return [Math.sinh(Math.PI*x/2)/den,Math.sin(Math.PI*y/2)/den];}
function mipPyramid(a,w,h){const levels=[{a,w,h}];while(w>1||h>1){const W=Math.max(1,Math.ceil(w/2)),H=Math.max(1,Math.ceil(h/2)),b=new Uint8ClampedArray(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let c=0;c<4;c++){let sum=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)sum+=a[(Math.min(h-1,2*y+dy)*w+Math.min(w-1,2*x+dx))*4+c];b[(y*W+x)*4+c]=sum/4;}levels.push({a:b,w:W,h:H});a=b;w=W;h=H;}return levels;}
export function hyperbolic(a,w,h,p){
 const d=triangleDomain(p.order,p.junction,4),levels=mipPyramid(a,w,h),out=new Uint8ClampedArray(a.length),size=Math.min(w,h),angle=p.angle*Math.PI/180,ca=Math.cos(angle),sa=Math.sin(angle),zoom=p.zoom/100;
 const offset=p.travel/100*.86,az=hash(2,7,p.seed)*Math.PI*2,ax=Math.cos(az)*offset,ay=Math.sin(az)*offset,sourceAngle=(hash(11,3,p.seed)-.5)*.6;
 const uv=(x,y)=>{
  let X=(x-w/2)/size*2/zoom,Y=(y-h/2)/size*2/zoom;[X,Y]=[X*ca-Y*sa,X*sa+Y*ca];
  if(p.space===2){[X,Y]=stripToDisk(X,Math.tanh(Y*.75)*.998);}
  else if(p.space===3){const radius=Math.max(1e-5,Math.hypot(X,Y));[X,Y]=stripToDisk(Math.log(radius)*1.3,Math.atan2(Y,X)/Math.PI*.998);}
  else {const radius=Math.hypot(X,Y);if(radius>=1)return null;}
  [X,Y]=diskTranslate(X,Y,ax,ay);if(X*X+Y*Y>=.9999999)return null;
  const [fx,fy,,ok]=foldTriangle(X,Y,d);if(!ok)return null;
  const [b0,b1,b2]=kleinBarycentric(fx,fy,d);
  // A photo triangle rather than the paper's purpose-drawn creature templates.
  let u=b1+.5*b0-.5,v=b0-.5;
  const co=Math.cos(sourceAngle),si=Math.sin(sourceAngle),s=p.crop/100;
  return [(clamp((u*co-v*si)*s+.5,0,1))*(w-1),(clamp((u*si+v*co)*s+.4,0,1))*(h-1)];
 };
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,q=uv(x+.5,y+.5);
  if(!q){out[i]=out[i+1]=out[i+2]=p.paper*2.55;out[i+3]=255;continue;}
  const qx=uv(x+1.0,y+.5)||q,qy=uv(x+.5,y+1.0)||q;
  const footprint=Math.max(1,2*Math.hypot(qx[0]-q[0],qx[1]-q[1]),2*Math.hypot(qy[0]-q[0],qy[1]-q[1]));
  const lod=clamp(Math.log2(footprint),0,levels.length-1),lo=Math.floor(lod),hi=Math.min(levels.length-1,lo+1),f=lod-lo,L=levels[lo],R=levels[hi];
  for(let c=0;c<3;c++){const read=m=>sample(m.a,m.w,m.h,(q[0]+.5)*m.w/w-.5,(q[1]+.5)*m.h/h-.5,c);out[i+c]=read(L)*(1-f)+read(R)*f;}out[i+3]=255;
 }
 return out;
}
