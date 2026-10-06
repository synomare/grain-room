// Scale-periodic complex-log photo mapping; see NESTED-PHOTO.md.
import{photoPyramid,pyramidPhoto}from'./meromorphic-photo.js';
export const nestedPhotoDefaults={ratio:18,spin:2,phase:0,angle:0,zoom:100,centerX:50,centerY:50,sourceX:50,sourceY:50,crop:100,round:0,gap:1,shade:30,paper:97};
const TAU=Math.PI*2,clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)),smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export function nestedMapping(w,h,p){const L=Math.log(100/p.ratio);return{w,h,p,L,beta:p.spin*L/TAU,zoom:100/p.zoom,angle:p.angle*Math.PI/180};}
export function nestedPoint(x,y,m,q=new Float64Array(7)){
 const{w,h,p,L,beta,zoom}=m,X=(2*(x+.5)/w-p.centerX/50)*zoom,Y=(2*(y+.5)/h-p.centerY/50)*zoom,rr=X*X+Y*Y,r=Math.sqrt(rr);
 if(r<1e-12){q[0]=q[1]=0;q[2]=1e12;q[3]=1;q[4]=1;q[5]=0;q[6]=0;return q;}
 const logR=Math.log(r),theta=Math.atan2(Y,X)+m.angle,A=logR+beta*theta+p.phase/100*L,B=theta-beta*logR,c=Math.cos(B),s=Math.sin(B),logBound=-(1-p.round/100)*Math.log(Math.max(Math.abs(c),Math.abs(s))),level=Math.ceil((A-logBound)/L),rf=Math.exp(A-level*L),ux=rf*c,uy=rf*s,phase=(logBound-Math.log(rf))/L,edge=Math.min(phase,1-phase),width=p.gap/100,cover=p.gap?smooth((edge-width*.5)/.006):1;
 const nr=ux+beta*uy,ni=uy-beta*ux,dr=(nr*X+ni*Y)/rr,di=(ni*X-nr*Y)/rr,C=p.crop/100*zoom,ja=dr*C,jb=-di*C*w/h,jc=di*C*h/w,jd=dr*C,trace=ja*ja+jb*jb+jc*jc+jd*jd,det=(ja*jd-jb*jc)**2,footprint=Math.sqrt(Math.max(0,(trace+Math.sqrt(Math.max(0,trace*trace-4*det)))/2));
 q[0]=p.sourceX/100*w-.5+ux*w/2*p.crop/100;q[1]=p.sourceY/100*h-.5+uy*h/2*p.crop/100;q[2]=footprint;q[3]=cover;q[4]=1-p.shade/100*(phase*phase*.6);q[5]=level;q[6]=phase;
 if(q[0]<-.5||q[0]>w-.5||q[1]<-.5||q[1]>h-.5)q[3]=0;
 return q;
}
export function nestedPhoto(a,w,h,params={}){const p={...nestedPhotoDefaults,...params},m=nestedMapping(w,h,p),levels=photoPyramid(a,w,h),out=new Uint8ClampedArray(a.length),q=new Float64Array(7),paper=p.paper*2.55,center=levels.at(-1).a;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=(y*w+x)*4;let R=0,G=0,B=0;for(const yy of[-.25,.25])for(const xx of[-.25,.25]){nestedPoint(x+xx,y+yy,m,q);const cov=q[3],read=c=>q[2]>1e10?center[c]:pyramidPhoto(levels,w,h,q[0],q[1],q[2],c,false),shade=q[4];R+=paper*(1-cov)+read(0)*shade*cov;G+=paper*(1-cov)+read(1)*shade*cov;B+=paper*(1-cov)+read(2)*shade*cov;}out[j]=R/4;out[j+1]=G/4;out[j+2]=B/4;out[j+3]=255;}
 return out;
}
