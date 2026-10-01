import {grid,at,expand} from './research-math.js';
import {clamp,hash} from './pixels.js';

// A vertical minimum-cost seam, including its first and last row.
export function minimumSeam(cost,w,h){
 const dp=new Float64Array(cost),previous=new Int32Array(w*h),path=new Int32Array(h);
 for(let y=1;y<h;y++)for(let x=0;x<w;x++){
  let best=x;for(let k=Math.max(0,x-1);k<=Math.min(w-1,x+1);k++)if(dp[(y-1)*w+k]<dp[(y-1)*w+best])best=k;
  dp[y*w+x]+=dp[(y-1)*w+best];previous[y*w+x]=best;
 }
 let end=0;for(let x=1;x<w;x++)if(dp[(h-1)*w+x]<dp[(h-1)*w+end])end=x;
 for(let y=h-1;y>=0;y--){path[y]=end;end=previous[y*w+end];}return path;
}

export function quilt(a,width,height,p){
 if(!p.scatter)return a.slice();
 const g=grid(a,width,height,700),{w,h,rgb}=g,edge=Math.max(w,h),block=Math.max(4,Math.round(p.size*edge/1000)),overlap=Math.max(1,Math.round(block*.24)),step=block-overlap;
 const out=rgb.map(v=>new Float32Array(v.length)),zoom=p.magnify/100;
 let tile=0;
 for(let oy=0;oy<h;oy+=step)for(let ox=0;ox<w;ox+=step,tile++){
  const bw=Math.min(block,w-ox),bh=Math.min(block,h-oy),ow=Math.min(overlap,bw),oh=Math.min(overlap,bh);
  const read=(c,sx,sy,x,y)=>at(rgb[c],w,h,sx+(x-bw/2)/zoom,sy+(y-bh/2)/zoom);
  let best=Infinity,bx=ox+bw/2,by=oy+bh/2;
  for(let k=0;k<32;k++){
   const radius=edge*p.scatter/180*(k===0?0:k<8?.2:1),hx=Math.min((w-1)/2,bw/2/zoom),hy=Math.min((h-1)/2,bh/2/zoom),sx=clamp(ox+bw/2+(hash(tile,k*2,p.seed)-.5)*radius*2,hx,w-1-hx),sy=clamp(oy+bh/2+(hash(tile,k*2+1,p.seed)-.5)*radius*2,hy,h-1-hy);
   let seam=0,shape=0,ns=0,np=0;
   for(let y=0;y<bh;y+=Math.max(1,Math.floor(bh/9)))for(let x=0;x<bw;x+=Math.max(1,Math.floor(bw/9))){
    const i=(oy+y)*w+ox+x,over=(ox>0&&x<ow)||(oy>0&&y<oh);
    for(let c=0;c<3;c++){const v=read(c,sx,sy,x,y);shape+=(v-rgb[c][i])**2;if(over)seam+=(v-out[c][i])**2;}np++;if(over)ns++;
   }
   const score=seam/Math.max(1,ns)*(1-p.fidelity/140)+shape/np*(.08+p.fidelity/65);
   if(score<best){best=score;bx=sx;by=sy;}
  }
  const cost=(x,y)=>{let e=0;const i=(oy+y)*w+ox+x;for(let c=0;c<3;c++)e+=(read(c,bx,by,x,y)-out[c][i])**2;return e;};
  let vertical,horizontal;
  if(ox>0){const e=Float32Array.from({length:ow*bh},(_,i)=>cost(i%ow,Math.floor(i/ow)));vertical=minimumSeam(e,ow,bh);}
  if(oy>0){const e=Float32Array.from({length:oh*bw},(_,i)=>cost(Math.floor(i/oh),i%oh));horizontal=minimumSeam(e,oh,bw);}
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
   // Union of the two retained overlap regions; a deliberately simpler L-cut.
   if((vertical&&x<vertical[y])||(horizontal&&y<horizontal[x]))continue;
   const i=(oy+y)*w+ox+x;for(let c=0;c<3;c++)out[c][i]=read(c,bx,by,x,y);
  }
 }
 return expand(out,w,h,width,height);
}
