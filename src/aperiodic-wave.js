import {hash,clamp,sample} from './pixels.js';
import {grid,at,blur} from './research-math.js';

const TAU=Math.PI*2;
// A 2D radial spectrum becomes a complex 1D wave profile (radial Jacobian f).
// Independent implementation from Guehl et al.'s SIGGRAPH 2025 slides 12–13.
export function makeWaveProfile(center=24,bandwidth=5,seed=17,size=2048){
 const re=new Float64Array(size),im=new Float64Array(size),terms=[];let energy=0;
 for(let k=1;k<Math.min(size/2,160);k++){
  const amplitude=Math.exp(-.5*((k-center)/bandwidth)**2)*k;
  if(amplitude<1e-7)continue;
  const phase=TAU*hash(k,381,seed);terms.push([k,amplitude,phase]);energy+=amplitude*amplitude;
 }
 const norm=1/Math.sqrt(energy||1);
 for(let i=0;i<size;i++)for(const [k,amplitude,phase] of terms){const t=TAU*k*i/size+phase;re[i]+=Math.cos(t)*amplitude*norm;im[i]+=Math.sin(t)*amplitude*norm;}
 return {re,im,size,terms:terms.map(([k,a,p])=>[k,a*norm,p])};
}
export function periodicWave(a,t){const n=a.length,u=((t%1)+1)%1*n,i=Math.floor(u),f=u-i;return a[i]*(1-f)+a[(i+1)%n]*f;}
export function periodicWaveSlope(a,t){const n=a.length,i=Math.floor(((t%1)+1)%1*n);return (a[(i+1)%n]-a[i])*n;}
// Section 4.3: common phases let two directional spectra mix as amplitudes.
// The squared angular weights and unit-power compensation are our 2D choice.
export function makeWaveBank(band=30,crossfreq=100,crossband=100,seed=17){
 const main=makeWaveProfile(24,1+band/7,seed);
 if(crossfreq===100&&crossband===100)return main;
 const cross=makeWaveProfile(24*crossfreq/100,(1+band/7)*crossband/100,seed),other=new Map(cross.terms.map(([k,a])=>[k,a]));
 const correlation=main.terms.reduce((sum,[k,a])=>sum+a*(other.get(k)||0),0);
 return {...main,cross,correlation};
}
export function waveDirections(p,bank){
 const theta=p.angle*Math.PI/180,directions=[];
 for(let j=0;j<p.waves;j++){
  const angle=TAU*(j+hash(j,65,p.seed)*.8)/p.waves,aniso=p.align/100;
  const d=[Math.cos(angle+theta),Math.sin(angle+theta),hash(j,471,p.seed),1-aniso+aniso*Math.exp(4*(Math.cos(2*angle)-1))];
  if(bank.cross){const blend=Math.sin(angle)**2;d.push(blend,1/Math.sqrt((1-blend)**2+blend**2+2*blend*(1-blend)*bank.correlation));}
  directions.push(d);
 }return directions;
}
export function compileWaveBank(bank,directions){
 if(!bank.cross)return bank;
 const compiled=directions.map(([, , , ,blend=0,gain=1])=>{
  const re=new Float64Array(bank.size),im=new Float64Array(bank.size);
  for(let i=0;i<bank.size;i++){re[i]=(bank.re[i]*(1-blend)+bank.cross.re[i]*blend)*gain;im[i]=(bank.im[i]*(1-blend)+bank.cross.im[i]*blend)*gain;}
  return {re,im};
 });return {...bank,compiled};
}
export function waveField(profile,x,y,directions,mode=1,gradient=false){
 let re=0,im=0,nearest=Infinity,second=Infinity,owner=0,rx=0,ry=0,ix=0,iy=0,mx=0,my=0;
 for(let j=0;j<directions.length;j++){
  const [dx,dy,shift,weight,blend=0,gain=1]=directions[j],t=x*dx+y*dy+shift;
  const wave=profile.compiled?.[j]||profile;
  let r=periodicWave(wave.re,t),v=periodicWave(wave.im,t),dr=gradient?periodicWaveSlope(wave.re,t):0,di=gradient?periodicWaveSlope(wave.im,t):0;
  if(profile.cross&&!profile.compiled){r=(r*(1-blend)+periodicWave(profile.cross.re,t)*blend)*gain;v=(v*(1-blend)+periodicWave(profile.cross.im,t)*blend)*gain;if(gradient){dr=(dr*(1-blend)+periodicWaveSlope(profile.cross.re,t)*blend)*gain;di=(di*(1-blend)+periodicWaveSlope(profile.cross.im,t)*blend)*gain;}}
  re+=weight*r;im+=weight*v;
  rx+=dr*weight*dx;ry+=dr*weight*dy;ix+=di*weight*dx;iy+=di*weight*dy;
  const distance=Math.abs(r);if(distance<nearest){second=nearest;nearest=distance;owner=j;mx=dr*Math.sign(r)*dx;my=dr*Math.sign(r)*dy;}else if(distance<second)second=distance;
 }
 const den=Math.sqrt(directions.reduce((s,d)=>s+d[3]*d[3],0));
 return mode===3?[nearest,second,owner,mx,my]:[re/den,im/den,Math.atan2(im,re),rx/den,ry/den,ix/den,iy/den];
}
export function waveweft(a,w,h,p){
 const g=grid(a,w,h,384),photo=blur(blur(g.l,g.w,g.h,7),g.w,g.h,7),colors=p.texture<100?g.rgb.map(v=>blur(blur(v,g.w,g.h,15),g.w,g.h,15)):null,bank=makeWaveBank(p.band,p.crossfreq??100,p.crossband??100,p.seed),directions=waveDirections(p,bank),profile=compileWaveBank(bank,directions);
 const out=new Uint8ClampedArray(a.length),span=Math.max(w,h),scale=p.frequency/24,nx=p.bend/100*.14,aa=Math.max(.015,p.frequency/span);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=(x+.5)*g.w/w-.5,Y=(y+.5)*g.h/h-.5,l=at(photo,g.w,g.h,X,Y),gx=at(photo,g.w,g.h,X+1,Y)-at(photo,g.w,g.h,X-1,Y),gy=at(photo,g.w,g.h,X,Y+1)-at(photo,g.w,g.h,X,Y-1);
  const u=scale*((x-w/2)/span+nx*(l-.5)),v=scale*((y-h/2)/span+nx*(gx-gy)*3),f=waveField(profile,u,v,directions,p.mode,true);
  const ldx=gx*.5*g.w/w,ldy=gy*.5*g.h/h,ux=scale*(1/span+nx*ldx),uy=scale*nx*ldy;
  const dxx=at(photo,g.w,g.h,X+1,Y)+at(photo,g.w,g.h,X-1,Y)-2*l,dyy=at(photo,g.w,g.h,X,Y+1)+at(photo,g.w,g.h,X,Y-1)-2*l,dxy=(at(photo,g.w,g.h,X+1,Y+1)-at(photo,g.w,g.h,X+1,Y-1)-at(photo,g.w,g.h,X-1,Y+1)+at(photo,g.w,g.h,X-1,Y-1))*.25;
  const vx=scale*nx*6*(dxx-dxy)*g.w/w,vy=scale*(1/span+nx*6*(dxy-dyy)*g.h/h);
  const footprint=(du,dv,dl=0)=>Math.max(aa,Math.abs(du*ux+dv*vx+dl*ldx)+Math.abs(du*uy+dv*vy+dl*ldy));
  let mask,displace;
  if(p.mode===3){mask=1-clamp((f[0]*p.waves-p.width/100)/(footprint(f[3],f[4])*p.waves)+.5,0,1);displace=(f[2]/p.waves-.5);}
  else if(p.mode===2){const angle=f[2]*2+l*p.memory/25,stripe=Math.cos(angle),den=Math.max(1e-8,f[0]*f[0]+f[1]*f[1]),du=-2*Math.sin(angle)*(f[0]*f[5]-f[1]*f[3])/den,dv=-2*Math.sin(angle)*(f[0]*f[6]-f[1]*f[4])/den;mask=clamp((stripe+(p.width-65)/60)/footprint(du,dv,-Math.sin(angle)*p.memory/25)+.5,0,1);displace=f[0]*.23;}
  else{const ridge=Math.abs(f[0]+(l-.5)*p.memory/55);mask=clamp((ridge-p.width/140)/footprint(f[3],f[4],p.memory/55)+.5,0,1);displace=f[1]*.2;}
  const ox=displace*p.shift/100*span*.2,oy=displace*p.shift/100*span*.07,ix=(y*w+x)*4;
  for(let c=0;c<3;c++){
   const literal=sample(a,w,h,x+ox,y+oy,c),color=colors?literal*p.texture/100+255*at(colors[c],g.w,g.h,(x+ox+.5)*g.w/w-.5,(y+oy+.5)*g.h/h-.5)*(1-p.texture/100):literal,paper=p.paper*2.55;
   out[ix+c]=color*(1-mask)+paper*mask;
  }out[ix+3]=255;
 }return out;
}
