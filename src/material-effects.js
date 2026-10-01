import {hash,clamp,sample} from './pixels.js';
import {grid,at,blur,expand} from './research-math.js';
const sat=x=>clamp(x,0,1);
const smooth=x=>{x=sat(x);return x*x*(3-2*x);};
export function noise(x,y,seed=17){
 const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(x-ix),fy=smooth(y-iy);
 return (hash(ix,iy,seed)*(1-fx)+hash(ix+1,iy,seed)*fx)*(1-fy)+(hash(ix,iy+1,seed)*(1-fx)+hash(ix+1,iy+1,seed)*fx)*fy;
}
const fbm=(x,y,s)=>noise(x,y,s)*.57+noise(x*2.13,y*2.13,s+1)*.28+noise(x*4.31,y*4.31,s+2)*.15;
// Independent digital model: concentration transport, unequal channel mobility, drying.
export function wetprint(a,w,h,p){
 if(!p.time)return a.slice();
 const g=grid(a,w,h,384),W=g.w,H=g.h,n=W*H,S=Math.max(W,H),height=blur(g.l,W,H,3),u=new Float32Array(n),v=u.slice(),water=u.slice();
 let ink=g.rgb.map(channel=>Float32Array.from(channel,z=>-Math.log(.035+z*.965)));
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,nx=x/S*4,ny=y/S*4,dx=(fbm(nx+.03,ny,p.seed)-fbm(nx-.03,ny,p.seed))*16,dy=(fbm(nx,ny+.03,p.seed)-fbm(nx,ny-.03,p.seed))*16,edgeX=at(height,W,H,x+1,y)-at(height,W,H,x-1,y),edgeY=at(height,W,H,x,y+1)-at(height,W,H,x,y-1);
  water[i]=.25+.75*fbm(nx*.7+7,ny*.7,p.seed+19);
  u[i]=(dy+edgeY*18)*p.turbulence/70;v[i]=(-dx-edgeX*18+.2)*p.turbulence/70;
 }
 for(let t=0;t<p.time;t++){
  const next=ink.map(()=>new Float32Array(n));
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const i=y*W+x,dry=Math.pow(1-t/(p.time+1),.35),speed=water[i]*dry,div=(at(u,W,H,x+1,y)-at(u,W,H,x-1,y)+at(v,W,H,x,y+1)-at(v,W,H,x,y-1))*.5;
   for(let c=0;c<3;c++){
    const mobility=1+(c-1)*p.separation/130,bx=x-u[i]*speed*mobility,by=y-v[i]*speed*mobility;
    const adv=at(ink[c],W,H,bx,by),diff=(at(ink[c],W,H,bx-1,by)+at(ink[c],W,H,bx+1,by)+at(ink[c],W,H,bx,by-1)+at(ink[c],W,H,bx,by+1))*.25;
    next[c][i]=clamp((adv*.975+diff*.025)*Math.exp(-div*speed*.22),0,5);
   }
  }ink=next;
 }
 const out=ink.map(()=>new Float32Array(n)),paper=[1,.98,.91];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,dissolve=smooth((fbm(x/S*8+2,y/S*8,p.seed+77)-.3)*2)*p.wash/100,texture=(hash(x,y,p.seed)-.5)*.025;
  const wet=smooth((water[i]-.35)*2.8),crisp=.12+.48*(1-wet);
  for(let c=0;c<3;c++)out[c][i]=(paper[c]*Math.exp(-ink[c][i]*(1-dissolve*.9)*(.65+p.density/100)))*(1-crisp)+g.rgb[c][i]*crisp+texture;
 }
 return expand(out,W,H,w,h);
}
export function squeegee(a,w,h,p){
 if(!p.pull)return a.slice();
 const g=grid(a,w,h,900),W=g.w,H=g.h,S=Math.max(W,H),angle=p.angle*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle),out=g.rgb.map(()=>new Float32Array(W*H));
 const strokes=Array.from({length:p.strokes},(_,k)=>{
  let ax=0,ay=0;for(let trial=0;trial<12;trial++){ax=hash(k,trial*2+1,p.seed)*(W-1);ay=hash(k,trial*2+2,p.seed)*(H-1);if(at(g.l,W,H,ax,ay)>.18)break;}
  const nx=(ax-W/2)/S*1000,ny=(ay-H/2)/S*1000,length=350+hash(k,3,p.seed)*500;
  return {v:-nx*si+ny*co,start:nx*co+ny*si-length*.45,length,width:p.width*(.4+hash(k,4,p.seed)),shift:(.45+hash(k,5,p.seed))*(hash(k,6,p.seed)>.3?1:-1),curve:hash(k,7,p.seed)*6};
 });
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const nx=(x-W/2)/S*1000,ny=(y-H/2)/S*1000,u=nx*co+ny*si,v=-nx*si+ny*co;let drag=0,shear=0;
  for(const q of strokes){
   const along=(u-q.start)/q.length,center=q.v+Math.sin(along*4+q.curve)*q.width*.35,across=(v-center)/q.width,edge=Math.exp(-(across**4)*2)*smooth(along*8)*smooth((1-along)*5),comb=1+.17*Math.sin(v*2.4+noise(u*.006,v*.014,p.seed)*8);
   drag+=edge*q.shift*p.pull*comb;shear+=edge*Math.sin(along*6+q.curve)*q.width*.14;
  }
  const sx=x-(drag*co-shear*si)*S/1000,sy=y-(drag*si+shear*co)*S/1000,i=y*W+x;
  for(let c=0;c<3;c++)out[c][i]=at(g.rgb[c],W,H,sx+(c-1)*drag*p.split/10000*S/1000,sy);
 }
 return expand(out,W,H,w,h);
}
export function chromaticburn(a,w,h,p){
 if(!p.burn)return a.slice();
 const g=grid(a,w,h,900),W=g.w,H=g.h,S=Math.max(W,H),out=g.rgb.map(()=>new Float32Array(W*H)),soft=blur(g.l,W,H,3),phase=p.phase/100;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x,L=g.l[i],n=fbm(x/S*3,y/S*3,p.seed),edge=Math.abs(L-soft[i]),burn=p.burn/100;
  for(let c=0;c<3;c++){
   const z=g.rgb[c][i],base=z*.85+L*.15,t=base*(1+burn*1.6)+phase+(n-.5)*p.contamination/180+(c-1)*p.separation/210;
   const wave=.5-.5*Math.cos(t*Math.PI*2),solar=base*(1-burn)+wave*burn;
   out[c][i]=sat(solar+edge*p.halo/30)+(hash(x,y,p.seed+c)-.5)*.018;
  }
 }
 return expand(out,W,H,w,h);
}
export function palimpsest(a,w,h,p){
 if(!p.passes)return a.slice();
 const g=grid(a,w,h,700),W=g.w,H=g.h,S=Math.max(W,H),out=g.rgb.map(channel=>channel.slice()),paper=[.96,.96,.88],base=blur(g.l,W,H,2);
 for(let k=0;k<p.passes;k++){
  const angle=(hash(k,1,p.seed)-.5)*p.rotation*Math.PI/180,co=Math.cos(angle),si=Math.sin(angle),zoom=1+(hash(k,2,p.seed)-.3)*p.dislocation/170,dx=(hash(k,3,p.seed)-.5)*p.dislocation*S/280,dy=(hash(k,4,p.seed)-.5)*p.dislocation*S/280;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const i=y*W+x,xx=x-W/2,yy=y-H/2,sx=(xx*co-yy*si)/zoom+W/2+dx,sy=(xx*si+yy*co)/zoom+H/2+dy,l=at(base,W,H,sx,sy),n=fbm(x/S*(3+k*.5)+k*17,y/S*(3+k*.5),p.seed+k),edge=Math.abs(l-at(base,W,H,sx+2,sy+2)),mask=smooth((n*.65+l*.35-.40)*8)*p.transfer/100;
   for(let c=0;c<3;c++){
    const src=at(g.rgb[c],W,H,sx,sy),solar=k%3===1?1-Math.abs(src*2-1):src,tone=k%2===0?solar:paper[c]-(1-solar)*[.95,1.12,.85][c],material=k%2===0?Math.min(out[c][i],tone):1-(1-out[c][i])*(1-tone*.85);
    out[c][i]=out[c][i]*(1-mask)+material*mask-edge*mask*.6;
   }
  }
 }
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,peel=smooth((fbm(x/S*11,y/S*11,p.seed+101)-.57)*6)*p.erosion/100;for(let c=0;c<3;c++)out[c][i]=out[c][i]*(1-peel)+paper[c]*peel+(hash(x,y,p.seed)-.5)*.045;}
 return expand(out,W,H,w,h);
}
const material={wetprint,squeegee,chromaticburn,palimpsest};
export function materialTransform(a,w,h,id,p){if(!material[id])throw new Error('Unknown material operator');return material[id](a,w,h,p);}
