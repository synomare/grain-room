import {hash,clamp,sample} from './pixels.js';
import {grid,tensor,at,expand} from './research-math.js';

export function siteMetric(angle,aspect){
 const c=Math.cos(angle),s=Math.sin(angle),a=1/aspect,b=aspect;
 return [a*c*c+b*s*s,(a-b)*c*s,a*s*s+b*c*c];
}
export function siteLogit(site,x,y){
 const dx=x-site.x,dy=y-site.y;
 return -site.tau*(Math.sqrt(Math.max(0,site.G[0]*dx*dx+2*site.G[1]*dx*dy+site.G[2]*dy*dy))-site.radius);
}
export function softWeights(logits){
 const max=Math.max(...logits),weights=logits.map(v=>Math.exp(v-max)),sum=weights.reduce((a,b)=>a+b,0);
 return weights.map(v=>v/sum);
}
// Content-dependent anisotropy: the candidate field is approximate, not Euclidean.
export function candidateField(sites,w,h,K=4){
 let ids=new Int32Array(w*h*K).fill(-1),next=ids.slice();
 const seen=new Int32Array(sites.length),bestIds=new Int32Array(K),bestScores=new Float64Array(K);let stamp=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=0;k<K;k++)ids[(y*w+x)*K+k]=(Math.imul(y*w+x+1,31)+k*137)%sites.length;
 for(let step=2**Math.ceil(Math.log2(Math.max(w,h)));step>=1;step/=2){
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   stamp++;bestIds.fill(-1);bestScores.fill(-Infinity);
   const probe=id=>{
    if(id<0||seen[id]===stamp)return;seen[id]=stamp;const score=siteLogit(sites[id],x,y);
    for(let j=0;j<K;j++)if(score>bestScores[j]||(score===bestScores[j]&&id<bestIds[j])){
     for(let n=K-1;n>j;n--){bestScores[n]=bestScores[n-1];bestIds[n]=bestIds[n-1];}bestScores[j]=score;bestIds[j]=id;break;
    }
   };
   for(const [dx,dy] of [[0,0],[-step,0],[step,0],[0,-step],[0,step]]){
    const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=w||Y>=h)continue;const i=(Y*w+X)*K;for(let k=0;k<K;k++)probe(ids[i+k]);
   }
   // Inject global deterministic probes in addition to spatial propagation.
   for(let k=0;k<2;k++)probe(Math.floor(hash(x+k*71,y+step,91)*sites.length)%sites.length);
   const i=(y*w+x)*K;for(let k=0;k<K;k++)next[i+k]=bestIds[k];
  }
  [ids,next]=[next,ids];
 }
 return ids;
}
// Fixed geometry, convex color-only least squares, diagonally scaled gradient.
// With partition-of-unity weights, sum_p w_pi bounds the Gram row sum.
export function fitSiteColors(ids,weights,target,count,K,initial,iterations=14){
 const colors=initial.map(v=>v.slice()),mass=new Float64Array(count),gradient=colors.map(()=>new Float64Array(count));
 for(let i=0;i<ids.length;i++)if(ids[i]>=0)mass[ids[i]]+=weights[i];
 for(let it=0;it<iterations;it++){
  for(const g of gradient)g.fill(0);
  for(let p=0;p<target[0].length;p++)for(let c=0;c<3;c++){
   let estimate=0;for(let k=0;k<K;k++){const i=p*K+k,j=ids[i];if(j>=0)estimate+=weights[i]*colors[c][j];}
   const residual=target[c][p]-estimate;
   for(let k=0;k<K;k++){const i=p*K+k,j=ids[i];if(j>=0)gradient[c][j]+=weights[i]*residual;}
  }
  for(let j=0;j<count;j++)if(mass[j]>1e-12)for(let c=0;c<3;c++)colors[c][j]=clamp(colors[c][j]+gradient[c][j]/mass[j],0,1);
 }
 return colors;
}
export function softcells(a,w,h,p){
 const g=grid(a,w,h,240),t=tensor(g,3),W=g.w,H=g.h,unit=Math.sqrt(W*H/p.cells),sites=[];
 for(let k=0;k<p.cells;k++){
  let x=0,y=0,best=-1;
  for(let n=0;n<4;n++){
   const X=hash(k,n*2,p.seed)*(W-1),Y=hash(k,n*2+1,p.seed)*(H-1),score=.2+at(g.l,W,H,X,Y)+Math.hypot(at(g.l,W,H,X+1,Y)-at(g.l,W,H,X-1,Y),at(g.l,W,H,X,Y+1)-at(g.l,W,H,X,Y-1));
   if(score*hash(k,n+38,p.seed)>best){best=score*hash(k,n+38,p.seed);x=X;y=Y;}
  }
  const angle=at(t.angle,W,H,x,y)+(hash(k,21,p.seed)-.5)*p.disorder/100*Math.PI;
  sites.push({x,y,G:siteMetric(angle,1+p.stretch/100*9),radius:unit*(hash(k,22,p.seed)-.5)*p.reach/100*3,tau:(1+p.hardness/100*22)/Math.max(1,unit)});
 }
 const K=4,ids=candidateField(sites,W,H,K),weights=new Float32Array(ids.length);
 for(let i=0;i<W*H;i++){
  const logits=Array.from({length:K},(_,k)=>ids[i*K+k]<0?-1e20:siteLogit(sites[ids[i*K+k]],i%W,Math.floor(i/W))),values=softWeights(logits);
  for(let k=0;k<K;k++)weights[i*K+k]=values[k];
 }
 const initial=[0,1,2].map(c=>Float64Array.from(sites,s=>at(g.rgb[c],W,H,s.x,s.y))),colors=fitSiteColors(ids,weights,g.rgb,sites.length,K,initial,p.fit);
 const scale=Math.min(1,900/Math.max(w,h)),RW=Math.max(1,Math.round(w*scale)),RH=Math.max(1,Math.round(h*scale)),rgb=[0,1,2].map(()=>new Float32Array(RW*RH));
 // Re-evaluate scores at output samples using candidates from four adjacent cells.
 const candidates=new Int32Array(16),scores=new Float64Array(16),ws=new Float64Array(16);
 for(let y=0;y<RH;y++)for(let x=0;x<RW;x++){
  const X=(x+.5)*W/RW-.5,Y=(y+.5)*H/RH-.5,ix=clamp(Math.floor(X),0,W-1),iy=clamp(Math.floor(Y),0,H-1);let n=0,max=-Infinity;
  for(const [dx,dy] of [[0,0],[1,0],[0,1],[1,1]])for(let k=0;k<K;k++){
   const j=ids[(Math.min(H-1,iy+dy)*W+Math.min(W-1,ix+dx))*K+k];if(j<0)continue;
   let found=false;for(let m=0;m<n;m++)if(candidates[m]===j){found=true;break;}if(found)continue;
   candidates[n]=j;scores[n]=siteLogit(sites[j],X,Y);max=Math.max(max,scores[n]);n++;
  }
  let sum=0;for(let j=0;j<n;j++){ws[j]=Math.exp(scores[j]-max);sum+=ws[j];}
  let purity=0;const col=[0,0,0];
  for(let j=0;j<n;j++){const weight=ws[j]/sum;purity+=weight*weight;for(let c=0;c<3;c++)col[c]+=weight*colors[c][candidates[j]];}
  const membrane=Math.pow(1-purity,2)*p.membrane/100,shade=1-.85*membrane,detail=p.texture/100;
  for(let c=0;c<3;c++)rgb[c][y*RW+x]=(col[c]*(1-detail)+at(g.rgb[c],W,H,X,Y)*detail)*shade;
 }
 return expand(rgb,RW,RH,w,h);
}
