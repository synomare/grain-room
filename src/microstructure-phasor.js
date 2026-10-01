import {hash,clamp} from './pixels.js';
import {grid,tensor,at,expand} from './research-math.js';

export function phaseValue(re,im){return Math.atan2(im,re);}
export function phaseDerivative(re,im,dre,dim){const d=re*re+im*im;return d>1e-12?(re*dim-im*dre)/d:0;}
export function phasorweave(a,w,h,p){
 const g=grid(a,w,h,200),t=tensor(g,4),scale=Math.min(1,1100/Math.max(w,h)),W=Math.max(1,Math.round(w*scale)),H=Math.max(1,Math.round(h*scale)),edge=Math.max(W,H);
 const re=new Float32Array(W*H),im=re.slice(),mass=re.slice(),unit=edge/p.domains,sigma=unit*.75,frequency=p.frequency/edge;
 const nx=Math.ceil(W/unit)+2,ny=Math.ceil(H/unit)+2;
 for(let ky=-1;ky<ny;ky++)for(let kx=-1;kx<nx;kx++){
  const cx=(kx+.2+.6*hash(kx,ky,p.seed))*unit,cy=(ky+.2+.6*hash(kx,ky,p.seed+71))*unit;
  const theta=at(t.angle,g.w,g.h,cx/W*g.w,cy/H*g.h)+Math.PI/2+p.angle*Math.PI/180+(hash(kx,ky,p.seed+53)-.5)*p.disorder/100*Math.PI;
  const fx=Math.cos(theta)*frequency,fy=Math.sin(theta)*frequency,phase=hash(kx,ky,p.seed+119)*Math.PI*2;
  const x0=Math.max(0,Math.floor(cx-3*sigma)),x1=Math.min(W-1,Math.ceil(cx+3*sigma)),y0=Math.max(0,Math.floor(cy-3*sigma)),y1=Math.min(H-1,Math.ceil(cy+3*sigma));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const dx=x-cx,dy=y-cy,weight=Math.exp(-(dx*dx+dy*dy)/(2*sigma*sigma)),q=2*Math.PI*(fx*dx+fy*dy)+phase,i=y*W+x;
   re[i]+=weight*Math.cos(q);im[i]+=weight*Math.sin(q);mass[i]+=weight;
  }
 }
 const rgb=[0,1,2].map(()=>new Float32Array(W*H));
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,r=re[i],s=im[i],phase=phaseValue(r,s),amp=Math.hypot(r,s)/(mass[i]||1),X=(x+.5)*g.w/W-.5,Y=(y+.5)*g.h/H-.5,l=at(g.l,g.w,g.h,X,Y);
  const dx=phaseDerivative(r,s,(at(re,W,H,x+1,y)-at(re,W,H,x-1,y))*.5,(at(im,W,H,x+1,y)-at(im,W,H,x-1,y))*.5),dy=phaseDerivative(r,s,(at(re,W,H,x,y+1)-at(re,W,H,x,y-1))*.5,(at(im,W,H,x,y+1)-at(im,W,H,x,y-1))*.5);
  const width=(.08+.8*l)*p.width/100,threshold=Math.cos(Math.PI*width),cosine=Math.cos(phase),slope=Math.max(.01,Math.abs(Math.sin(phase))*Math.hypot(dx,dy)),coverage=clamp((cosine-threshold)/slope+.5,0,1);
  // The phase is undefined at zero amplitude: fade the profile at these singularities.
  const reliability=clamp(amp*12,0,1),ink=coverage*reliability,shade=1-p.relief/100*.38+p.relief/100*.65*Math.max(0,Math.sin(phase)*.6+cosine*.8),paper=p.paper/100;
  for(let c=0;c<3;c++){const color=at(g.rgb[c],g.w,g.h,X,Y);rgb[c][i]=paper*(1-ink)+color*shade*ink;}
 }
 return expand(rgb,W,H,w,h);
}
