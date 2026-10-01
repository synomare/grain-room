import {clamp,sample,hash} from './pixels.js';
import {grid,at,blur} from './research-math.js';
const TAU=2*Math.PI;
// Fourier nodal approximations, not exact minimal surfaces or signed distances.
export function tpms(x,y,z,morph=0){
 const sx=Math.sin(x),sy=Math.sin(y),sz=Math.sin(z),cx=Math.cos(x),cy=Math.cos(y),cz=Math.cos(z);
 const fields=[sx*cy+sy*cz+sz*cx,sx*sy*sz+sx*cy*cz+cx*sy*cz+cx*cy*sz,cx+cy+cz];
 const k=Math.min(1,Math.floor(morph)),t=morph-k;return fields[k]*(1-t)+fields[k+1]*t;
}
export function firstSurface(fn,near,far,step=.12,lipschitz=8){
 let z=near,v=fn(z);if(v<=0)return z;
 for(let k=0;k<512&&z<far;k++){if(v<.0001)return z;const next=Math.min(far,z+Math.min(step,v/lipschitz*.9)),q=fn(next);if(q<=0){let lo=z,hi=next;for(let j=0;j<7;j++){const mid=(lo+hi)/2;if(fn(mid)>0)lo=mid;else hi=mid;}return (lo+hi)/2;}z=next;v=q;}return null;
}
export function porous(a,w,h,p){
 const g=grid(a,w,h,384),photo=blur(blur(g.l,g.w,g.h,5),g.w,g.h,5),colors=g.rgb.map(v=>blur(blur(v,g.w,g.h,9),g.w,g.h,9));
 const sorted=photo.slice().sort(),lo=sorted[Math.floor(sorted.length*.03)],hi=sorted[Math.floor(sorted.length*.97)],range=Math.max(.1,hi-lo);
 const out=new Uint8ClampedArray(a.length),span=Math.max(w,h),freq=TAU*p.cells,ang=p.angle*Math.PI/180,ca=Math.cos(ang),sa=Math.sin(ang),phase=hash(21,63,p.seed)*TAU,tilt=p.tilt/100,thick=.08+p.wall/100*.75,depth=p.depth/100*TAU,cut=p.cut/100;
 const light=p.light*Math.PI/180,lx=Math.cos(light)*.65,ly=Math.sin(light)*.65,lz=.76,morph=p.morph/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,X=(x+.5)*g.w/w-.5,Y=(y+.5)*g.h/h-.5,l=at(photo,g.w,g.h,X,Y),u=(x-w/2)/span,v=(y-h/2)/span;
  const gx=at(photo,g.w,g.h,X+1,Y)-at(photo,g.w,g.h,X-1,Y),gy=at(photo,g.w,g.h,X,Y+1)-at(photo,g.w,g.h,X,Y-1);
  const xx=freq*(u*ca-v*sa)+p.warp/100*(l-.5)*5,yy=freq*(u*sa+v*ca)+p.warp/100*(gx-gy)*7,roof=cut*(1-clamp((l-lo)/range,0,1))*TAU*1.5,far=depth;
  const f=(dx,dy,z)=>Math.abs(tpms(xx+dx+z*tilt*.65,yy+dy+z*tilt*.3,z+phase,morph))-thick;
  const z=roof<far?firstSurface(t=>f(0,0,t),roof,far):null;
  if(z===null){for(let c=0;c<3;c++)out[i+c]=p.paper*2.55;out[i+3]=255;continue;}
  const e=.025,front=z<=roof+1e-5;let nx=front?gx*cut*5:-(f(e,0,z)-f(-e,0,z)),ny=front?gy*cut*5:-(f(0,e,z)-f(0,-e,z)),nz=front?1:-(f(0,0,z+e)-f(0,0,z-e));
  const norm=Math.hypot(nx,ny,nz)||1;nx/=norm;ny/=norm;nz/=norm;if(nz<0){nx=-nx;ny=-ny;nz=-nz;}
  const diffuse=Math.max(0,nx*lx+ny*ly+nz*lz),spec=Math.pow(Math.max(0,nx*lx*.5+ny*ly*.5+nz*.94),24),shade=(.32+.75*diffuse)*Math.exp(-z*.10*p.shadow/100),relief=p.relief/100;
  const dx=z*tilt/freq*span*.65+p.shift/100*span*nx*.14,dy=z*tilt/freq*span*.3+p.shift/100*span*ny*.14;
  for(let c=0;c<3;c++){const smooth=at(colors[c],g.w,g.h,(x+dx)*g.w/w,(y+dy)*g.h/h)*255,detail=sample(a,w,h,x+dx,y+dy,c),color=smooth+(detail-smooth)*p.texture/100;out[i+c]=color*(1-relief+relief*shade)+spec*70*relief;}
  out[i+3]=255;
 }
 return out;
}
