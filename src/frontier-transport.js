import {clamp,sample} from './pixels.js';
import {grid,blur} from './research-math.js';

// Independent implementation of density and first-moment rectangle integrals.
export function momentTables(density,w,h){
 const stride=w+1,tables=[0,1,2].map(()=>new Float64Array((w+1)*(h+1)));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const v=density[y*w+x],i=(y+1)*stride+x+1,values=[v,v*(x+.5)/w,v*(y+.5)/h];
  for(let k=0;k<3;k++)tables[k][i]=values[k]+tables[k][i-1]+tables[k][i-stride]-tables[k][i-stride-1];
 }
 return {density,w,h,stride,tables};
}
export function momentCorner(T,x,y){
 const {w,h,stride,tables,density}=T,X=clamp(x,0,1)*w,Y=clamp(y,0,1)*h,i=Math.min(w-1,Math.floor(X)),j=Math.min(h-1,Math.floor(Y)),fx=X-i,fy=Y-j,q=j*stride+i;
 const result=tables.map(a=>a[q]*(1-fx)*(1-fy)+a[q+1]*fx*(1-fy)+a[q+stride]*(1-fx)*fy+a[q+stride+1]*fx*fy);
 const D=tables[0],rho=density[j*w+i],col=fx*(D[q+1]-D[q])+fx*fy*rho,row=fy*(D[q+stride]-D[q])+fx*fy*rho;
 // Within partial cells, the first moment is quadratic, not bilinear.
 result[1]+=col*(fx-1)/(2*w);result[2]+=row*(fy-1)/(2*h);return result;
}
export function momentRect(T,x0,y0,x1,y1){
 const a=momentCorner(T,x1,y1),b=momentCorner(T,x0,y1),c=momentCorner(T,x1,y0),d=momentCorner(T,x0,y0);
 return a.map((v,k)=>v-b[k]-c[k]+d[k]);
}
export function rectVelocity(T,x,y,t){
 if(t>=1-1e-10)return [0,0];
 x=clamp(x,1e-9,1-1e-9);y=clamp(y,1e-9,1-1e-9);
 const v=t<1e-9?momentCorner(T,1,1):momentRect(T,Math.max(0,(x+t-1)/t),Math.max(0,(y+t-1)/t),Math.min(1,x/t),Math.min(1,y/t));
 if(v[0]<1e-15)return [0,0];
 return [(v[1]/v[0]-x)/(1-t),(v[2]/v[0]-y)/(1-t)];
}
export function rectAdvect(T,x,y,steps=96){
 const dt=1/steps;
 for(let k=0;k<steps;k++){const t=k*dt,v=rectVelocity(T,x,y,t),m=rectVelocity(T,x+dt*v[0]/2,y+dt*v[1]/2,t+dt/2);x=clamp(x+dt*m[0],0,1);y=clamp(y+dt*m[1],0,1);}
 return [x,y];
}
export function transport(a,w,h,p){
 if(p.pull===0)return a.slice();
 const g=grid(a,w,h,224),l=blur(g.l,g.w,g.h,2);let lo=1,hi=0;for(const v of l){lo=Math.min(lo,v);hi=Math.max(hi,v);}
 const density=Float64Array.from(l,v=>.035+Math.pow((v-lo)/(hi-lo||1),p.focus/100)),T=momentTables(density,g.w,g.h);
 const nx=Math.max(2,Math.round(p.mesh*w/Math.max(w,h))),ny=Math.max(2,Math.round(p.mesh*h/Math.max(w,h))),vertices=[];
 for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
  const u=x/nx,v=y/ny,q=rectAdvect(T,u,v),amount=p.pull/100;
  vertices.push({x:(u+(q[0]-u)*amount)*(w-1),y:(v+(q[1]-v)*amount)*(h-1),u,v});
 }
 const out=new Uint8ClampedArray(a.length),paper=p.paper/100;
 for(let i=0;i<out.length;i+=4){for(let c=0;c<3;c++)out[i+c]=255*paper*(c===2?.95:1);out[i+3]=255;}
 function triangle(A,B,C){
  const det=(B.y-C.y)*(A.x-C.x)+(C.x-B.x)*(A.y-C.y);if(Math.abs(det)<1e-9)return;
  const minX=Math.max(0,Math.floor(Math.min(A.x,B.x,C.x))),maxX=Math.min(w-1,Math.ceil(Math.max(A.x,B.x,C.x))),minY=Math.max(0,Math.floor(Math.min(A.y,B.y,C.y))),maxY=Math.min(h-1,Math.ceil(Math.max(A.y,B.y,C.y)));
  const border=p.open/100*.22;
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   const aa=((B.y-C.y)*(x-C.x)+(C.x-B.x)*(y-C.y))/det,bb=((C.y-A.y)*(x-C.x)+(A.x-C.x)*(y-C.y))/det,cc=1-aa-bb;
   if(aa< -1e-8||bb< -1e-8||cc< -1e-8)continue;
   const u=aa*A.u+bb*B.u+cc*C.u,v=aa*A.v+bb*B.v+cc*C.v,fu=u*nx-Math.floor(u*nx),fv=v*ny-Math.floor(v*ny),edge=Math.min(fu,1-fu,fv,1-fv),coverage=p.open===0?1:clamp((edge-border)*Math.max(w/nx,h/ny),0,1);
   const bulge=Math.pow(Math.max(0,Math.sin(Math.PI*fu)*Math.sin(Math.PI*fv)),.25),shine=p.relief/100,shade=1-shine*.5+shine*bulge*.65,spec=shine*Math.pow(bulge,12)*.12,i=(y*w+x)*4;
   for(let c=0;c<3;c++){const value=sample(a,w,h,u*(w-1),v*(h-1),c)*shade+spec*255,bg=paper*255*(c===2?.95:1);out[i+c]=bg+(value-bg)*coverage;}
  }
 }
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=y*(nx+1)+x,A=vertices[i],B=vertices[i+1],C=vertices[i+nx+1],D=vertices[i+nx+2];triangle(A,B,D);triangle(A,D,C);}
 return out;
}
