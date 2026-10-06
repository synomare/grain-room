import {clamp,lum,sample} from './pixels.js';
import {gaussianBlur} from './research-math.js';
import {distanceTransform} from './field-distance.js';
export const edgeDefaults={threshold:55,smooth:40,reach:90,side:0,curve:100,shade:85,light:225,elevation:45,gloss:40,texture:1,pitch:26,ink:55,angle:30,paper:20};

// Every input pixel contributes to the analysis-cell mean. The photograph used
// for texture remains at input resolution; the ownership field is limited to 512.
export function edgeField(a,w,h,p){
 const ratio=Math.min(1,512/Math.max(w,h)),W=Math.max(1,Math.round(w*ratio)),H=Math.max(1,Math.round(h*ratio)),sum=new Float64Array(W*H),count=new Uint32Array(W*H);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=Math.min(H-1,Math.floor((y+.5)*H/h))*W+Math.min(W-1,Math.floor((x+.5)*W/w));sum[j]+=lum(a,(y*w+x)*4)/255;count[j]++;}
 const means=Float32Array.from(sum,(v,i)=>v/count[i]),field=gaussianBlur(means,W,H,p.smooth*Math.max(W,H)/1000),sorted=Array.from(field).sort((a,b)=>a-b),threshold=sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p.threshold/100))],mask=Uint8Array.from(field,v=>v>=threshold),total=mask.reduce((s,v)=>s+v,0);
 if(!total||total===mask.length)return{w:W,h:H,mask,empty:true};
 const outside=distanceTransform(Uint8Array.from(mask,v=>1-v),W,H),inside=distanceTransform(mask,W,H),unit=(w/W+h/H)/2,distance=Float32Array.from(mask,(v,i)=>(v?1:-1)*(Math.sqrt((v?outside:inside).distance[i])-.5)*unit),normalDistance=gaussianBlur(distance,W,H,2),nx=new Float32Array(W*H),ny=nx.slice();
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;nx[i]=(normalDistance[y*W+Math.min(W-1,x+1)]-normalDistance[y*W+Math.max(0,x-1)])*W/w;ny[i]=(normalDistance[Math.min(H-1,y+1)*W+x]-normalDistance[Math.max(0,y-1)*W+x])*H/h;}
 return {w:W,h:H,mask,distance,nx,ny,unit,means,threshold,empty:false};
}

export function edgeGeometry(distance,radius){
 const t=clamp(distance/radius,0,1),s=1-t,z=Math.sqrt(Math.max(0,1-s*s));
 return {arc:2*radius/Math.PI*Math.acos(s),s,z};
}

export function edgeFrame(g,x,y,w,h,side){
 const gx=(x+.5)*g.w/w-.5,gy=(y+.5)*g.h/h-.5,sign=side?-1:1,d=sample(g.distance,g.w,g.h,gx,gy,0,1)*sign,dx=sample(g.nx,g.w,g.h,gx,gy,0,1)*sign,dy=sample(g.ny,g.w,g.h,gx,gy,0,1)*sign,n=Math.hypot(dx,dy);
 return{d,nx:n>1e-9?dx/n:0,ny:n>1e-9?dy/n:0,coverage:clamp(d+.5,0,1)};
}

export function edgeLight(frame,geometry,p){
 const a=p.light*Math.PI/180,e=p.elevation*Math.PI/180,lx=Math.cos(a)*Math.cos(e),ly=Math.sin(a)*Math.cos(e),lz=Math.sin(e),ambient=.25,diffuse=Math.max(0,(-frame.nx*lx-frame.ny*ly)*geometry.s+lz*geometry.z),shade=1+(p.shade/100)*((ambient+(1-ambient)*diffuse)/(ambient+(1-ambient)*lz)-1),den=Math.sqrt(2+2*lz),hx=lx/den,hy=ly/den,hz=(lz+1)/den,spec=Math.max(0,(-frame.nx*hx-frame.ny*hy)*geometry.s+hz*geometry.z)**32,horizon=Math.max(0,spec-hz**32);
 return{shade,highlight:horizon*p.gloss/100*150};
}

export function edgeTexture(x,y,longest,p){
 if(!p.texture||!p.ink)return 1;
 const size=longest*p.pitch/1000,a=p.angle*Math.PI/180,X=(x*Math.cos(a)+y*Math.sin(a))/size,Y=(-x*Math.sin(a)+y*Math.cos(a))/size,wave=p.texture===1?Math.cos(2*Math.PI*X):Math.cos(2*Math.PI*X)*Math.cos(2*Math.PI*Y),dark=(1-wave)/2;
 return 1-dark*p.ink/100;
}

export function edgeOwnership(a,w,h,params={}){
 const p={...edgeDefaults,...params},out=new Uint8ClampedArray(a),g=edgeField(a,w,h,p);if(g.empty||!p.reach)return out;
 const longest=Math.max(w,h),radius=longest*p.reach/1000;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const frame=edgeFrame(g,x,y,w,h,p.side);if(!frame.coverage)continue;
  const d=Math.max(0,frame.d),geom=edgeGeometry(d,radius),delta=d<radius?(geom.arc-d)*p.curve/100:0,sx=x+frame.nx*delta,sy=y+frame.ny*delta,lighting=edgeLight(frame,geom,p),texture=edgeTexture(sx,sy,longest,p),j=(y*w+x)*4;
  for(let k=0;k<3;k++){const source=sample(a,w,h,sx,sy,k),base=source+(236-source)*p.paper/100,value=base*lighting.shade*texture+lighting.highlight;out[j+k]=a[j+k]+(value-a[j+k])*frame.coverage;}
  out[j+3]=255;
 }
 return out;
}
