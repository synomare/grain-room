import {hash,clamp,sample} from './pixels.js';
import {grid,tensor,at} from './research-math.js';
import {mirror} from './field-marbling.js';
const TAU=2*Math.PI;
const mod=(a,b)=>(a%b+b)%b;
// Arclength starts at the upper flank midpoint; it is independent of radius.
export function capsuleChart(x,y,length){
 const half=length/2,dx=x-clamp(x,-half,half),s=Math.hypot(dx,y),P=2*length+TAU*s;
 if(s<1e-15)return {s:0,v:0};
 let d;
 if(x>half)d=half+s*(Math.PI/2-Math.atan2(y,x-half));
 else if(x< -half){let a=Math.atan2(y,x+half);if(a>0)a-=TAU;d=1.5*length+Math.PI*s+s*(-Math.PI/2-a);}
 else if(y>=0)d=x>=0?x:P+x;
 else d=length+Math.PI*s-x;
 return {s,v:mod(d/P,1)};
}
export function capsulePoint(s,v,length){
 const half=length/2,P=2*length+TAU*s,d=mod(v,1)*P;
 if(d<half)return [d,s];
 if(d<half+Math.PI*s){const t=Math.PI/2-(d-half)/s;return [half+s*Math.cos(t),s*Math.sin(t)];}
 if(d<1.5*length+Math.PI*s)return [length+Math.PI*s-d,-s];
 if(d<1.5*length+TAU*s){const t=-Math.PI/2-(d-1.5*length-Math.PI*s)/s;return [-half+s*Math.cos(t),s*Math.sin(t)];}
 return [d-P,s];
}
export function capsuleMap(x,y,length,radius,inverse=false){
 if(radius===0)return [x,y];
 const {s,v}=capsuleChart(x,y,length);
 if(inverse&&s<=radius)return null;
 const area=inverse?(s-radius)*(2*length+Math.PI*(s+radius)):2*length*(s+radius)+Math.PI*(s*s+radius*radius);
 const target=area/(length+Math.sqrt(length*length+Math.PI*area));
 return capsulePoint(target,v,length);
}
export function deposition(a,w,h,p){
 if(p.radius===0||p.drops===0)return a.slice();
 const edge=Math.max(w,h),g=grid(a,w,h,180),t=tensor(g,3),strokes=[];
 for(let k=0;k<p.drops;k++){
  let x=0,y=0,best=-1;
  for(let n=0;n<5;n++){const u=hash(k,n*2,p.seed)*w,v=hash(k,n*2+1,p.seed)*h,score=at(g.l,g.w,g.h,u/w*g.w,v/h*g.h)*(.6+.4*hash(k,n+14,p.seed));if(score>best){best=score;x=u;y=v;}}
  const angle=at(t.angle,g.w,g.h,x/w*g.w,y/h*g.h)+(hash(k,22,p.seed)-.5)*p.cross/100*Math.PI;
  const length=p.length/1000*edge*(.25+hash(k,23,p.seed)),radius=p.radius/1000*edge*(.4+.8*hash(k,24,p.seed));
  strokes.push({x,y,length,radius,c:Math.cos(angle),s:Math.sin(angle)});
 }
 const out=new Uint8ClampedArray(a.length),texture=p.texture/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let u=x,v=y,deposit=null,localX=0,localY=0,depth=0;
  for(let k=strokes.length-1;k>=0;k--){
   const s=strokes[k],dx=u-s.x,dy=v-s.y,lx=s.c*dx+s.s*dy,ly=-s.s*dx+s.c*dy,chart=capsuleChart(lx,ly,s.length);
   if(chart.s<=s.radius){deposit=s;localX=lx;localY=ly;depth=chart.s/s.radius;break;}
   const q=capsuleMap(lx,ly,s.length,s.radius,true);u=s.x+s.c*q[0]-s.s*q[1];v=s.y+s.s*q[0]+s.c*q[1];
  }
  const i=(y*w+x)*4;
  if(deposit){
   const s=deposit,band=Math.sin(depth*46+Math.sin(localX/edge*35)*2),spread=(.25+depth*depth)*edge*.18;
   const sx=s.x+s.c*localX-s.s*spread,sy=s.y+s.s*localX+s.c*spread;
   const rim=1-.15*Math.exp(-(((1-depth)*24)**2)),sheen=p.gloss/100*(.025*band+.07*Math.exp(-(((depth-.92)/.025)**2)));
   for(let c=0;c<3;c++){const base=sample(a,w,h,s.x,s.y,c),picked=sample(a,w,h,mirror(sx,w),mirror(sy,h),c);out[i+c]=(base*(1-texture)+picked*texture)*rim+sheen*255;}
  }else for(let c=0;c<3;c++)out[i+c]=sample(a,w,h,mirror(u,w),mirror(v,h),c);
  out[i+3]=255;
 }
 return out;
}
