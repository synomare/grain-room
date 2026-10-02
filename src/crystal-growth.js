import {clamp,hash,sample} from './pixels.js';
import {grid,blur,at} from './research-math.js';

// Wang & Zheng (2026), section 2: anisotropic interfacial energy and
// Allen-Cahn / temperature coupling. This is an explicit 2D finite-difference
// adaptation, NOT the paper's auxiliary-variable Runge-Kutta solver.
export const latentPotential=q=>q-q*q*q*2/3+q*q*q*q*q/5;
export function interfaceFlux(gx,gy,strength=.025,folds=6,angle=0){
 if(gx*gx+gy*gy<1e-24)return [0,0];
 const theta=Math.atan2(gy,gx)-angle,k=1+strength*Math.cos(folds*theta),dk=-folds*strength*Math.sin(folds*theta);
 return [k*k*gx-k*dk*gy,k*k*gy+k*dk*gx];
}
export function crystalEnergy(phi,w,h,{strength=.025,folds=6,angle=0,epsilon=1.1}={}){
 let sum=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,q=phi[i],gx=x+1<w?phi[i+1]-q:0,gy=y+1<h?phi[i+w]-q:0;
  const k=gx*gx+gy*gy<1e-24?1:1+strength*Math.cos(folds*(Math.atan2(gy,gx)-angle));
  sum+=epsilon*epsilon*.5*k*k*(gx*gx+gy*gy)+.25*(q*q-1)**2;
 }return sum;
}
// Forward gradient paired with its negative adjoint. Boundary faces carry no flux.
export function crystalForce(phi,w,h,{strength=.025,folds=6,angle=0,epsilon=1.1}={}){
 const result=new Float64Array(phi.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,q=phi[i],gx=x+1<w?phi[i+1]-q:0,gy=y+1<h?phi[i+w]-q:0;
  const [fx,fy]=interfaceFlux(gx,gy,strength,folds,angle),e=epsilon*epsilon;
  if(x+1<w){result[i]+=e*fx;result[i+1]-=e*fx;}
  if(y+1<h){result[i]+=e*fy;result[i+w]-=e*fy;}
  result[i]-=q*q*q-q;
 }return result;
}
export function crystalStep(phi,temperature,w,h,options={}){
 const {dt=.07,diffusivity=1.8,latent=.65,coupling=2.2,cooling=0,bath=null}=options;
 const force=crystalForce(phi,w,h,options),next=new Float64Array(phi.length),heat=temperature.slice();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,t=temperature[i];
  if(x+1<w){const flux=dt*diffusivity*(temperature[i+1]-t);heat[i]+=flux;heat[i+1]-=flux;}
  if(y+1<h){const flux=dt*diffusivity*(temperature[i+w]-t);heat[i]+=flux;heat[i+w]-=flux;}
 }
 for(let i=0;i<phi.length;i++){
  const q=phi[i],rate=force[i]-coupling*(1-q*q)**2*temperature[i];
  next[i]=clamp(q+dt*rate,-1,1);
  // Exact change of h preserves discrete total (T-K h(phi)) when cooling=0.
  heat[i]+=latent*(latentPotential(next[i])-latentPotential(q));
  if(bath&&cooling)heat[i]+=dt*cooling*(bath[i]-temperature[i]);
 }return {phi:next,temperature:heat};
}
export function evolveCrystal(photo,w,h,{steps=700,nuclei=24,seed=17,cold=.65,follow=.7,strength=.025,folds=6,angle=0,latent=.65}={}){
 const n=w*h,span=Math.max(w,h),bath=new Float64Array(n),origin=new Float64Array(n);origin.fill(-1);
 for(let i=0;i<n;i++)bath[i]=-cold*(.3+.7*((1-follow)+follow*photo[i]));
 const centers=[];
 for(let k=0;k<nuclei;k++){
  // Choose among seeded candidates by image brightness; no source artwork is introduced.
  let best=null;
  for(let trial=0;trial<5;trial++){
   const x=hash(k*7+trial,91,seed)*(w-1),y=hash(k*7+trial,97,seed)*(h-1),l=at(photo,w,h,x,y),score=hash(k*7+trial,103,seed)+follow*l;
   if(!best||score>best.score)best={x,y,score};
  }centers.push(best);
 }
 const radius=Math.max(1.5,span/85);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let distance=Infinity;for(const c of centers)distance=Math.min(distance,Math.hypot(x-c.x,y-c.y));
  origin[y*w+x]=Math.tanh((radius-distance)/1.1);
 }
 let phi=origin.slice(),temperature=bath.slice();
 const arrival=Float64Array.from(origin,q=>q>0?0:1);
 const options={strength,folds,angle,latent,bath,cooling:.003,dt:.04,diffusivity:3};
 for(let step=0;step<steps;step++){
  ({phi,temperature}=crystalStep(phi,temperature,w,h,options));
  for(let i=0;i<n;i++)if(arrival[i]===1&&phi[i]>0)arrival[i]=(step+1)/(steps+1);
 }
 return {phi,temperature,origin,arrival};
}
export function crystallize(a,w,h,p){
 const g=grid(a,w,h,p.scale),W=g.w,H=g.h,photo=blur(g.l,W,H,2);
 const state=evolveCrystal(photo,W,H,{steps:p.time*20,nuclei:p.nuclei,seed:p.seed,cold:p.cold/100,follow:p.follow/100,strength:p.anisotropy/100*(p.symmetry===4?.12:.1),folds:p.symmetry,angle:p.angle*Math.PI/180,latent:p.latent/100});
 const solid=Float32Array.from(state.phi,q=>(q+1)/2),strata=Float32Array.from(solid,(q,i)=>q*(.55+.45*Math.cos(state.arrival[i]*Math.PI*2*p.rings))),height=blur(strata,W,H,1),out=new Uint8ClampedArray(a.length),light=p.light*Math.PI/180,span=Math.max(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=(x+.5)*W/w-.5,Y=(y+.5)*H/h-.5,i=(y*w+x)*4,s=at(solid,W,H,X,Y),age=at(state.arrival,W,H,X,Y),band=.5+.5*Math.cos(age*Math.PI*2*p.rings),coverage=clamp((s-.5)*5+.5,0,1)*clamp((band-p.etch/150)*8+.5,0,1);
  const gx=(at(height,W,H,X+1,Y)-at(height,W,H,X-1,Y))*.5,gy=(at(height,W,H,X,Y+1)-at(height,W,H,X,Y-1))*.5;
  const slope=gx*Math.cos(light)+gy*Math.sin(light),shade=clamp(1+slope*p.relief/18,.12,2.5),edge=Math.hypot(gx,gy);
  const dx=gx*p.refract*span/280,dy=gy*p.refract*span/280,base=p.paper*2.55;
  for(let c=0;c<3;c++){
   const col=sample(a,w,h,x+dx*(1+(c-1)*.16),y+dy*(1+(c-1)*.16),c),ink=col*shade+edge*p.rim*1.4;
   const background=base*(1-p.ghost/100)+a[i+c]*p.ghost/100;
   out[i+c]=background*(1-coverage)+ink*coverage;
  }out[i+3]=255;
 }return out;
}