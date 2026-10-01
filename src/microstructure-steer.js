import {hash,clamp,sample} from './pixels.js';
import {grid,tensor,at} from './research-math.js';
import {mirror} from './field-marbling.js';

export const compactFade=x=>{x=clamp(Math.abs(x),0,1);return 1-x*x*x*(x*(x*6-15)+10);};
// Positive eigenvalues, trace < 4; compatible with the paper's coverage bound.
export function noiseMetric(angle,strength){
 const t=clamp(strength,0,1),lo=1-.5*t,hi=1+2.35*t,c=Math.cos(angle),s=Math.sin(angle);
 return [lo*c*c+hi*s*s,(lo-hi)*c*s,lo*s*s+hi*c*c];
}
// Independent 2D implementation of Rice 2025 Algorithm 1.
export function steerNoise(x,y,G,seed=17){
 const X=Math.floor(x),Y=Math.floor(y);let value=0,mass=0;
 for(let j=0;j<2;j++)for(let i=0;i<2;i++){
  const dx=x-X-i,dy=y-Y-j,q=G[0]*dx*dx+2*G[1]*dx*dy+G[2]*dy*dy,angle=hash(X+i,Y+j,seed)*Math.PI*2;
  const rx=Math.cos(angle),ry=Math.sin(angle),projection=dx*(G[0]*rx+G[1]*ry)+dy*(G[1]*rx+G[2]*ry),weight=compactFade(dx)*compactFade(dy)*compactFade(q);
  value+=weight*projection;mass+=weight;
 }return {value,mass};
}
export function steergrain(a,w,h,p){
 if(p.relief===0&&p.displace===0)return a.slice();
 const edge=Math.max(w,h),g=grid(a,w,h,220),t=tensor(g,4),scale=Math.min(1,1000/edge),W=Math.max(1,Math.round(w*scale)),H=Math.max(1,Math.round(h*scale));
 const height=new Float32Array(W*H),rot=p.angle*Math.PI/180,xx=new Float32Array(g.w*g.h),xy=xx.slice(),yy=xx.slice();
 for(let i=0;i<xx.length;i++){
  const angle=t.angle[i]+rot,G=noiseMetric(angle,p.direction/100);xx[i]=G[0];xy[i]=G[1];yy[i]=G[2];
 }
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const X=(x+.5)*g.w/W-.5,Y=(y+.5)*g.h/H-.5,G=[at(xx,g.w,g.h,X,Y),at(xy,g.w,g.h,X,Y),at(yy,g.w,g.h,X,Y)];
  const u=x/Math.max(W,H)*p.frequency,v=y/Math.max(W,H)*p.frequency;let n=0;
  for(let octave=0;octave<3;octave++){const f=2**octave;n+=steerNoise(u*f+.317,v*f+.719,G,p.seed+octave*109).value/f;}
  height[y*W+x]=n;
 }
 const out=new Uint8ClampedArray(a.length),light=p.light*Math.PI/180,lx=Math.cos(light)*.65,ly=Math.sin(light)*.65,lz=.76;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=(x+.5)*W/w-.5,Y=(y+.5)*H/h-.5,z=at(height,W,H,X,Y),dx=(at(height,W,H,X+1,Y)-at(height,W,H,X-1,Y))*Math.max(W,H)/p.frequency,dy=(at(height,W,H,X,Y+1)-at(height,W,H,X,Y-1))*Math.max(W,H)/p.frequency;
  const strength=p.relief/100*5,norm=Math.hypot(dx*strength,dy*strength,1),diffuse=clamp((-dx*strength*lx-dy*strength*ly+lz)/norm,0,1),spec=Math.pow(clamp((-dx*strength*lx*.5-dy*strength*ly*.5+.94)/norm,0,1),20)*p.relief/100;
  const offset=p.displace/1000*edge,u=mirror(x+dx*offset*.4,w),v=mirror(y+dy*offset*.4,h),shade=1-p.relief/100*.6+diffuse*p.relief/100*.8,i=(y*w+x)*4;
  for(let c=0;c<3;c++)out[i+c]=sample(a,w,h,u,v,c)*shade+spec*95;out[i+3]=255;
 }
 return out;
}
