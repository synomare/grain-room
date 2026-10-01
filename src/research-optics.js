import {clamp} from './pixels.js';
import {grid,at,blur,expand,addBilinear} from './research-math.js';
// Three-interface Airy reflectance, integrated over 31 wavelengths.
// RGB sensitivities are smooth approximations, not a calibrated CIE observer.
export function filmSpectrum(thickness,cosine){
 const n0=1,n1=1.46,n2=2.4,c0=clamp(cosine,.04,1),s0=Math.sqrt(1-c0*c0),c1=Math.sqrt(1-(s0/n1)**2),c2=Math.sqrt(1-(s0/n2)**2);
 const rs0=(n0*c0-n1*c1)/(n0*c0+n1*c1),rs1=(n1*c1-n2*c2)/(n1*c1+n2*c2),rp0=(n1*c0-n0*c1)/(n1*c0+n0*c1),rp1=(n2*c1-n1*c2)/(n2*c1+n1*c2),rgb=[0,0,0],sum=[0,0,0];
 for(let wave=400;wave<=700;wave+=10){
  const phase=4*Math.PI*n1*thickness*c1/wave,cs=Math.cos(phase),airy=(a,b)=>(a*a+b*b+2*a*b*cs)/(1+(a*b)**2+2*a*b*cs),R=(airy(rs0,rs1)+airy(rp0,rp1))*.5;
  const sensitivity=[Math.exp(-.5*((wave-610)/40)**2),Math.exp(-.5*((wave-545)/33)**2),Math.exp(-.5*((wave-455)/26)**2)];
  for(let c=0;c<3;c++){rgb[c]+=R*sensitivity[c];sum[c]+=sensitivity[c];}
 }
 return rgb.map((v,c)=>v/sum[c]);
}
let filmLut;
function lookup(thickness,cosine){
 if(!filmLut){filmLut=new Float32Array(201*33*3);for(let t=0;t<=200;t++)for(let v=0;v<=32;v++){const col=filmSpectrum(t*10,v/32);for(let c=0;c<3;c++)filmLut[(v*201+t)*3+c]=col[c];}}
 const tx=clamp(thickness/10,0,200),ty=clamp(cosine*32,0,32),x=Math.floor(tx),y=Math.floor(ty),fx=tx-x,fy=ty-y;
 return [0,1,2].map(c=>{const get=(xx,yy)=>filmLut[(yy*201+xx)*3+c];return get(x,y)*(1-fx)*(1-fy)+get(Math.min(200,x+1),y)*fx*(1-fy)+get(x,Math.min(32,y+1))*(1-fx)*fy+get(Math.min(200,x+1),Math.min(32,y+1))*fx*fy;});
}
export function thinfilm(a,w,h,p){
 const g=grid(a,w,h,600),W=g.w,H=g.h,height=blur(blur(g.l,W,H,4),W,H,4),out=g.rgb.map(()=>new Float32Array(W*H)),angle=p.light*Math.PI/180,lx=Math.cos(angle)*.65,ly=Math.sin(angle)*.65,lz=.76;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,nx=(at(height,W,H,x-1,y)-at(height,W,H,x+1,y))*p.relief*.75,ny=(at(height,W,H,x,y-1)-at(height,W,H,x,y+1))*p.relief*.75,len=Math.hypot(nx,ny,1),cosine=1/len,dot=Math.max(.03,(nx*lx+ny*ly+lz)/len),f=lookup(p.thickness*(.35+height[i]*.9),cosine);
  const stripe=.5+.5*Math.sin(nx/len*7+ny/len*3+angle),environment=.035+.95*stripe**12,specular=dot**40*.7,metal=p.metal/100,maximum=Math.max(...f,.001),visibility=.15+.85*Math.min(1,height[i]*3);
  for(let c=0;c<3;c++){const film=(Math.pow(f[c]/maximum,2)*(environment*(.4+dot*.8)) + specular)*visibility;out[c][i]=g.rgb[c][i]*(1-metal)+film*metal;}
 }
 return expand(out,W,H,w,h);
}
export function caustic(a,w,h,p){
 if(p.focus===0)return a.slice();
 const g=grid(a,w,h,600),W=g.w,H=g.h,height=blur(g.l,W,H,Math.max(1,Math.round(1+p.relief/12))),out=g.rgb.map(()=>new Float32Array(W*H));
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,gx=at(height,W,H,x+1,y)-at(height,W,H,x-1,y),gy=at(height,W,H,x,y+1)-at(height,W,H,x,y-1),strength=p.focus*(.2+p.relief/80);
  for(let c=0;c<3;c++){const dispersion=1+(c-1)*p.dispersion/160;addBilinear(out[c],W,H,x+gx*strength*dispersion,y+gy*strength*dispersion,g.rgb[c][i]+.08);}
 }
 for(let i=0;i<W*H;i++)for(let c=0;c<3;c++){const energy=out[c][i];out[c][i]=g.rgb[c][i]*.12+Math.pow(Math.max(0,energy-.3),.65)*.8;}
 return expand(out,W,H,w,h);
}
