import {sample,clamp,lum} from './pixels.js';
import {nativeGaussian} from './hybrid-image.js';
export const rasterDefaults={spacing:7,band:45,height:36,smooth:5,gamma:110,reverse:0,tilt:32,turn:-8,direction:0,size:94,light:20,paper:7,lift:15};
// Heights are derived on the native pixel grid; no reduced analysis canvas.
export function rasterHeight(a,w,h,p){const f=Float32Array.from({length:w*h},(_,j)=>lum(a,j*4)/255);nativeGaussian(f,new Float32Array(f.length),w,h,p.smooth*Math.max(w,h)/1000);const scale=p.height*Math.min(w,h)/100;for(let j=0;j<f.length;j++)f[j]=(Math.pow(clamp(f[j],0,1),p.gamma/100)-.5)*scale*(p.reverse?-1:1);return f;}
export function rasterProjection(x,y,z,w,h,p){const a=p.turn*Math.PI/180,b=p.tilt*Math.PI/180,xx=x-w/2,yy=y-h/2,X=xx*Math.cos(a)-yy*Math.sin(a),Y=xx*Math.sin(a)+yy*Math.cos(a);return [X,Y*Math.cos(b)-z*Math.sin(b),Y*Math.sin(b)+z*Math.cos(b)];}
// Two-pixel longitudinal geometry retains native bilinear photo texture.
export function rasterMesh(field,w,h,p){
 const cross=p.direction?w:h,along=p.direction?h:w,period=Math.max(1,p.spacing*Math.max(w,h)/1000),rows=Math.ceil(cross/period),nx=Math.max(1,Math.ceil(along/2)),stride=6,v=new Float32Array(rows*(nx+1)*2*stride);let k=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
 const a=p.turn*Math.PI/180,b=p.tilt*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
 for(let row=0;row<rows;row++){const lo=row*period,hi=Math.min(cross,lo+period),middle=(lo+hi)/2,width=(hi-lo)*p.band/100;
  for(let side=0;side<2;side++)for(let col=0;col<=nx;col++){
   const t=col/nx*along,s=middle+(side-.5)*width,u=p.direction?s:t,yy=p.direction?t:s,z=sample(field,w,h,u-.5,yy-.5,0,1),dx=(sample(field,w,h,u+.5,yy-.5,0,1)-sample(field,w,h,u-1.5,yy-.5,0,1))/2,dy=(sample(field,w,h,u-.5,yy+.5,0,1)-sample(field,w,h,u-.5,yy-1.5,0,1))/2;
   const n=Math.hypot(dx,dy,1),nx0=-dx/n,ny0=-dy/n,nz0=1/n,nx1=nx0*ca-ny0*sa,ny1=(nx0*sa+ny0*ca)*cb-nz0*sb,nz1=(nx0*sa+ny0*ca)*sb+nz0*cb,shade=1+p.light/100*(Math.abs(nx1*-.3+ny1*-.4+nz1*.8660254)-.5)*.8;
   const [X,Y,Z]=rasterProjection(u,yy,z,w,h,p);v[k++]=X;v[k++]=Y;v[k++]=Z;v[k++]=u-.5;v[k++]=yy-.5;v[k++]=shade;minX=Math.min(minX,X);maxX=Math.max(maxX,X);minY=Math.min(minY,Y);maxY=Math.max(maxY,Y);
  }
 }
 const scale=Math.min(w/Math.max(1e-6,maxX-minX),h/Math.max(1e-6,maxY-minY))*p.size/100,cx=(minX+maxX)/2,cy=(minY+maxY)/2;
 for(let j=0;j<v.length;j+=stride){v[j]=(v[j]-cx)*scale+w/2;v[j+1]=(v[j+1]-cy)*scale+h/2;}
 const indices=new Uint32Array(rows*nx*6);k=0;for(let row=0;row<rows;row++)for(let col=0;col<nx;col++){const A=row*(nx+1)*2+col,B=A+1,C=A+nx+1,D=C+1;indices[k++]=A;indices[k++]=B;indices[k++]=C;indices[k++]=B;indices[k++]=D;indices[k++]=C;}
 return{vertices:v,indices,stride,rows,nx,period,scale};
}
// Tile-local four-sample coverage and depth avoid a full-image supersampled buffer.
export function rasterRender(a,w,h,mesh,p,{tile=96,samples=2}={}){
 const {vertices:v,indices:ix,stride}=mesh,out=new Uint8ClampedArray(w*h*4),paper=p.paper*2.55;for(let i=0;i<out.length;i+=4){out[i]=out[i+1]=out[i+2]=paper;out[i+3]=255;}
 const cols=Math.ceil(w/tile),bins=new Map();
 for(let t=0;t<ix.length;t+=3){const A=ix[t]*stride,B=ix[t+1]*stride,C=ix[t+2]*stride,minX=Math.max(0,Math.floor(Math.min(v[A],v[B],v[C]))),maxX=Math.min(w-1,Math.ceil(Math.max(v[A],v[B],v[C]))-1),minY=Math.max(0,Math.floor(Math.min(v[A+1],v[B+1],v[C+1]))),maxY=Math.min(h-1,Math.ceil(Math.max(v[A+1],v[B+1],v[C+1]))-1);if(minX>maxX||minY>maxY)continue;
  for(let ty=Math.floor(minY/tile);ty<=Math.floor(maxY/tile);ty++)for(let tx=Math.floor(minX/tile);tx<=Math.floor(maxX/tile);tx++){const key=ty*cols+tx;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(t);}
 }
 for(const[key,triangles]of bins){const x0=(key%cols)*tile,y0=Math.floor(key/cols)*tile,tw=Math.min(tile,w-x0),th=Math.min(tile,h-y0),sw=tw*samples,sh=th*samples,depth=new Float32Array(sw*sh).fill(-Infinity),rgb=new Float32Array(sw*sh*3).fill(paper);
  for(const t of triangles){const A=ix[t]*stride,B=ix[t+1]*stride,C=ix[t+2]*stride,ax=v[A],ay=v[A+1],bx=v[B],by=v[B+1],cx=v[C],cy=v[C+1],den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<1e-8)continue;
   const minX=Math.max(0,Math.floor((Math.min(ax,bx,cx)-x0)*samples)),maxX=Math.min(sw-1,Math.ceil((Math.max(ax,bx,cx)-x0)*samples)-1),minY=Math.max(0,Math.floor((Math.min(ay,by,cy)-y0)*samples)),maxY=Math.min(sh-1,Math.ceil((Math.max(ay,by,cy)-y0)*samples)-1);
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const px=x0+(x+.5)/samples,py=y0+(y+.5)/samples,u=((by-cy)*(px-cx)+(cx-bx)*(py-cy))/den,zv=((cy-ay)*(px-cx)+(ax-cx)*(py-cy))/den,k=1-u-zv;if(u<-1e-7||zv<-1e-7||k<-1e-7)continue;const z=u*v[A+2]+zv*v[B+2]+k*v[C+2],j=y*sw+x;if(z<=depth[j])continue;depth[j]=z;
    const sx=clamp(u*v[A+3]+zv*v[B+3]+k*v[C+3],0,w-1),sy=clamp(u*v[A+4]+zv*v[B+4]+k*v[C+4],0,h-1),xx=Math.floor(sx),yy=Math.floor(sy),fx=sx-xx,fy=sy-yy,J=(yy*w+xx)*4,K=(yy*w+Math.min(w-1,xx+1))*4,L=(Math.min(h-1,yy+1)*w+xx)*4,M=(Math.min(h-1,yy+1)*w+Math.min(w-1,xx+1))*4,shade=u*v[A+5]+zv*v[B+5]+k*v[C+5];
    for(let c=0;c<3;c++){const colour=(a[J+c]*(1-fx)+a[K+c]*fx)*(1-fy)+(a[L+c]*(1-fx)+a[M+c]*fx)*fy;rgb[j*3+c]=(colour+(255-colour)*p.lift/100)*shade;}
   }
  }
  for(let y=0;y<th;y++)for(let x=0;x<tw;x++){const i=((y+y0)*w+x+x0)*4;for(let c=0;c<3;c++){let sum=0;for(let yy=0;yy<samples;yy++)for(let xx=0;xx<samples;xx++)sum+=clamp(rgb[((y*samples+yy)*sw+x*samples+xx)*3+c]);out[i+c]=sum/(samples*samples);}}
 }
 return out;
}
export function rasterRelief(a,w,h,p={}){const q={...rasterDefaults,...p};return rasterRender(a,w,h,rasterMesh(rasterHeight(a,w,h,q),w,h,q),q);}
