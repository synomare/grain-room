import {clamp,hash,sample,map} from './pixels.js';
import {grid,at,blur,gaussianBlur,tensor,expand} from './research-math.js';
export function kuwahara(a,w,h,p){
 const g=grid(a,w,h,600),{w:gw,h:gh,rgb}=g,t=tensor(g,3),out=rgb.map(()=>new Float32Array(gw*gh)),radius=p.radius*Math.max(gw,gh)/1000,points=[];
 // Overlapping polar sectors with shared center samples.
 for(let k=0;k<8;k++){const list=[];for(let r=1;r<=3;r++)for(let j=-1;j<=1;j++){const angle=k*Math.PI/4+j*Math.PI/8;list.push([Math.cos(angle)*r/3,Math.sin(angle)*r/3,Math.exp(-r*r/9)]);}points.push(list);}
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
  const i=y*gw+x,angle=t.angle[i],co=Math.cos(angle),si=Math.sin(angle),anis=t.coherence[i]*p.anisotropy/100,rx=radius*(1+anis*2),ry=radius/(1+anis*1.5);
  let sr=0,sg=0,sb=0,sw=0;
  for(let k=0;k<8;k++){
   const m=[rgb[0][i],rgb[1][i],rgb[2][i]],sq=[m[0]**2,m[1]**2,m[2]**2];let count=1;
   for(const [u,v,weight] of points[k]){
    const xx=x+u*rx*co-v*ry*si,yy=y+u*rx*si+v*ry*co;
    for(let c=0;c<3;c++){const z=at(rgb[c],gw,gh,xx,yy);m[c]+=z*weight;sq[c]+=z*z*weight;}count+=weight;
   }
   for(let c=0;c<3;c++)m[c]/=count;
   const variance=Math.max(0,(sq[0]+sq[1]+sq[2])/count-m[0]**2-m[1]**2-m[2]**2);
   const weight=1/(1+Math.pow(variance*180,1+p.sharpness/25));
   sr+=m[0]*weight;sg+=m[1]*weight;sb+=m[2]*weight;sw+=weight;
  }out[0][i]=sr/sw;out[1][i]=sg/sw;out[2][i]=sb/sw;
 }return expand(out,gw,gh,w,h);
}
export function lic(a,w,h,p){
 const g=grid(a,w,h,600),{w:gw,h:gh,l,rgb}=g,t=tensor(g,Math.max(1,p.scale)),n=gw*gh,noise=new Float32Array(n),woven=new Float32Array(n);
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++)noise[y*gw+x]=hash(Math.floor(x/p.scale),Math.floor(y/p.scale),p.seed);
 const steps=Math.round(p.length/2);
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
  let sum=noise[y*gw+x],weight=1;
  for(const sign of [-1,1]){
   let xx=x,yy=y,px=t.tx[y*gw+x]*sign,py=t.ty[y*gw+x]*sign;
   for(let k=1;k<=steps;k++){
    let vx=at(t.tx,gw,gh,xx,yy),vy=at(t.ty,gw,gh,xx,yy);if(vx*px+vy*py<0){vx=-vx;vy=-vy;}
    const len=Math.hypot(vx,vy)||1;px=vx/len;py=vy/len;xx+=px;yy+=py;
    const wt=.5+.5*Math.cos(k/(steps+1)*Math.PI);sum+=at(noise,gw,gh,xx,yy)*wt;weight+=wt;
   }
  }woven[y*gw+x]=clamp(.5+(sum/weight-.5)*4,0,1);
 }
 const out=rgb.map(()=>new Float32Array(n));
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
  const i=y*gw+x,v=woven[i],bump=(at(woven,gw,gh,x-1,y-1)-at(woven,gw,gh,x+1,y+1))*p.emboss/120;
  const strength=.3+.7*t.coherence[i];
  for(let c=0;c<3;c++)out[c][i]=rgb[c][i]*(1+((.35+v*1.1)-1)*strength)+(bump+.06*v)*strength;
 }return expand(out,gw,gh,w,h);
}
export function xdog(a,w,h,p){
 const g=grid(a,w,h,800),{w:gw,h:gh,l,rgb}=g,sigma=Math.max(.4,p.radius*Math.max(gw,gh)/1000),g1=gaussianBlur(l,gw,gh,sigma),g2=gaussianBlur(l,gw,gh,sigma*1.6),out=rgb.map(()=>new Float32Array(l.length));
 for(let i=0;i<l.length;i++){
  const d=(1+p.detail*.6)*g1[i]-p.detail*.6*g2[i],threshold=p.threshold/100*.8,ink=d>=threshold?1:1+Math.tanh(6*(d-threshold));
  for(let c=0;c<3;c++){const tone=Math.round(rgb[c][i]*5)/5;out[c][i]=(.08+tone*.82)*ink+.04;}
 }return expand(out,gw,gh,w,h);
}
