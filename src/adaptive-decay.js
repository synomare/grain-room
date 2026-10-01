import {clamp,hash} from './pixels.js';
import {grid,at,blur,tensor} from './research-math.js';
export const smoothUnit=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export const moistureActivity=m=>smoothUnit((m-.2)/.05)*smoothUnit((.9-m)/.05);
// Conservative no-flux diffusion with symmetric edge conductance.
export function decayDiffusion(a,w,h,cx,cy){const out=new Float32Array(a.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x+1<w){const j=i+1,f=(a[j]-a[i])*.5*(cx[i]+cx[j]);out[i]+=f;out[j]-=f;}if(y+1<h){const j=i+w,f=(a[j]-a[i])*.5*(cy[i]+cy[j]);out[i]+=f;out[j]-=f;}}return out;}
export function evolveDecay(w,h,photo,{steps=450,seed=17,colonies=10,balance=.5,moisture=.65,defense=.4,anisotropy=.7}={}){
 const n=w*h,Rw=new Float32Array(n),Rb=Rw.slice(),Hc=new Float32Array(n).fill(1),Hl=Hc.slice(),C=Rw.slice(),M=new Float32Array(n),gx=Rw.slice(),gy=Rw.slice(),orient=tensor({w,h,l:photo},3),isotropic=new Float32Array(n).fill(1);
 for(let i=0;i<n;i++){M[i]=clamp(moisture+(photo[i]-.5)*.15,0,1);C[i]=defense*photo[i]*.3;gx[i]=1-anisotropy*orient.ty[i]**2;gy[i]=1-anisotropy*orient.tx[i]**2;}
 for(let s=0;s<colonies;s++){const X=hash(s,41,seed)*w,Y=hash(s,42,seed)*h,field=hash(s,43,seed)<balance?Rw:Rb;for(let y=Math.max(0,Math.floor(Y-5));y<Math.min(h,Y+6);y++)for(let x=Math.max(0,Math.floor(X-5));x<Math.min(w,X+6);x++)field[y*w+x]=Math.max(field[y*w+x],Math.exp(-((x-X)**2+(y-Y)**2)/8)*.85);}
 const dt=.2;
 for(let t=0;t<steps;t++){
  const dw=decayDiffusion(Rw,w,h,gx,gy),db=decayDiffusion(Rb,w,h,gx,gy),dc=decayDiffusion(C,w,h,isotropic,isotropic),mx=Float32Array.from(gx,(v,i)=>v*(1+2*(1-(Hc[i]+Hl[i])/2))),my=Float32Array.from(gy,(v,i)=>v*(1+2*(1-(Hc[i]+Hl[i])/2))),dm=decayDiffusion(M,w,h,mx,my);
  for(let i=0;i<n;i++){
   const rw=Rw[i],rb=Rb[i],hc=Hc[i],hl=Hl[i],c=C[i],m=M[i],alpha=moistureActivity(m);
   Rw[i]=clamp(rw+dt*(.22*alpha*rw*(1-rw)*(.5*hl+.5*hc)*hc/(.2+hc)-defense*.2*c*rw+.35*dw[i]),0,1);
   Rb[i]=clamp(rb+dt*(.26*alpha*rb*(1-rb)*hc-defense*.2*c*rb+.3*db[i]),0,1);
   Hc[i]=clamp(hc+dt*(-.025*rw*hc-.05*rb*hc+.01*(1-hc)*c),0,1);
   Hl[i]=clamp(hl+dt*(-.04*rw*hl+.005*(1-hl)*c),0,1);
   C[i]=clamp(c+dt*(defense*.1*(rw+rb)*hc*hl*(1-c)-.035*c+.15*dc[i]),0,1);
   M[i]=clamp(m+dt*(.12*dm[i]+(1-m)*moisture*.006-(m-.1)*(1-moisture)*.012),0,1);
  }
 }return {Rw,Rb,Hc,Hl,C,M};
}
export function fungal(a,w,h,p){
 const g=grid(a,w,h,p.scale),photo=blur(g.l,g.w,g.h,2),f=evolveDecay(g.w,g.h,photo,{steps:p.time*5,seed:p.seed,colonies:p.colonies,balance:p.balance/100,moisture:p.moisture/100,defense:p.defense/100,anisotropy:p.fiber/100}),out=new Uint8ClampedArray(a.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=(x+.5)*g.w/w-.5,Y=(y+.5)*g.h/h-.5,i=(y*w+x)*4,hc=at(f.Hc,g.w,g.h,X,Y),hl=at(f.Hl,g.w,g.h,X,Y),rw=at(f.Rw,g.w,g.h,X,Y),rb=at(f.Rb,g.w,g.h,X,Y),c=at(f.C,g.w,g.h,X,Y),health=(hc+hl)/2;
  const slope=at(f.Hc,g.w,g.h,X+1,Y)-at(f.Hc,g.w,g.h,X-1,Y)+at(f.Hl,g.w,g.h,X,Y+1)-at(f.Hl,g.w,g.h,X,Y-1),strata=Math.cos((1-health)*p.rings*Math.PI*2),edge=1-smoothUnit((health-p.erosion/100)/.12),stain=clamp((rw+rb)*p.stain/100,0,1);
  for(let k=0;k<3;k++){
   const pigment=g.rgb[k],col=at(pigment,g.w,g.h,X+p.shift/50*rb,Y-p.shift/50*rw)*255,bleach=rw*(1-hl)*100,brown=rb*(1-hc)*[65,100,135][k],shade=1+slope*p.relief/25;
   const tissue=(col+bleach-brown)*(1-stain*.25)+strata*stain*36+c*p.stain*.7;
   out[i+k]=(tissue*shade)*(1-edge)+p.paper*2.55*edge;
  }out[i+3]=255;
 }return out;
}
