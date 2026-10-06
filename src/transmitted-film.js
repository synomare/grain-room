import{clamp,hash}from'./pixels.js';import{toLinear,toEncoded}from'./speckle-field.js';
export const filmDefaults={cells:5,scale:165,scatter:35,turn:35,shape:1,density:90,clear:2,exposure:100,negative:1,edge:2,readout:0,seed:17};
export function filmDensityTable(p){return Float64Array.from({length:256},(_,i)=>{const v=toLinear(i/255),t=p.clear/100+(1-p.clear/100)*(p.negative?1-v:v);return -Math.log(clamp(t,1e-6,1))*p.density/100;});}
// Native per-channel optical density is interpolated before the exponential.
export function filmDensity(a,w,h,p){const table=filmDensityTable(p),field=new Float32Array(w*h*3);for(let j=0;j<w*h;j++)for(let c=0;c<3;c++)field[j*3+c]=table[a[j*4+c]];return field;}
export function filmPlan(w,h,p){const step=Math.max(w,h)/p.cells,nx=Math.max(1,Math.ceil(w/step)),ny=Math.max(1,Math.ceil(h/step)),cw=w/nx,ch=h/ny,parts=[];
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const cx=(x+.5)*cw,cy=(y+.5)*ch,a=(hash(x,y,p.seed)*2-1)*p.turn*Math.PI/180,scale=p.scale/100,dx=(hash(x+13,y,p.seed)*2-1)*cw*p.scatter/100,dy=(hash(x,y+29,p.seed)*2-1)*ch*p.scatter/100,c=Math.cos(a),s=Math.sin(a),rx=cw*scale/2,ry=ch*scale/2,support=1+p.edge/200,ex=(Math.abs(c)*rx+Math.abs(s)*ry)*support,ey=(Math.abs(s)*rx+Math.abs(c)*ry)*support;parts.push({cx,cy,x:cx+dx,y:cy+dy,c,s,scale,rx,ry,cw,ch,bounds:[cx+dx-ex,cy+dy-ey,cx+dx+ex,cy+dy+ey]});}return parts;
}
export function filmMapping(x,y,part){const dx=x-part.x,dy=y-part.y;return{x:part.cx+(dx*part.c+dy*part.s)/part.scale-.5,y:part.cy+(-dx*part.s+dy*part.c)/part.scale-.5,u:(dx*part.c+dy*part.s)/part.rx,v:(-dx*part.s+dy*part.c)/part.ry};}
export function filmThickness(u,v,p){const r=p.shape===1?Math.hypot(u,v):p.shape===2?Math.abs(u)+Math.abs(v):Math.max(Math.abs(u),Math.abs(v)),soft=p.edge/100;return soft?clamp((1-r)/soft+.5,0,1):r<=1?1:0;}
export function filmReadout(depth,p){const light=clamp(Math.exp(-depth)*p.exposure/100,0,1);return p.readout?1-light:light;}
// Sum thicknesses per ray, then expose and average four samples per pixel.
export function filmRender(field,w,h,parts,p,{tile=96,samples=2}={}){
 const out=new Uint8ClampedArray(w*h*4),cols=Math.ceil(w/tile),bins=new Map(),base=toEncoded(filmReadout(0,p))*255;for(let i=0;i<out.length;i+=4){out[i]=out[i+1]=out[i+2]=base;out[i+3]=255;}
 for(let n=0;n<parts.length;n++){const[x0,y0,x1,y1]=parts[n].bounds;for(let ty=Math.max(0,Math.floor(y0/tile));ty<=Math.min(Math.ceil(h/tile)-1,Math.floor(y1/tile));ty++)for(let tx=Math.max(0,Math.floor(x0/tile));tx<=Math.min(cols-1,Math.floor(x1/tile));tx++){const key=ty*cols+tx;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(n);}}
 for(const[key,ids]of bins){const x0=(key%cols)*tile,y0=Math.floor(key/cols)*tile,tw=Math.min(tile,w-x0),th=Math.min(tile,h-y0),sw=tw*samples,sh=th*samples,depth=new Float64Array(sw*sh*3);
  for(const id of ids){const part=parts[id],[X0,Y0,X1,Y1]=part.bounds,loX=Math.max(0,Math.floor((X0-x0)*samples)),hiX=Math.min(sw-1,Math.ceil((X1-x0)*samples)-1),loY=Math.max(0,Math.floor((Y0-y0)*samples)),hiY=Math.min(sh-1,Math.ceil((Y1-y0)*samples)-1);
   for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){const dx=x0+(x+.5)/samples-part.x,dy=y0+(y+.5)/samples-part.y,U=dx*part.c+dy*part.s,V=-dx*part.s+dy*part.c,coverage=filmThickness(U/part.rx,V/part.ry,p);if(!coverage)continue;
    const sx=clamp(part.cx+U/part.scale-.5,0,w-1),sy=clamp(part.cy+V/part.scale-.5,0,h-1),X=Math.floor(sx),Y=Math.floor(sy),fx=sx-X,fy=sy-Y,A=(Y*w+X)*3,B=(Y*w+Math.min(w-1,X+1))*3,C=(Math.min(h-1,Y+1)*w+X)*3,D=(Math.min(h-1,Y+1)*w+Math.min(w-1,X+1))*3,j=(y*sw+x)*3;
    for(let c=0;c<3;c++)depth[j+c]+=((field[A+c]*(1-fx)+field[B+c]*fx)*(1-fy)+(field[C+c]*(1-fx)+field[D+c]*fx)*fy)*coverage;
   }
  }
  for(let y=0;y<th;y++)for(let x=0;x<tw;x++){const i=((y+y0)*w+x+x0)*4;for(let c=0;c<3;c++){let sum=0;for(let yy=0;yy<samples;yy++)for(let xx=0;xx<samples;xx++)sum+=filmReadout(depth[((y*samples+yy)*sw+x*samples+xx)*3+c],p);out[i+c]=toEncoded(sum/(samples*samples))*255;}}
 }
 return out;
}
export function transmittedFilm(a,w,h,p={}){const q={...filmDefaults,...p};return filmRender(filmDensity(a,w,h,q),w,h,filmPlan(w,h,q),q);}
