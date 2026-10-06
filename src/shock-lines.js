export const shockDefaults={time:24,scale:3,integration:10,follow:100,turn:0,bias:0,softness:25,amount:100};
// Three normalized box passes approximate the two Gaussian scales; all pixels stay native.
export function shockBox(a,w,h,r,tmp){
 if(!r)return a;const den=2*r+1;
 for(let y=0;y<h;y++){let sum=0;for(let k=-r;k<=r;k++)sum+=a[y*w+Math.max(0,Math.min(w-1,k))];for(let x=0;x<w;x++){tmp[y*w+x]=sum/den;sum+=a[y*w+Math.min(w-1,x+r+1)]-a[y*w+Math.max(0,x-r)];}}
 for(let x=0;x<w;x++){let sum=0;for(let k=-r;k<=r;k++)sum+=tmp[Math.max(0,Math.min(h-1,k))*w+x];for(let y=0;y<h;y++){a[y*w+x]=sum/den;sum+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x];}}return a;
}
export const shockRadius=sigma=>Math.max(0,Math.round((Math.sqrt(1+4*sigma*sigma)-1)/2));
export function shockGuide(a,w,h,p=shockDefaults){
 const n=w*h,xx=new Float32Array(n),yy=new Float32Array(n),xy=new Float32Array(n),v=new Float32Array(n),tmp=new Float32Array(n),result=new Float32Array(n),at=(x,y,c)=>a[(Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x)))*4+c]/255;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;for(let c=0;c<3;c++){
   const dx=(at(x+1,y-1,c)+2*at(x+1,y,c)+at(x+1,y+1,c)-at(x-1,y-1,c)-2*at(x-1,y,c)-at(x-1,y+1,c))/8;
   const dy=(at(x-1,y+1,c)+2*at(x,y+1,c)+at(x+1,y+1,c)-at(x-1,y-1,c)-2*at(x,y-1,c)-at(x+1,y-1,c))/8;
   xx[i]+=dx*dx;yy[i]+=dy*dy;xy[i]+=dx*dy;v[i]+=at(x,y,c)/3;
  }
 }
 const factor=Math.max(w,h)/1000,s=shockRadius(p.scale*factor),rho=shockRadius(p.integration*factor);
 for(let k=0;k<3;k++){shockBox(v,w,h,s,tmp);shockBox(xx,w,h,rho,tmp);shockBox(yy,w,h,rho,tmp);shockBox(xy,w,h,rho,tmp);}
 const get=(x,y)=>v[Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x))],turn=p.turn*Math.PI/180;let average=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,angle=.5*Math.atan2(2*xy[i],xx[i]-yy[i])+turn,c=Math.cos(angle),s=Math.sin(angle),vxx=get(x-1,y)+get(x+1,y)-2*v[i],vyy=get(x,y-1)+get(x,y+1)-2*v[i],vxy=(get(x+1,y+1)-get(x+1,y-1)-get(x-1,y+1)+get(x-1,y-1))/4;
  result[i]=(vxx+vyy)*(1-p.follow/100)+(c*c*vxx+2*c*s*vxy+s*s*vyy)*p.follow/100;average+=Math.abs(result[i])/n;
 }
 const offset=average*p.bias/100*3,soft=average*p.softness/100;
 for(let i=0;i<n;i++){const q=result[i]-offset;result[i]=p.softness?Math.tanh(q/(soft+1e-20)):Math.sign(q);}return result;
}
// Explicit Godunov morphology. tau=.4; one shared curvature sign for RGB.
export function shockStep(rgb,sign,w,h,tau=.4,out=new Float32Array(rgb.length)){
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,dir=sign[i],l=(y*w+Math.max(0,x-1))*3,r=(y*w+Math.min(w-1,x+1))*3,u=(Math.max(0,y-1)*w+x)*3,d=(Math.min(h-1,y+1)*w+x)*3;
  for(let c=0;c<3;c++){const j=i*3+c,z=rgb[j],a=z-rgb[l+c],b=rgb[r+c]-z,e=z-rgb[u+c],f=rgb[d+c]-z;
   const dx=dir>=0?Math.max(a,0,-b):Math.max(-a,0,b),dy=dir>=0?Math.max(e,0,-f):Math.max(-e,0,f);
   out[j]=z-tau*dir*Math.sqrt(dx*dx+dy*dy);
  }
 }return out;
}
export function shockLines(a,w,h,p=shockDefaults){
 if(!p.time||!p.amount)return a.slice();const n=w*h,sign=shockGuide(a,w,h,p);let rgb=new Float32Array(n*3),next=new Float32Array(n*3);for(let i=0;i<n;i++)for(let c=0;c<3;c++)rgb[i*3+c]=a[i*4+c]/255;
 for(let k=0;k<p.time;k++){shockStep(rgb,sign,w,h,.4,next);[rgb,next]=[next,rgb];}
 const out=new Uint8ClampedArray(a.length),amount=p.amount/100;for(let i=0;i<n;i++){for(let c=0;c<3;c++)out[i*4+c]=a[i*4+c]+(rgb[i*3+c]*255-a[i*4+c])*amount;out[i*4+3]=255;}return out;
}
