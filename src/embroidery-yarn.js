import {clamp} from './pixels.js';
const TAU=2*Math.PI;
export const threadPalette=[[238,236,220],[225,213,168],[216,156,164]];
export function quadraticThread(ax,ay,bx,by,bend=0){const dx=bx-ax,dy=by-ay,n=Math.hypot(dx,dy)||1;return [ax,ay,(ax+bx)/2-dy/n*bend,(ay+by)/2+dx/n*bend,bx,by];}
export function threadPolyline(q,scale=1){const length=Math.hypot(q[2]-q[0],q[3]-q[1])+Math.hypot(q[4]-q[2],q[5]-q[3]),n=Math.min(24,Math.max(1,Math.ceil(length/8))),points=[],segments=[];let distance=0;
 for(let i=0;i<=n;i++){const t=i/n,v=1-t;points.push([(v*v*q[0]+2*v*t*q[2]+t*t*q[4])*scale,(v*v*q[1]+2*v*t*q[3]+t*t*q[5])*scale]);}
 for(let i=1;i<points.length;i++){const [ax,ay]=points[i-1],[bx,by]=points[i],dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy);segments.push({ax,ay,dx,dy,len,den:len*len,offset:distance});distance+=len;}
 return {points,segments,length:distance};
}
export function nearestThread(x,y,path){let distance=Infinity,along=0,side=0,nx=0,ny=0;
 for(const s of path.segments){const t=s.den?clamp(((x-s.ax)*s.dx+(y-s.ay)*s.dy)/s.den,0,1):0,rx=x-s.ax-t*s.dx,ry=y-s.ay-t*s.dy,d=Math.hypot(rx,ry);if(d<distance){distance=d;along=s.offset+t*s.len;nx=s.len?-s.dy/s.len:1;ny=s.len?s.dx/s.len:0;side=rx*nx+ry*ny;}}
 return {distance,along,side,nx,ny};
}
// Each yarn is shaded and antialiased once per pixel, including its curved joins.
export function drawThread(out,w,h,q,width,colour,p,scale=1,phase=0){const path=threadPolyline(q,scale),radius=Math.max(.08,width*scale/2),relief=p.relief/100,light=p.light*Math.PI/180,lx=Math.cos(light),ly=Math.sin(light),shadow=relief*1.15*scale,edge=radius+shadow+1.5,minX=Math.max(0,Math.floor(Math.min(...path.points.map(v=>v[0]))-edge)),maxX=Math.min(w-1,Math.ceil(Math.max(...path.points.map(v=>v[0]))+edge)),minY=Math.max(0,Math.floor(Math.min(...path.points.map(v=>v[1]))-edge)),maxY=Math.min(h-1,Math.ceil(Math.max(...path.points.map(v=>v[1]))+edge));
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const i=(y*w+x)*4,X=x+.5,Y=y+.5,s=nearestThread(X+lx*shadow,Y+ly*shadow,path),sc=clamp(radius+.85*scale+.5-s.distance,0,1)*.21*relief;if(sc)for(let c=0;c<3;c++)out[i+c]*=1-sc;
  const v=nearestThread(X,Y,path),coverage=clamp(radius+.5-v.distance,0,1);if(!coverage)continue;const cross=clamp(v.side/radius,-1,1),z=Math.sqrt(Math.max(0,1-cross*cross)),lit=Math.max(0,(v.nx*lx+v.ny*ly)*cross*.65+z*.76),rib=Math.cos(TAU*v.along/(radius*3.2)+Math.asin(cross)*3+phase),resolved=clamp(radius-.35,0,1),gain=1+relief*((lit-.65)*.62+rib*.17*resolved),shine=relief*Math.max(0,lit-.78)*.22;
  for(let c=0;c<3;c++){const target=colour[c]*gain+(255-colour[c])*shine;out[i+c]+=(target-out[i+c])*coverage;}
 }
}
export function clothShade(x,y,scale){const pitch=3.5*scale,u=x/pitch,v=y/pitch,cu=.5+.5*Math.cos(TAU*u),cv=.5+.5*Math.cos(TAU*v),top=(Math.floor(u)+Math.floor(v))%2?cu:cv,visibility=clamp(pitch-1,0,1);return 1+visibility*(-.12+.13*top+.035*Math.min(cu,cv)-.16*(1-cu)*(1-cv));}
