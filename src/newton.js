import {hash,clamp,sample} from './pixels.js';
import {grid,gaussianBlur,at} from './research-math.js';

// p'/p = sum 1/(z-root): avoids building ill-conditioned coefficients.
// A root is fixed; a derivative pole is reported, not silently called a root.
export function newtonStep(x,y,roots,relax=1){
 let re=0,im=0;
 for(const [rx,ry] of roots){const dx=x-rx,dy=y-ry,d=dx*dx+dy*dy;if(d<1e-20)return {x:rx,y:ry,pole:false};re+=dx/d;im-=dy/d;}
 const den=re*re+im*im;if(den<1e-20)return {x,y,pole:true};
 return {x:x-relax*re/den,y:y+relax*im/den,pole:false};
}
export function rootOrbit(x,y,roots,steps=24,relax=1){
 let ox=x,oy=y,travel=0,root=-1,iteration=0,pole=false,nearest=Infinity,previous=Infinity,smoothIteration=steps;
 for(;iteration<steps;iteration++){
  nearest=Infinity;let index=-1;
  for(let k=0;k<roots.length;k++){const d=Math.hypot(x-roots[k][0],y-roots[k][1]);if(d<nearest){nearest=d;index=k;}}
  if(nearest<1e-5){root=index;smoothIteration=iteration===0?0:iteration-1+clamp(Math.log(previous/1e-5)/Math.log(previous/Math.max(nearest,1e-30)),0,1);break;}
  previous=nearest;
  const next=newtonStep(x,y,roots,relax);if(next.pole){pole=true;break;}
  travel+=Math.min(3,Math.hypot(next.x-x,next.y-y));
  // Retain early orbit geometry instead of sampling only the final root.
  if(iteration===1){ox=next.x;oy=next.y;}
  x=next.x;y=next.y;if(!Number.isFinite(x+y)||Math.abs(x)+Math.abs(y)>1e8){pole=true;break;}
 }
 if(!pole&&root<0)for(let k=0;k<roots.length;k++)if(Math.hypot(x-roots[k][0],y-roots[k][1])<1e-5){root=k;break;}
 return {x,y,ox,oy,travel,root,iteration,pole,smoothIteration};
}
export function basinRoots(count,seed,angle=0,spread=1){
 return Array.from({length:count},(_,k)=>{const theta=2*Math.PI*k/count+angle+.6*(hash(k,3,seed)-.5),r=spread*(.55+.4*hash(k,8,seed));return [r*Math.cos(theta),r*Math.sin(theta)];});
}
export function newton(a,w,h,p){
 const g=grid(a,w,h,320),smooth=gaussianBlur(g.l,g.w,g.h,2.2),roots=basinRoots(p.roots,p.seed,p.angle*Math.PI/180,p.spread/100),out=new Uint8ClampedArray(a.length),long=Math.max(w,h),zoom=p.zoom/100;
 const palettes=roots.map(([x,y],k)=>[0,1,2].map(c=>.5+.5*Math.cos(2*Math.PI*(k/roots.length+p.hue/360-c/3))));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,l=at(smooth,g.w,g.h,(x+.5)*g.w/w-.5,(y+.5)*g.h/h-.5);
  const zx=(x+.5-w/2)/long*3/zoom+(l-.5)*p.follow/65;
  const zy=(y+.5-h/2)/long*3/zoom+(at(smooth,g.w,g.h,(x+.5)*g.w/w+2,(y+.5)*g.h/h-2)-l)*p.follow/40;
  const q=rootOrbit(zx,zy,roots,p.steps,p.relax/100),k=q.root;
  const phase=q.travel*p.bands/18,contour=.5+.5*Math.cos(phase*2*Math.PI);
  const shade=.06+.94*Math.pow(contour,.7),ink=p.ink/100;
  const sx=x+Math.tanh(q.ox-zx)*long*p.warp/180,sy=y+Math.tanh(q.oy-zy)*long*p.warp/180;
  for(let c=0;c<3;c++){
   const photo=sample(a,w,h,sx,sy,c)/255,tint=k<0?.12:palettes[k][c];
   const dye=photo*(1-p.tint/100)+(.15+.85*tint)*p.tint/100;
   const material=dye*(1-ink+ink*shade);
   // Fast-converging interiors open into white; slow branching boundaries remain.
   const opening=clamp((10-q.smoothIteration)/6,0,1)*p.paper/100;
   out[i+c]=255*(material*(1-opening)+opening);
  }out[i+3]=255;
 }return out;
}
