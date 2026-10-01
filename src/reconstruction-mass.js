import {grid,at,expand,blur} from './research-math.js';
import {hash,clamp} from './pixels.js';

// Clamp the landing position before splatting: no mass escapes at the borders.
export function transport(planes,vx,vy,w,h){
 const out=planes.map(()=>new Float32Array(w*h));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,tx=clamp(x+vx[i],0,w-1),ty=clamp(y+vy[i],0,h-1),ix=Math.floor(tx),iy=Math.floor(ty),jx=Math.min(ix+1,w-1),jy=Math.min(iy+1,h-1),fx=tx-ix,fy=ty-iy;
  for(let c=0;c<planes.length;c++){const v=planes[c][i],o=out[c];o[iy*w+ix]+=v*(1-fx)*(1-fy);o[iy*w+jx]+=v*fx*(1-fy);o[jy*w+ix]+=v*(1-fx)*fy;o[jy*w+jx]+=v*fx*fy;}
 }return out;
}

export function diffuseMass(a,w,h,rate=.18){
 const out=a.slice();
 const exchange=(i,j)=>{const flux=(a[j]-a[i])*rate;out[i]+=flux;out[j]-=flux;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x+1<w)exchange(i,i+1);if(y+1<h)exchange(i,i+w);}
 return out;
}

function cubic(a,b,c,d,t){return b+.5*t*(c-a+t*(2*a-5*b+4*c-d+t*(3*(b-c)+d-a)));}
function smoothSample(a,w,h,x,y){
 const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,row=[];
 for(let j=-1;j<=2;j++){const base=clamp(iy+j,0,h-1)*w;row.push(cubic(a[base+clamp(ix-1,0,w-1)],a[base+clamp(ix,0,w-1)],a[base+clamp(ix+1,0,w-1)],a[base+clamp(ix+2,0,w-1)],fx));}
 return Math.max(0,cubic(...row,fy));
}

export function massbloom(a,width,height,p){
 if(!p.time)return a.slice();
 const g=grid(a,width,height,320),{w,h,rgb,l}=g,n=w*h,affinity=new Float32Array(n),vx=affinity.slice(),vy=affinity.slice();
 let density=Float32Array.from(l,(v,i)=>.12+v*.95+hash(i%w,Math.floor(i/w),p.seed)*.045),planes=[density,...rgb.map(v=>Float32Array.from(v,(c,i)=>c*density[i]))];
 const rings=[];
 for(let k=0;k<12;k++){const theta=k/12*Math.PI*2;rings.push([Math.cos(theta)*p.scale,Math.sin(theta)*p.scale]);}
 for(let t=0;t<p.time;t++){
  density=planes[0];const smooth=blur(density,w,h,2);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   let near=0,far=0;for(const [dx,dy] of rings){near+=at(smooth,w,h,x+dx*.48,y+dy*.48);far+=at(smooth,w,h,x+dx,y+dy);}
   near/=12;far/=12;const i=y*w+x,mu=.2+p.affinity/250;
   affinity[i]=2*Math.exp(-(((near-mu)/.16)**2))-1+.4*(2*Math.exp(-(((far-mu*.8)/.23)**2))-1);
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const i=y*w+x,alpha=Math.min(1,(smooth[i]/1.8)**2),ux=(at(affinity,w,h,x+1,y)-at(affinity,w,h,x-1,y))*.5,uy=(at(affinity,w,h,x,y+1)-at(affinity,w,h,x,y-1))*.5,dx=(at(smooth,w,h,x+1,y)-at(smooth,w,h,x-1,y))*.5,dy=(at(smooth,w,h,x,y+1)-at(smooth,w,h,x,y-1))*.5;
   vx[i]=clamp(((1-alpha)*ux*4-alpha*dx*2)*.7,-1.2,1.2);vy[i]=clamp(((1-alpha)*uy*4-alpha*dy*2)*.7,-1.2,1.2);
  }
  planes=transport(planes,vx,vy,w,h).map(v=>diffuseMass(v,w,h));
 }
 // Reconstruct a smooth density surface before lighting, rather than magnifying a shaded 320px raster.
 density=planes[0];const factor=Math.min(1,1400/Math.max(width,height)),rw=Math.max(1,Math.round(width*factor)),rh=Math.max(1,Math.round(height*factor)),surface=new Float32Array(rw*rh),out=rgb.map(()=>new Float32Array(rw*rh));
 for(let y=0;y<rh;y++)for(let x=0;x<rw;x++)surface[y*rw+x]=smoothSample(density,w,h,(x+.5)*w/rw-.5,(y+.5)*h/rh-.5);
 for(let y=0;y<rh;y++)for(let x=0;x<rw;x++){
  const i=y*rw+x,gx=(x+.5)*w/rw-.5,gy=(y+.5)*h/rh-.5,m=surface[i],mass=at(density,w,h,gx,gy),bump=p.relief/100;
  const dx=(at(surface,rw,rh,x+1,y)-at(surface,rw,rh,x-1,y))*rw/w,dy=(at(surface,rw,rh,x,y+1)-at(surface,rw,rh,x,y-1))*rh/h,nx=-dx*bump*2,ny=-dy*bump*2,len=Math.hypot(nx,ny,1),light=Math.max(0,(nx*-.4+ny*-.5+.77)/len),half=Math.max(0,(nx*-.22+ny*-.28+.935)/len);
  const t=clamp((m-.12)/.3,0,1),coverage=t*t*(3-2*t),spec=half**34*bump*.6;
  for(let c=0;c<3;c++){const color=at(planes[c+1],w,h,gx,gy)/Math.max(1e-7,mass);out[c][i]=clamp((color*(.38+light*.85)+spec*Math.sqrt(color))*coverage,0,1);}
 }
 return expand(out,rw,rh,width,height);
}
