import {clamp,sample,hash} from './pixels.js';
import {painterlyGuide} from './painterly-strokes.js';

export const SEAM_EDGE=320;
export const seamDefaults={cut:42,direction:0,operation:0,protect:100,join:100,scatter:10,spread:100,amount:100,seed:17};
const difference=(rgb,a,b)=>(Math.abs(rgb[a*3]-rgb[b*3])+Math.abs(rgb[a*3+1]-rgb[b*3+1])+Math.abs(rgb[a*3+2]-rgb[b*3+2]))/3;
export function seamCosts(rgb,w,h,x,y,protect=1,join=1){
 const i=y*w+x,l=y*w+Math.max(0,x-1),r=y*w+Math.min(w-1,x+1),u=Math.max(0,y-1)*w+x,d=Math.min(h-1,y+1)*w+x,cu=difference(rgb,l,r)*join;
 return {importance:(difference(rgb,l,r)+difference(rgb,u,d))*protect,up:cu,left:cu+difference(rgb,u,l)*join,right:cu+difference(rgb,u,r)*join};
}
// One exact shortest path for the CURRENT guide. Repeated removals are greedy.
export function findForwardSeam(rgb,w,h,p=seamDefaults,coordinates=null){
 const parent=new Int8Array(w*h),previous=new Float64Array(w),current=new Float64Array(w);
 const extra=(x,y)=>{const xx=coordinates?coordinates[y*w+x]:x;return hash(xx,Math.floor(y/8),p.seed)*(p.scatter*.15+1e-8);};
 for(let x=0;x<w;x++){const c=seamCosts(rgb,w,h,x,0,p.protect/100,p.join/100);previous[x]=c.importance+c.up+extra(x,0);}
 for(let y=1;y<h;y++){
  for(let x=0;x<w;x++){const c=seamCosts(rgb,w,h,x,y,p.protect/100,p.join/100);let best=previous[x]+c.up,step=0;
   if(x>0&&previous[x-1]+c.left<best){best=previous[x-1]+c.left;step=-1;}if(x+1<w&&previous[x+1]+c.right<best){best=previous[x+1]+c.right;step=1;}
   parent[y*w+x]=step;current[x]=best+c.importance+extra(x,y);
  }previous.set(current);
 }
 let x=0;for(let j=1;j<w;j++)if(previous[j]<previous[x])x=j;const cost=previous[x],path=new Int32Array(h);for(let y=h-1;y>=0;y--){path[y]=x;x+=parent[y*w+x];}
 return {path,cost};
}
export function removeGuideSeam(rgb,coordinates,w,h,path){
 const next=new Float32Array((w-1)*h*3),map=new Int32Array((w-1)*h);
 for(let y=0;y<h;y++)for(let x=0,j=0;x<w;x++)if(x!==path[y]){const a=y*w+x,b=y*(w-1)+j++;map[b]=coordinates[a];next.set(rgb.subarray(a*3,a*3+3),b*3);}
 return {rgb:next,coordinates:map,w:w-1,h};
}
export function planSeams(a,w,h,p=seamDefaults,edge=SEAM_EDGE){
 const guide=painterlyGuide(a,w,h,edge),horizontal=p.direction===1,W=horizontal?guide.h:guide.w,H=horizontal?guide.w:guide.h,rgb=new Float32Array(W*H*3);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const j=horizontal?x*guide.w+y:y*guide.w+x;rgb.set(guide.rgb.subarray(j*3,j*3+3),(y*W+x)*3);}
 let state={w:W,h:H,rgb,coordinates:Int32Array.from({length:W*H},(_,i)=>i%W)};const count=Math.min(W-1,Math.round(W*p.cut/100)),removed=new Uint8Array(W*H),costs=[];
 for(let k=0;k<count;k++){const seam=findForwardSeam(state.rgb,state.w,H,p,state.coordinates);for(let y=0;y<H;y++)removed[y*W+state.coordinates[y*state.w+seam.path[y]]]=1;costs.push(seam.cost);state=removeGuideSeam(state.rgb,state.coordinates,state.w,H,seam.path);}
 let coordinates=state.coordinates,target=state.w;
 if(p.operation===1){target=W+count;coordinates=new Int32Array(target*H);for(let y=0;y<H;y++)for(let x=0,j=0;x<W;x++){coordinates[y*target+j++]=x;if(removed[y*W+x])coordinates[y*target+j++]=x;}}
 return {w:target,h:H,originalWidth:W,guideWidth:guide.w,guideHeight:guide.h,horizontal,coordinates,removed,count,costs,background:[0,1,2].map(c=>guide.rgb.reduce((s,v,i)=>s+(i%3===c?v:0),0)/(guide.w*guide.h))};
}
// Map intact guide-cell intervals; interpolating ACROSS a removed band would
// put its pixels back. Only the path's row coordinate is interpolated.
export function seamCoordinate(plan,u,v,axisLength,crossLength,spread=100,out=[0,0]){
 const ratio=plan.w/plan.originalWidth,natural=axisLength*Math.min(ratio,1/ratio),span=natural+(axisLength-natural)*spread/100,start=(axisLength-span)/2;
 if(u<start||u>=start+span)return null;
 const q=(u-start)*plan.w/span,x=clamp(Math.floor(q),0,plan.w-1),f=q-x-.5,Y=clamp(v*plan.h/crossLength-.5,0,plan.h-1),y=Math.floor(Y),t=Y-y,j=Math.min(y+1,plan.h-1),original=plan.coordinates[y*plan.w+x]*(1-t)+plan.coordinates[j*plan.w+x]*t;
 out[0]=(original+.5+f)*axisLength/plan.originalWidth-.5;out[1]=v-.5;return out;
}
export function seamfold(a,w,h,p=seamDefaults){
 if(p.amount===0||p.cut===0)return a.slice();const plan=planSeams(a,w,h,p);if(!plan.count)return a.slice();const out=new Uint8ClampedArray(a.length),xy=[0,0],axis=plan.horizontal?h:w,cross=plan.horizontal?w:h,amount=p.amount/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,point=seamCoordinate(plan,(plan.horizontal?y:x)+.5,(plan.horizontal?x:y)+.5,axis,cross,p.spread,xy);
  for(let c=0;c<3;c++){const value=point?sample(a,w,h,plan.horizontal?point[1]:point[0],plan.horizontal?point[0]:point[1],c):plan.background[c];out[i+c]=a[i+c]+(value-a[i+c])*amount;}out[i+3]=255;
 }return out;
}
