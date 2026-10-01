import {hash,clamp,sample} from './pixels.js';
import {grid,tensor,at,expand} from './research-math.js';
// Four wave directions inside one Gaussian footprint; independent equation port.
export function harmonicBlend(u,v,frequencies,phases,weights,normalization=null){
 let value=0,mass=0;
 for(let i=0;i<4;i++){const angle=i*Math.PI/4,w=weights[i];value+=w*Math.cos(2*Math.PI*frequencies[i]*(Math.cos(angle)*u+Math.sin(angle)*v)+phases[i]);mass+=w;}
 const denominator=normalization??mass;return denominator?value/denominator:0;
}
export function gaborcloth(a,w,h,p){
 const edge=Math.max(w,h),g=grid(a,w,h,180),t=tensor(g,3),scale=Math.min(1,1100/edge),W=Math.max(1,Math.round(w*scale)),H=Math.max(1,Math.round(h*scale));
 const unit=Math.sqrt(W*H/p.cells),rgb=[0,1,2].map(()=>new Float32Array(W*H).fill(p.paper/100));
 const nx=Math.max(1,Math.round(Math.sqrt(p.cells*W/H))),ny=Math.max(1,Math.ceil(p.cells/nx));
 for(let ky=0;ky<ny;ky++)for(let kx=0;kx<nx;kx++){
  const k=ky*nx+kx,x=(kx+.15+.7*hash(k,1,p.seed))*W/nx,y=(ky+.15+.7*hash(k,2,p.seed))*H/ny,X=x/W*g.w,Y=y/H*g.h;
  const angle=at(t.angle,g.w,g.h,X,Y)+(hash(k,3,p.seed)-.5)*p.cross/100*Math.PI,co=Math.cos(angle),si=Math.sin(angle);
  const long=unit*p.size/100*(1+p.stretch/100*2.5),short=unit*p.size/100/Math.sqrt(1+p.stretch/100*2.5),cx=x+(hash(k,4,p.seed)-.5)*unit*p.scatter/100*3,cy=y+(hash(k,5,p.seed)-.5)*unit*p.scatter/100*3;
  const colorA=[0,1,2].map(c=>sample(a,w,h,(x-si*short*.9)*w/W,(y+co*short*.9)*h/H,c)/255),colorB=[0,1,2].map(c=>sample(a,w,h,(x+si*short*.9)*w/W,(y-co*short*.9)*h/H,c)/255);
  const frequencies=[0,1,2,3].map(i=>p.frequency/10*(.8+.4*hash(k,11+i,p.seed))),phases=[0,1,2,3].map(i=>hash(k,21+i,p.seed)*Math.PI*2),weights=[.08,.2,1,.15];
  const ex=3*Math.hypot(long*co,short*si),ey=3*Math.hypot(long*si,short*co);
  const x0=Math.max(0,Math.floor(cx-ex)),x1=Math.min(W-1,Math.ceil(cx+ex)),y0=Math.max(0,Math.floor(cy-ey)),y1=Math.min(H-1,Math.ceil(cy+ey));
  // Gaussian pixel footprint attenuates frequencies beyond display Nyquist.
  const filtered=weights.map((v,i)=>{const q=i*Math.PI/4,f=frequencies[i];return v*Math.exp(-Math.PI*Math.PI*f*f*(Math.cos(q)**2/(long*long)+Math.sin(q)**2/(short*short))/6);});
  for(let yy=y0;yy<=y1;yy++)for(let xx=x0;xx<=x1;xx++){
   const dx=xx-cx,dy=yy-cy,u=(dx*co+dy*si)/long,v=(-dx*si+dy*co)/short,r2=u*u+v*v;if(r2>9)continue;
   // Keep unfiltered denominator so unresolved oscillations vanish rather than re-amplify.
   const wave=harmonicBlend(u,v,frequencies,phases,filtered,1.43);
   const blend=.5+.5*wave,weight=Math.exp(-r2*.5),i=yy*W+xx,groove=clamp((wave+.2)*2,0,1),alpha=weight*.92*(1-p.etch/100+p.etch/100*groove);
   for(let c=0;c<3;c++)rgb[c][i]=rgb[c][i]*(1-alpha)+(colorA[c]*blend+colorB[c]*(1-blend))*alpha;
  }
 }
 return expand(rgb,W,H,w,h);
}
