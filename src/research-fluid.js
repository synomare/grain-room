import {hash,sample} from './pixels.js';
import {grid,at} from './research-math.js';
// Cell-centered stable-fluid projection. The pressure solve uses reflective walls.
export function divergence(u,v,w,h){
 const d=new Float32Array(w*h);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;d[i]=.5*(u[i+1]-u[i-1]+v[i+w]-v[i-w]);}
 return d;
}
export function project(u,v,w,h,iterations=28){
 if(w<3||h<3)return;
 const d=divergence(u,v,w,h);let p=new Float32Array(w*h),q=p.slice();
 for(let k=0;k<iterations;k++){
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;q[i]=(p[i-1]+p[i+1]+p[i-w]+p[i+w]-d[i])*.25;}
  for(let x=0;x<w;x++){q[x]=q[w+x];q[(h-1)*w+x]=q[(h-2)*w+x];}
  for(let y=0;y<h;y++){q[y*w]=q[y*w+1];q[y*w+w-1]=q[y*w+w-2];}
  [p,q]=[q,p];
 }
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;u[i]-=.5*(p[i+1]-p[i-1]);v[i]-=.5*(p[i+w]-p[i-w]);}
 for(let x=0;x<w;x++){v[x]=0;v[(h-1)*w+x]=0;}
 for(let y=0;y<h;y++){u[y*w]=0;u[y*w+w-1]=0;}
}
export function fluid(a,w,h,p){
 if(!p.force||w<3||h<3)return a.slice();
 const g=grid(a,w,h,192),W=g.w,H=g.h,n=W*H,s=Math.max(W,H);
 let u=new Float32Array(n),v=u.slice(),mx=u.slice(),my=u.slice();
 const vortices=Array.from({length:p.vortices},(_,k)=>({x:hash(k,2,p.seed)*W,y:hash(k,3,p.seed)*H,r:s*(.1+.18*hash(k,4,p.seed)),spin:hash(k,5,p.seed)>.5?1:-1}));
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x;mx[i]=x;my[i]=y;
  for(const q of vortices){const dx=(x-q.x)/q.r,dy=(y-q.y)/q.r,f=Math.exp(-(dx*dx+dy*dy)*1.5)*q.spin*p.force/45;u[i]+=-dy*f;v[i]+=dx*f;}
 }
 project(u,v,W,H,40);
 for(let t=0;t<p.time;t++){
  const nu=new Float32Array(n),nv=nu.slice(),nx=nu.slice(),ny=nu.slice();
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,bx=x-u[i],by=y-v[i];nu[i]=at(u,W,H,bx,by)*.997;nv[i]=at(v,W,H,bx,by)*.997;}
  project(nu,nv,W,H,16);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,bx=x-nu[i],by=y-nv[i];nx[i]=at(mx,W,H,bx,by);ny[i]=at(my,W,H,bx,by);}
  u=nu;v=nv;mx=nx;my=ny;
 }
 const out=new Uint8ClampedArray(a.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,gx=(x+.5)*W/w-.5,gy=(y+.5)*H/h-.5,sx=(at(mx,W,H,gx,gy)+.5)*w/W-.5,sy=(at(my,W,H,gx,gy)+.5)*h/H-.5;for(let c=0;c<3;c++)out[i+c]=sample(a,w,h,sx,sy,c);out[i+3]=255;}
 return out;
}
