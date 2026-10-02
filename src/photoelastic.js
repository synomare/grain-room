import {clamp,hash,sample} from './pixels.js';
import {grid,at,gaussianBlur} from './research-math.js';

// Principal stress difference and axis for a real symmetric 2D tensor.
export function principalStress(xx,yy,xy){return {difference:Math.hypot(xx-yy,2*xy),angle:.5*Math.atan2(2*xy,xx-yy)};}
// Jones result for a retarder between crossed linear polarizers; circular
// illumination removes the orientation term. Retardance and wavelength in nm.
export function polarizedIntensity(retardance,wavelength,axis,polarizer=0,circular=0){
 const orientation=Math.sin(2*(axis-polarizer))**2;
 return ((1-circular)*orientation+circular)*Math.sin(Math.PI*retardance/wavelength)**2;
}
// Airy-potential construction: sigma_xx=Phi_yy, sigma_yy=Phi_xx,
// sigma_xy=-Phi_xy. Synthetic image potential, not an elasticity solve.
export function airyStress(potential,w,h){
 const xx=new Float32Array(w*h),yy=new Float32Array(w*h),xy=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  // Extend the nearest interior curvature to the edge. Clamping the potential
  // itself invents a sharp stress rim around the photograph.
  const i=y*w+x,X=clamp(x,1,Math.max(1,w-2)),Y=clamp(y,1,Math.max(1,h-2));
  xx[i]=h<3?0:at(potential,w,h,x,Y+1)-2*at(potential,w,h,x,Y)+at(potential,w,h,x,Y-1);
  yy[i]=w<3?0:at(potential,w,h,X+1,y)-2*at(potential,w,h,X,y)+at(potential,w,h,X-1,y);
  xy[i]=w<3||h<3?0:-(at(potential,w,h,X+1,Y+1)-at(potential,w,h,X+1,Y-1)-at(potential,w,h,X-1,Y+1)+at(potential,w,h,X-1,Y-1))/4;
 }return {xx,yy,xy};
}
export function photoelastic(a,w,h,p){
 const g=grid(a,w,h,320),W=g.w,H=g.h,span=Math.max(W,H),r=Math.max(1,Math.round(p.spread*span/1800));
 const photo=gaussianBlur(gaussianBlur(g.l,W,H,r*.72),W,H,r*.72);
 const potential=Float32Array.from(photo,v=>v*r*r),stress=airyStress(potential,W,H);
 const centers=Array.from({length:p.anchors},(_,k)=>({x:hash(k,51,p.seed)*W,y:hash(k,79,p.seed)*H,r:span*(.08+.0015*p.spread)*( .65+hash(k,92,p.seed)),a:(hash(k,17,p.seed)-.35)*1.8}));
 const gap=new Float32Array(W*H),ax=new Float32Array(W*H),ay=new Float32Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x;let xx=stress.xx[i]*p.follow/8,yy=stress.yy[i]*p.follow/8,xy=stress.xy[i]*p.follow/8;
  for(const c of centers){const dx=(x-c.x)/c.r,dy=(y-c.y)/c.r,e=c.a*Math.exp(-.5*(dx*dx+dy*dy));xx+=(dy*dy-1)*e;yy+=(dx*dx-1)*e;xy-=dx*dy*e;}
  const s=principalStress(xx,yy,xy);gap[i]=s.difference;ax[i]=xx-yy;ay[i]=2*xy;
 }
 const out=new Uint8ClampedArray(a.length),polarizer=p.angle*Math.PI/180,circular=p.circular/100,back=p.backing/100,dye=p.dye/100;
 const wavelengths=[650,510,440];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=(x+.5)*W/w-.5,Y=(y+.5)*H/h-.5,i=(y*w+x)*4,delta=at(gap,W,H,X,Y);
  const axis=.5*Math.atan2(at(ay,W,H,X,Y),at(ax,W,H,X,Y)),l=at(photo,W,H,X,Y);
  const retardance=p.pressure*12*delta*(.35+l*p.thickness/65);
  const gx=at(gap,W,H,X+1,Y)-at(gap,W,H,X-1,Y),gy=at(gap,W,H,X,Y+1)-at(gap,W,H,X,Y-1);
  for(let c=0;c<3;c++){
   const intensity=polarizedIntensity(retardance,wavelengths[c],axis,polarizer,circular);
   const light=intensity*(1-back)+(1-intensity)*back;
   const pigment=sample(a,w,h,x+gx*p.warp*Math.max(w,h)/700,y+gy*p.warp*Math.max(w,h)/700,c)/255;
   out[i+c]=255*Math.pow(clamp(light,0,1),.72)*(1-dye+dye*(.15+.85*pigment));
  }out[i+3]=255;
 }return out;
}
