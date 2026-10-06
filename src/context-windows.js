import {clamp,sample,lum} from './pixels.js';
import {gaussianBlur} from './research-math.js';
export const contextDefaults={shape:1,columns:4,rows:2,size:65,stretch:100,bend:55,angle:25,smooth:12,detail:55,colour:0,ground:100,range:32,turn:0,ring:0,ringTone:50,compare:0};
export function contextGeometry(w,h,p={}){
 const q={...contextDefaults,...p},cols=Math.max(1,Math.round(q.columns)),rows=Math.max(1,Math.round(q.rows)),pw=q.compare===1?Math.floor(w/2):w,ph=q.compare===2?Math.floor(h/2):h,cw=Math.max(1,pw)/cols,ch=Math.max(1,ph)/rows;
 return{q,pw,ph,cw,ch,ratio:Math.min(w/Math.max(1,pw),h/Math.max(1,ph)),period:Math.min(Math.max(1,pw),Math.max(1,ph))/cols,rx:Math.max(.1,Math.min(cw,ch)*q.size/200*q.stretch/100),ry:Math.max(.1,Math.min(cw,ch)*q.size/200*100/q.stretch),ca:Math.cos(q.angle*Math.PI/180),sa:Math.sin(q.angle*Math.PI/180)};
}
export function contextCoverage(lx,ly,g){
 const{q,pw,ph,cw,ch,period,rx,ry,ca,sa}=g,u=(lx+.5-pw/2)*ca+(ly+.5-ph/2)*sa,v=-(lx+.5-pw/2)*sa+(ly+.5-ph/2)*ca;
 let edge;
 if(q.shape===1){
  const frequency=Math.PI*2*Math.round(q.rows)/Math.max(1,ph),bend=Math.sin(v*frequency)*q.bend/100*period*.7,gradient=Math.cos(v*frequency)*q.bend/100*period*.7*frequency,phase=((u+bend+period*.5)%period+period)%period-period*.5;
  edge=(period*q.size/200-Math.abs(phase))/Math.hypot(1,gradient);
 }else{
  edge=-Infinity;const ix=Math.floor(lx/cw),iy=Math.floor(ly/ch);
  // Union neighbouring ellipses so stretched windows do not stop at a cell edge.
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const x=lx+.5-(ix+dx+.5)*cw,y=ly+.5-(iy+dy+.5)*ch,ex=ca*x+sa*y,ey=-sa*x+ca*y,d=Math.hypot(ex/rx,ey/ry),gradient=d?Math.hypot(ex/(rx*rx),ey/(ry*ry))/d:1/Math.min(rx,ry);
   edge=Math.max(edge,(1-d)/gradient);
  }
 }
 return{edge,coverage:q.size?clamp(edge+.5,0,1):0,ring:q.size&&q.ring?clamp(q.ring/100*Math.min(cw,ch)*.1-Math.abs(edge)+.5,0,1):0};
}
export function contextField(a,w,h,p={}){
 const q={...contextDefaults,...p},factor=Math.min(1,384/Math.max(w,h)),gw=Math.max(1,Math.round(w*factor)),gh=Math.max(1,Math.round(h*factor));
 const sums=new Float64Array(gw*gh),weights=new Float64Array(gw*gh);
 // Every native pixel contributes its area, including fractional boundary cells.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const x0=x*gw/w,x1=(x+1)*gw/w,y0=y*gh/h,y1=(y+1)*gh/h,v=lum(a,(y*w+x)*4)/255;
  for(let gy=Math.floor(y0);gy<Math.min(gh,Math.ceil(y1));gy++)for(let gx=Math.floor(x0);gx<Math.min(gw,Math.ceil(x1));gx++){
   const z=Math.max(0,Math.min(x1,gx+1)-Math.max(x0,gx))*Math.max(0,Math.min(y1,gy+1)-Math.max(y0,gy)),i=gy*gw+gx;sums[i]+=v*z;weights[i]+=z;
  }
 }
 const l=Float32Array.from(sums,(v,i)=>weights[i]?v/weights[i]:0),sigma=q.smooth/100*Math.min(gw,gh)*.13;
 return {w:gw,h:gh,l:gaussianBlur(l,gw,gh,sigma),raw:l};
}
export function contextWindows(a,w,h,p={}){
 const q={...contextDefaults,...p},g=contextField(a,w,h,q),geo=contextGeometry(w,h,q),{pw,ph,ratio}=geo,out=new Uint8ClampedArray(a.length),ct=Math.cos(q.turn*Math.PI/180),st=Math.sin(q.turn*Math.PI/180),dd=q.detail/100,cc=q.colour/100,slope=q.range/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,panel=q.compare===1?(x>=w-pw?1:0):q.compare===2?(y>=h-ph?1:0):0,lx=panel&&q.compare===1?x-(w-pw):x,ly=panel&&q.compare===2?y-(h-ph):y;
  if((q.compare===1&&w%2&&x===pw)||(q.compare===2&&h%2&&y===ph)||pw===0||ph===0){out[i]=out[i+1]=out[i+2]=128;out[i+3]=255;continue;}
  const{coverage,ring:ringCov}=contextCoverage(lx,ly,geo);
  const ix=(lx+.5-pw/2)*ratio+w/2-.5,iy=(ly+.5-ph/2)*ratio+h/2-.5,sx=(ix+.5-w/2)*ct-(iy+.5-h/2)*st+w/2-.5,sy=(ix+.5-w/2)*st+(iy+.5-h/2)*ct+h/2-.5;
  const rgb=[0,1,2].map(c=>sample(a,w,h,ix,iy,c)),nativeL=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)/255;
  const inside=sample(g.l,g.w,g.h,(ix+.5)*g.w/w-.5,(iy+.5)*g.h/h-.5,0,1)*(1-dd)+nativeL*dd;
  const outerRGB=q.turn?[0,1,2].map(c=>sample(a,w,h,sx,sy,c)):rgb,outerL=(outerRGB[0]*.2126+outerRGB[1]*.7152+outerRGB[2]*.0722)/255;
  const outer=q.turn?sample(g.l,g.w,g.h,(sx+.5)*g.w/w-.5,(sy+.5)*g.h/h-.5,0,1)*(1-dd)+outerL*dd:inside;
  const low=(1-slope)*(q.compare?panel?100-q.ground:q.ground:q.ground)/100;
  for(let c=0;c<3;c++){
   const inner=inside+cc*(rgb[c]/255-nativeL),outerC=outer+cc*(outerRGB[c]/255-outerL);
   const v=inner*coverage+(low+slope*outerC)*(1-coverage);out[i+c]=(v*(1-ringCov)+q.ringTone/100*ringCov)*255;
  }out[i+3]=255;
 }
 return out;
}
