import {sample,clamp} from './pixels.js';

export const meromorphicDefaults={order:3,poles:2,zeroRadius:90,zeroAngle:6,poleRadius:74,poleAngle:332,zoom:100,angle:0,offsetX:0,offsetY:0,crop:64,edge:0,paper:96};
const turn=a=>((a%360)+360)%360;
const gcd=(a,b)=>b?gcd(b,a%b):a;
function binomial(n,r,i){const a=new Float64Array((n+1)*2);a[0]=-r;a[1]=-i;a[n*2]=1;return a;}
function monomial(n){const a=new Float64Array((n+1)*2);a[n*2]=1;return a;}
function quotientBinomial(n,g,cr,ci){
 const a=new Float64Array((n-g+1)*2);let r=1,i=0;
 for(let k=n-g;k>=0;k-=g){a[k*2]=r;a[k*2+1]=i;const previous=r;r=previous*cr-i*ci;i=previous*ci+i*cr;}
 return a;
}
export function rationalShape(p){
 const za=turn(p.order*p.zeroAngle)*Math.PI/180,pa=turn(p.poles*p.poleAngle)*Math.PI/180,zr=(p.zeroRadius/100)**p.order,pr=(p.poleRadius/100)**p.poles;
 const s={order:p.order,poles:p.poles,ar:zr*Math.cos(za),ai:zr*Math.sin(za),br:pr*Math.cos(pa),bi:pr*Math.sin(pa),cancel:false,cancelled:0};
 s.numerator=binomial(p.order,s.ar,s.ai);s.denominator=p.poles?binomial(p.poles,s.br,s.bi):monomial(0);
 if(p.poles&&p.zeroRadius===p.poleRadius){
  if(p.zeroRadius===0){const power=p.order-p.poles;s.numerator=monomial(Math.max(0,power));s.denominator=monomial(Math.max(0,-power));s.cancelled=Math.min(p.order,p.poles);}
  else{
   const g=gcd(p.order,p.poles);let theta=null;
   for(let k=0;k<p.order;k++){const angle=p.zeroAngle+360*k/p.order;if(turn(p.poles*(angle-p.poleAngle))===0){theta=angle;break;}}
   if(theta!==null){const r=(p.zeroRadius/100)**g,angle=turn(g*theta)*Math.PI/180,cr=r*Math.cos(angle),ci=r*Math.sin(angle);s.numerator=quotientBinomial(p.order,g,cr,ci);s.denominator=quotientBinomial(p.poles,g,cr,ci);s.cancelled=g;}
  }
 }
 s.cancel=s.numerator.length===2&&s.denominator.length===2;return s;
}
// Smith's scaled complex division avoids squaring a very small denominator.
export function divideComplex(nr,ni,dr,di,out=new Float64Array(2),offset=0){
 if(dr===0&&di===0)return false;
 if(Math.abs(dr)>=Math.abs(di)){const ratio=di/dr,den=dr+di*ratio;out[offset]=(nr+ni*ratio)/den;out[offset+1]=(ni-nr*ratio)/den;}
 else{const ratio=dr/di,den=di+dr*ratio;out[offset]=(nr*ratio+ni)/den;out[offset+1]=(ni*ratio-nr)/den;}
 return Number.isFinite(out[offset])&&Number.isFinite(out[offset+1]);
}
// f=(z^m-a)/(z^n-b), or z^m-a when n=0. Slot 4 marks a pole.
// Shared binomial factors are removed before evaluation, including multiplicity
// at the origin. This distinguishes genuine poles from removable singularities.
export function rationalField(x,y,s,out=new Float64Array(5)){
 if(s.cancel){out[0]=1;out[1]=out[2]=out[3]=out[4]=0;return out;}
 const n=s.numerator,d=s.denominator;let nr=n[n.length-2],ni=n[n.length-1],npr=0,npi=0,dr=d[d.length-2],di=d[d.length-1],dpr=0,dpi=0;
 for(let k=n.length-4;k>=0;k-=2){
  const oldR=nr,oldI=ni,oldDerivative=npr;npr=npr*x-npi*y+oldR;npi=oldDerivative*y+npi*x+oldI;nr=oldR*x-oldI*y+n[k];ni=oldR*y+oldI*x+n[k+1];
 }
 for(let k=d.length-4;k>=0;k-=2){
  const oldR=dr,oldI=di,oldDerivative=dpr;dpr=dpr*x-dpi*y+oldR;dpi=oldDerivative*y+dpi*x+oldI;dr=oldR*x-oldI*y+d[k];di=oldR*y+oldI*x+d[k+1];
 }
 if(!divideComplex(nr,ni,dr,di,out)){out[0]=out[1]=out[2]=out[3]=0;out[4]=1;return out;}
 const derivativeR=npr-out[0]*dpr+out[1]*dpi,derivativeI=npi-out[0]*dpi-out[1]*dpr;
 out[4]=divideComplex(derivativeR,derivativeI,dr,di,out,2)?0:1;return out;
}
export function photoPyramid(a,w,h){
 const levels=[{a,w,h,scale:1}];let scale=1;
 while(w>1||h>1){
  const W=Math.ceil(w/2),H=Math.ceil(h/2),b=new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let c=0;c<4;c++){
   let sum=0;for(let j=0;j<2;j++)for(let k=0;k<2;k++)sum+=a[(Math.min(h-1,2*y+j)*w+Math.min(w-1,2*x+k))*4+c];b[(y*W+x)*4+c]=sum/4;
  }
  scale*=2;levels.push({a:b,w:W,h:H,scale});a=b;w=W;h=H;
 }return levels;
}
export function mirrorPhoto(x,size){
 if(size<=1)return 0;const period=2*(size-1),q=((x%period)+period)%period;return q<=size-1?q:period-q;
}
export function photoMap(w,h,p){
 const size=Math.min(w,h),angle=p.angle*Math.PI/180;
 return {shape:rationalShape(p),w,h,cx:w/2-.5,cy:h/2-.5,step:2/size*100/p.zoom,sourceScale:size/2*p.crop/100,ratio:p.crop/p.zoom,co:Math.cos(angle),si:Math.sin(angle),ox:p.offsetX/100,oy:p.offsetY/100};
}
export function mappedPhoto(x,y,map,out=new Float64Array(5)){
 const X=(x-map.cx)*map.step,Y=(y-map.cy)*map.step;
 rationalField(X*map.co-Y*map.si+map.ox,X*map.si+Y*map.co+map.oy,map.shape,out);
 if(!out[4]){out[0]=map.cx+out[0]*map.sourceScale;out[1]=map.cy+out[1]*map.sourceScale;out[2]=Math.hypot(out[2],out[3])*map.ratio;}
 return out;
}
export function pyramidPhoto(levels,w,h,x,y,footprint,c,mirror=true){
 const lod=clamp(Math.log2(Math.max(1,footprint)),0,levels.length-1),lo=Math.floor(lod),hi=Math.min(lo+1,levels.length-1),fraction=lod-lo;
 if(mirror){x=mirrorPhoto(x,w);y=mirrorPhoto(y,h);}
 const read=L=>sample(L.a,L.w,L.h,(x+.5)/L.scale-.5,(y+.5)/L.scale-.5,c);
 return read(levels[lo])*(1-fraction)+read(levels[hi])*fraction;
}
export function meromorphicPhoto(a,w,h,p){
 const levels=photoPyramid(a,w,h),map=photoMap(w,h,p),out=new Uint8ClampedArray(a.length),q=new Float64Array(5),s=new Float64Array(5),last=levels.at(-1),paper=p.paper*2.55;
 const read=(value,c)=>value[4]?last.a[c]:pyramidPhoto(levels,w,h,value[0],value[1],value[2],c,p.edge===0);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;mappedPhoto(x,y,map,q);
  if(p.edge===0){for(let c=0;c<3;c++)out[i+c]=Math.round(read(q,c)*1e9)/1e9;}
  else{
   // Check the actual map at four quarter-pixel locations. A first derivative
   // can miss a clip edge when a small image straddles a pole or critical point.
    let red=0,green=0,blue=0,inside=0;
    for(const dy of [-.25,.25])for(const dx of [-.25,.25]){
     mappedPhoto(x+dx,y+dy,map,s);
     if(s[4]||s[0]<-.5||s[0]>w-.5||s[1]<-.5||s[1]>h-.5){red+=paper;green+=paper;blue+=paper;}
     else{inside++;red+=read(s,0);green+=read(s,1);blue+=read(s,2);}
    }
    if(inside===4&&!q[4]){for(let c=0;c<3;c++)out[i+c]=Math.round(read(q,c)*1e9)/1e9;}
    else{out[i]=Math.round(red/4*1e9)/1e9;out[i+1]=Math.round(green/4*1e9)/1e9;out[i+2]=Math.round(blue/4*1e9)/1e9;}
  }
  out[i+3]=255;
 }return out;
}
