import {sample, hash} from './pixels.js';

export const entangledMatterDefaults = {scale:200, pressure:80, fracture:70, depth:6, stretch:80, relief:45, bleach:15, spread:20, seed:17};
const clamp = (x,a=0,b=1) => Math.max(a,Math.min(b,x));
export function reflectMatter(x,n) {
  if(n<=1)return 0;
  const z=n-1; x=((x%(2*z))+2*z)%(2*z);
  return x>z?2*z-x:x;
}
export function matterNoise(x,y,seed) {
  const X=Math.floor(x),Y=Math.floor(y),u=x-X,v=y-Y,s=u*u*(3-2*u),t=v*v*(3-2*v);
  return (hash(X,Y,seed)*(1-s)+hash(X+1,Y,seed)*s)*(1-t)+(hash(X,Y+1,seed)*(1-s)+hash(X+1,Y+1,seed)*s)*t;
}
// Every input pixel contributes. This field only guides geometry; texture stays native.
export function matterAnalysis(a,w,h) {
  const e=Math.min(128,Math.max(w,h)),fw=Math.max(1,Math.round(w/Math.max(w,h)*e)),fh=Math.max(1,Math.round(h/Math.max(w,h)*e));
  const field=new Float32Array(fw*fh*4),count=new Uint32Array(fw*fh);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,j=Math.min(fh-1,Math.floor(y/h*fh))*fw+Math.min(fw-1,Math.floor(x/w*fw));
    for(let c=0;c<3;c++)field[j*4+c]+=a[i+c]/255;
    const l=(a[i]+a[i+1]+a[i+2])/765;field[j*4+3]+=l*l;count[j]++;
  }
  for(let j=0;j<count.length;j++){
    for(let c=0;c<4;c++)field[j*4+c]/=count[j]||1;
    const l=(field[j*4]+field[j*4+1]+field[j*4+2])/3;
    field[j*4+3]=Math.sqrt(Math.max(0,field[j*4+3]-l*l));
  }
  return {field,w:fw,h:fh,count};
}
// Edge cells retain their true area, including odd image dimensions.
export function matterPyramid(a,w,h) {
  const levels=[{a,w,h}],W=w,H=h;let size=1;
  while(w>1||h>1){
    const nw=Math.ceil(w/2),nh=Math.ceil(h/2),b=new Float32Array(nw*nh*4);
    for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){
      let n=0;
      for(let yy=y*2;yy<Math.min(h,y*2+2);yy++)for(let xx=x*2;xx<Math.min(w,x*2+2);xx++){
        const weight=Math.min(size,W-xx*size)*Math.min(size,H-yy*size);
        for(let c=0;c<3;c++)b[(y*nw+x)*4+c]+=a[(yy*w+xx)*4+c]*weight;
        n+=weight;
      }
      for(let c=0;c<3;c++)b[(y*nw+x)*4+c]/=n;
      b[(y*nw+x)*4+3]=255;
    }
    levels.push({a:b,w:nw,h:nh});a=b;w=nw;h=nh;size*=2;
  }
  return levels;
}
export function matterContext(a,w,h,q={}) {
  const p={...entangledMatterDefaults,...q},E=Math.max(w,h),F=matterAnalysis(a,w,h),cache=new Map();
  const node=(d,ax,ay,space)=>{
    const key=`${d},${ax},${ay}`;
    if(cache.has(key))return cache.get(key);
    const xx=(ax+.5)*space*E/w*(F.w-1),yy=(ay+.5)*space*E/h*(F.h-1),C=[0,1,2,3].map(c=>sample(F.field,F.w,F.h,xx,yy,c));
    const activity=clamp(Math.max(...C.slice(0,3))-Math.min(...C.slice(0,3))+C[3]*4),s=p.seed+d*101,cell=hash(ax,ay,s+47);
    const angle=((hash(ax,ay,s+81)-.5)*3+(C[0]-C[2])*.6)*p.pressure/100;
    const n={id:cache.size+1,activity,C,co:Math.cos(angle),si:Math.sin(angle),
      gain:1+hash(ax,ay,s+37)**2*5*p.fracture/100,
      stretch:2**((hash(ax,ay,s+43)-.5)*6*p.stretch/100),
      freq:4+cell*9,phase:cell*11,
      offX:(hash(ax,ay,s+49)-.5)*p.pressure/100*.34,
      offY:(hash(ax,ay,s+53)-.5)*p.pressure/100*.34};
    cache.set(key,n);return n;
  };
  return {p,E,F,node,w,h,cache};
}
// Output coordinates are pixel-centre positions (integer x/y at the pixel centre).
export function matterMap(ctx,x,y) {
  const {p,E,F,node,w,h}=ctx,X=(x+.5)/E,Y=(y+.5)/E,fx=x/w*(F.w-1),fy=y/h*(F.h-1);
  const R=sample(F.field,F.w,F.h,fx,fy,0),G=sample(F.field,F.w,F.h,fx,fy,1),B=sample(F.field,F.w,F.h,fx,fy,2),V=sample(F.field,F.w,F.h,fx,fy,3);
  const strength=p.spread/100+(1-p.spread/100)*clamp((Math.max(R,G,B)-Math.min(R,G,B))*1.7+V*7);
  const u=X+(matterNoise(X*3.3,Y*3.3,p.seed)-.5+(R-B)*.5)*p.pressure/100*.28;
  const v=Y+(matterNoise(X*3.3+9,Y*3.3,p.seed+1)-.5+(R+B-1)*.25)*p.pressure/100*.28;
  let space=p.scale/1000,n,ax,ay,d=0;
  for(;d<=p.depth;d++){
    ax=Math.floor(u/space);ay=Math.floor(v/space);n=node(d,ax,ay,space);
    if(d===p.depth||space*E<4||d>0&&hash(ax,ay,p.seed+d*39)>(p.fracture/100*.68+n.activity*.25))break;
    space*=.5;
  }
  const U=u/space-ax-.5,Vv=v/space-ay-.5,bend=Math.sin(U*n.freq+Vv*3+n.phase)*.15*p.pressure/100;
  const A=(U+bend)*space*n.gain*n.stretch,Bb=(Vv+.12*Math.sin(U*5+n.phase)*p.pressure/100)*space*n.gain/n.stretch;
  const sx=((ax+.5)*space+A*n.co-Bb*n.si+n.offX)*E-.5,sy=((ay+.5)*space+A*n.si+Bb*n.co+n.offY)*E-.5;
  return {sx:x+(sx-x)*strength,sy:y+(sy-y)*strength,id:n.id,depth:d,strength,
    shade:1+((.76+.42*Math.cos(U*n.freq+Vv*3+n.phase))-1)*p.relief/100*strength};
}
export function matterFootprint(dx,dy) {
  const aa=dx[0]**2+dy[0]**2,bb=dx[1]**2+dy[1]**2,ab=dx[0]*dx[1]+dy[0]*dy[1],disc=Math.hypot(aa-bb,2*ab);
  const major=Math.sqrt(Math.max(0,(aa+bb+disc)/2)),minor=Math.sqrt(Math.max(0,(aa+bb-disc)/2)),foot=Math.max(1,minor,major/8);
  const angle=.5*Math.atan2(2*ab,aa-bb);
  return {major,minor,lod:Math.log2(foot),taps:Math.min(8,Math.max(1,Math.ceil(major/foot-1e-7))),vx:Math.cos(angle),vy:Math.sin(angle)};
}
export function matterSample(levels,x,y,foot,out=[0,0,0]) {
  out.fill(0);const lod=clamp(foot.lod,0,levels.length-1),lo=Math.floor(lod),hi=Math.min(lo+1,levels.length-1),f=lod-lo;
  for(let k=0;k<foot.taps;k++){
    const t=((k+.5)/foot.taps-.5)*foot.major;
    const xx=reflectMatter(x+foot.vx*t,levels[0].w),yy=reflectMatter(y+foot.vy*t,levels[0].h);
    for(const [level,weight]of [[lo,1-f],[hi,f]]){
      if(!weight)continue;
      const L=levels[level],s=2**level;
      for(let c=0;c<3;c++)out[c]+=sample(L.a,L.w,L.h,(xx+.5)/s-.5,(yy+.5)/s-.5,c)*weight/foot.taps;
    }
  }
  return out;
}
export function entangledMatter(a,w,h,q={}) {
  const neutral={...entangledMatterDefaults,...q};
  if(['pressure','fracture','stretch','relief','bleach'].every(k=>neutral[k]===0)){const b=new Uint8ClampedArray(a);for(let i=3;i<b.length;i+=4)b[i]=255;return b;}
  const ctx=matterContext(a,w,h,q),{p}=ctx,out=new Uint8ClampedArray(a.length),uv=new Float32Array(w*h*2),ids=new Uint32Array(w*h),shades=new Float32Array(w*h),levels=matterPyramid(a,w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,r=matterMap(ctx,x,y);uv[i*2]=r.sx;uv[i*2+1]=r.sy;ids[i]=r.id;shades[i]=r.shade;
  }
  const scratch=[0,0,0];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,j=i*4,sx=uv[i*2],sy=uv[i*2+1];
    const nextX=x<w-1?i+1:-1,prevX=x>0?i-1:-1,nextY=y<h-1?i+w:-1,prevY=y>0?i-w:-1;
    const adjacent=(a,b,fallback)=>a>=0&&ids[a]===ids[i]?[uv[a*2]-sx,uv[a*2+1]-sy]:b>=0&&ids[b]===ids[i]?[sx-uv[b*2],sy-uv[b*2+1]]:fallback;
    const foot=matterFootprint(adjacent(nextX,prevX,[1,0]),adjacent(nextY,prevY,[0,1]));
    const edge=[nextX,prevX,nextY,prevY].some(k=>k>=0&&ids[k]!==ids[i]);
    const C=[0,0,0];
    // Four subpixel memberships soften fragment boundaries without blurring whole cells.
    if(edge){
      for(const oy of[-.25,.25])for(const ox of[-.25,.25]){
        const r=matterMap(ctx,x+ox,y+oy);matterSample(levels,r.sx,r.sy,foot,scratch);
        for(let c=0;c<3;c++)C[c]+=scratch[c]*r.shade*.25;
      }
    }else{
      matterSample(levels,sx,sy,foot,scratch);for(let c=0;c<3;c++)C[c]=scratch[c]*shades[i];
    }
    const grey=C[0]*.2126+C[1]*.7152+C[2]*.0722;
    for(let c=0;c<3;c++)out[j+c]=C[c]*(1-p.bleach/100)+(grey*.7+65)*p.bleach/100;
    out[j+3]=255;
  }
  return out;
}
