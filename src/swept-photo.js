import{sample,hash}from'./pixels.js';
import{rasterRender}from'./raster-relief.js';
export const sweptPhotoDefaults={spacing:5,band:68,hold:36,length:190,curl:235,spread:38,twist:55,detail:65,tilt:24,turn:-8,size:93,light:55,paper:97,lift:0,seed:17};
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)),smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export function photoStripPaths(a,w,h,p){const E=Math.max(w,h),period=Math.max(1,E*p.spacing/1000),rows=Math.ceil(h/period),steps=Math.max(80,Math.min(720,Math.ceil(w/2))),paths=[];
 for(let row=0;row<rows;row++){
  const lo=row*period,hi=Math.min(h,lo+period),v=(lo+hi)/2/h,signal=[];let avg=0;
  for(let k=0;k<=32;k++){const c=[0,1,2].map(c=>sample(a,w,h,k*w/32,(lo+hi)/2,c)),l=(c[0]*.2126+c[1]*.7152+c[2]*.0722)/255;signal.push(l);avg+=l/33;}
  const start=clamp(p.hold/100+(avg-.5)*.16*p.detail/100,0,.85),rand=hash(row,6,p.seed)-.5,points=[];let X=0,Y=v*h,Z=0;
  for(let k=0;k<=steps;k++){
   const u=k/steps,t=clamp((u-start)/(1-start)),ease=smooth(t),cell=Math.min(31,Math.floor(u*32)),f=u*32-cell,s=signal[cell]*(1-f)+signal[cell+1]*f,bend=(p.curl*Math.PI/180)*ease,fan=(v-.5)*p.spread/100*2.5+(avg-.5)*p.detail/100*.8+rand*.12*p.detail/100,az=bend+fan*ease,el=(Math.sin(t*Math.PI)*.35+Math.sin(t*Math.PI*2+v*6)*.16)*p.twist/100,tx=Math.cos(az)*Math.cos(el),ty=Math.sin(az)*Math.cos(el),tz=Math.sin(el),length=w/steps*(1+(p.length/100-1)*ease);
   if(k){X+=tx*length;Y+=ty*length;Z+=tz*length;}
   const roll=p.twist/100*Math.PI*2*ease+(s-.5)*p.detail/100*.5*ease,strip=(hi-lo)*(1+(p.band/100-1)*ease),nx=-Math.sin(az)*Math.cos(roll)-Math.cos(az)*Math.sin(el)*Math.sin(roll),ny=Math.cos(az)*Math.cos(roll)-Math.sin(az)*Math.sin(el)*Math.sin(roll),nz=Math.cos(el)*Math.sin(roll),normal=[ty*nz-tz*ny,tz*nx-tx*nz,tx*ny-ty*nx],len=Math.hypot(...normal)||1;
   points.push({x:X,y:Y,z:Z,u:u*w-.5,lo:lo-.5,hi:hi-.5,nx,ny,nz,strip,normal:normal.map(v=>v/len),t});
  }
  paths.push(points);
 }
 return{paths,rows,steps,period};
}
export function photoStripMesh(a,w,h,p){const data=photoStripPaths(a,w,h,p),vertices=new Float32Array(data.rows*(data.steps+1)*2*6),indices=new Uint32Array(data.rows*data.steps*6),rad=p.turn*Math.PI/180,ca=Math.cos(rad),sa=Math.sin(rad),tilt=p.tilt*Math.PI/180,cb=Math.cos(tilt),sb=Math.sin(tilt);let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,j=0,k=0;
 for(let row=0;row<data.rows;row++){for(const q of data.paths[row])for(let side=0;side<2;side++){
  const off=(side-.5)*q.strip,x=q.x+q.nx*off-w/2,y=q.y+q.ny*off-h/2,z=q.z+q.nz*off,X=x*ca-y*sa,Y=(x*sa+y*ca)*cb-z*sb,Z=(x*sa+y*ca)*sb+z*cb,n=q.normal,nx=n[0]*ca-n[1]*sa,ny=(n[0]*sa+n[1]*ca)*cb-n[2]*sb,nz=(n[0]*sa+n[1]*ca)*sb+n[2]*cb,shine=Math.abs(nx*-.25+ny*-.45+nz*.857),rest=Math.abs(sb*.45+cb*.857),shade=1+p.light/100*((shine-rest)*.75+Math.max(0,shine-.95)*.35);
  vertices.set([X,Y,Z,q.u,side?q.hi:q.lo,shade],j);j+=6;minX=Math.min(minX,X);maxX=Math.max(maxX,X);minY=Math.min(minY,Y);maxY=Math.max(maxY,Y);
 }
 for(let col=0;col<data.steps;col++){const A=(row*(data.steps+1)+col)*2,B=A+2,C=A+1,D=B+1;indices.set([A,B,C,B,D,C],k);k+=6;}}
 const scale=Math.min(w/Math.max(1,maxX-minX),h/Math.max(1,maxY-minY))*p.size/100,cx=(maxX+minX)/2,cy=(maxY+minY)/2;for(let i=0;i<vertices.length;i+=6){vertices[i]=(vertices[i]-cx)*scale+w/2;vertices[i+1]=(vertices[i+1]-cy)*scale+h/2;}
 return{vertices,indices,stride:6,rows:data.rows,steps:data.steps,period:data.period,scale};
}
export function sweptPhoto(a,w,h,params={}){const p={...sweptPhotoDefaults,...params};const m=photoStripMesh(a,w,h,p),samples=m.period*m.scale*p.band/100<1.2?8:4;return rasterRender(a,w,h,m,p,{samples});}
