import {hash,sample} from './pixels.js';

const mod=(x,m)=>((x%m)+m)%m;
export function mirror(x,size){if(size<=1)return 0;const t=mod(x,2*(size-1));return t<=size-1?t:2*(size-1)-t;}
// Infinite alternating rake: the two periodic exponential sums have opposite signs.
export function rakeDisplacement(u,spacing,width){
 const period=2*spacing,k=t=>{t=mod(t,period);return (Math.exp(-t/width)+Math.exp(-(period-t)/width))/(1-Math.exp(-period/width));};
 return k(u)-k(u-spacing);
}
export function rakePoint(x,y,s,sign=1){
 const u=-s.sin*(x-s.x)+s.cos*(y-s.y),d=sign*s.pull*rakeDisplacement(u,s.spacing,s.width);
 return [x+s.cos*d,y+s.sin*d];
}
export function vortexPoint(x,y,s,sign=1){
 const dx=x-s.x,dy=y-s.y,r2=dx*dx+dy*dy,t=sign*s.turn*Math.exp(-r2/(s.radius*s.radius)),c=Math.cos(t),n=Math.sin(t);
 return [s.x+c*dx-n*dy,s.y+n*dx+c*dy];
}
export function footprint(dx,dy){
 const a=dx[0]**2+dy[0]**2,b=dx[0]*dx[1]+dy[0]*dy[1],c=dx[1]**2+dy[1]**2,disc=Math.hypot(a-c,2*b),large=Math.max(0,(a+c+disc)/2),small=Math.max(0,(a+c-disc)/2);
 let ux,uy;if(Math.abs(b)>1e-12){ux=large-c;uy=b;const norm=Math.hypot(ux,uy);ux/=norm;uy/=norm;}else{ux=a>=c?1:0;uy=a>=c?0:1;}
 const major=Math.sqrt(large);return {major,minor:Math.max(1,Math.sqrt(small)),axis:[ux*major,uy*major]};
}
export function marbleStages(p,w,h){
 const edge=Math.max(w,h),stages=[];
 for(let k=0;k<p.passes;k++){
  const angle=(p.angle+(k%2)*87+(hash(k,0,p.seed)-.5)*34)*Math.PI/180;
  const spacing=p.spacing/1000*edge*(.8+hash(k,1,p.seed)*.4);
  stages.push({type:'rake',x:hash(k,2,p.seed)*w,y:hash(k,3,p.seed)*h,cos:Math.cos(angle),sin:Math.sin(angle),spacing,width:spacing*.22,pull:p.pull/1000*edge*(.7+hash(k,4,p.seed)*.6)});
  if(p.swirl)stages.push({type:'vortex',x:(.2+.6*hash(k,5,p.seed))*w,y:(.2+.6*hash(k,6,p.seed))*h,radius:edge*(.16+.14*hash(k,7,p.seed)),turn:p.swirl/100*Math.PI*(hash(k,8,p.seed)>.5?1:-1)});
 }
 return stages;
}
export function marble(a,w,h,p){
 if((p.pull===0&&p.swirl===0)||p.passes===0)return a.slice();
 const stages=marbleStages(p,w,h),out=new Uint8ClampedArray(a.length);
 const pyramid=[{a,w,h}];
 while(pyramid.at(-1).w>1||pyramid.at(-1).h>1){
  const prev=pyramid.at(-1),W=Math.ceil(prev.w/2),H=Math.ceil(prev.h/2),b=new Uint8ClampedArray(W*H*4);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let c=0;c<4;c++){let sum=0;for(let j=0;j<2;j++)for(let k=0;k<2;k++)sum+=prev.a[(Math.min(prev.h-1,y*2+j)*prev.w+Math.min(prev.w-1,x*2+k))*4+c];b[(y*W+x)*4+c]=sum/4;}
  pyramid.push({a:b,w:W,h:H});
 }
 // Two scanlines suffice for the inverse-map footprint, even for large exports.
 const row=y=>{const r=new Float64Array((w+1)*2);for(let x=0;x<=w;x++){let u=x,v=y;for(let k=stages.length-1;k>=0;k--){const s=stages[k];[u,v]=s.type==='rake'?rakePoint(u,v,s,-1):vortexPoint(u,v,s,-1);}r[x*2]=u;r[x*2+1]=v;}return r;};
 let current=row(0);
 for(let y=0;y<h;y++){
  const next=row(y+1);
  for(let x=0;x<w;x++){
   const q=x*2,u=current[q],v=current[q+1],dx=[current[q+2]-u,current[q+3]-v],dy=[next[q]-u,next[q+1]-v];
   const {major,minor,axis}=footprint(dx,dy);
   const taps=Math.min(8,Math.max(1,Math.ceil(major/minor))),lod=Math.max(0,Math.log2(Math.max(minor,major/taps))),level=Math.min(pyramid.length-1,Math.floor(lod)),mip=pyramid[level],second=pyramid[Math.min(pyramid.length-1,level+1)],blend=Math.min(1,lod-level),i=(y*w+x)*4;
   for(let c=0;c<3;c++){
    let value=0;for(let k=0;k<taps;k++){const t=(k+.5)/taps-.5,U=mirror(u+axis[0]*t,w),V=mirror(v+axis[1]*t,h),one=sample(mip.a,mip.w,mip.h,(U+.5)/2**level-.5,(V+.5)/2**level-.5,c),two=sample(second.a,second.w,second.h,(U+.5)/2**Math.min(pyramid.length-1,level+1)-.5,(V+.5)/2**Math.min(pyramid.length-1,level+1)-.5,c);value+=one+(two-one)*blend;}
    out[i+c]=value/taps;
   }out[i+3]=255;
  }
  current=next;
 }
 return out;
}
