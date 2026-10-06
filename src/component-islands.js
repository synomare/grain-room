export const componentDefaults={size:24,balance:0,polarity:0,detail:5,relief:0,mode:1,diagonal:0,amount:100};
export function componentWorkspace(n){return {order:new Int32Array(n),parent:new Int32Array(n),zpar:new Int32Array(n),area:new Uint32Array(n),inverted:new Uint8Array(n),counts:new Uint32Array(256)};}
// Counting-sort immersion, path compression, then canonical parent links.
// Independently implemented from Carlinet/Geraud 2013, Appendix A.1.
export function componentTree(level,w,h,connectivity=4,ws=componentWorkspace(w*h)){
 const {order,parent,zpar,area,counts}=ws,n=w*h;counts.fill(0);parent.fill(-1);area.fill(1);
 for(let i=0;i<n;i++)counts[level[i]]++;
 let total=0;for(let g=0;g<256;g++){const count=counts[g];counts[g]=total;total+=count;}
 for(let i=0;i<n;i++)order[counts[level[i]]++]=i;
 function join(q,p){if(parent[q]<0)return;let r=q;while(zpar[r]!==r)r=zpar[r];while(zpar[q]!==q){const next=zpar[q];zpar[q]=r;q=next;}if(r!==p){zpar[r]=p;parent[r]=p;}}
 for(let k=n-1;k>=0;k--){const p=order[k],x=p%w,y=Math.floor(p/w);parent[p]=p;zpar[p]=p;
  if(x)join(p-1,p);if(x+1<w)join(p+1,p);if(y)join(p-w,p);if(y+1<h)join(p+w,p);
  if(connectivity===8){if(x&&y)join(p-w-1,p);if(x+1<w&&y)join(p-w+1,p);if(x&&y+1<h)join(p+w-1,p);if(x+1<w&&y+1<h)join(p+w+1,p);}
 }
 for(let k=0;k<n;k++){const p=order[k],q=parent[p];if(level[q]===level[parent[q]])parent[p]=parent[q];}
 for(let k=n-1;k>=0;k--){const p=order[k];if(parent[p]!==p)area[parent[p]]+=area[p];}
 return {level,order,parent,area};
}
export function componentOpening(level,w,h,threshold,connectivity=4,ws=componentWorkspace(w*h),out=new Uint8Array(w*h)){
 if(threshold<=1){out.set(level);return out;}const{order,parent,area}=componentTree(level,w,h,connectivity,ws);
 for(let k=0;k<order.length;k++){const p=order[k];out[p]=area[p]>=threshold||p===parent[p]?level[p]:out[parent[p]];}return out;
}
export function componentClosing(level,w,h,threshold,connectivity=4,ws=componentWorkspace(w*h),out=new Uint8Array(w*h)){
 const inverted=ws.inverted;for(let i=0;i<level.length;i++)inverted[i]=255-level[i];componentOpening(inverted,w,h,threshold,connectivity,ws,out);for(let i=0;i<out.length;i++)out[i]=255-out[i];return out;
}
export function componentAreas(w,h,p=componentDefaults){const a=(p.size*Math.max(w,h)/1000)**2;return [Math.max(1,Math.round(a*2**(p.balance/40))),Math.max(1,Math.round(a*2**(-p.balance/40)))];}
export function componentIslands(a,w,h,p=componentDefaults){
 if(p.amount===0)return a.slice();const n=w*h,ws=componentWorkspace(n),level=new Uint8Array(n),opened=new Uint8Array(n),closed=new Uint8Array(n),base=new Float32Array(n*3),[bright,dark]=componentAreas(w,h,p),lo=1-Math.max(0,p.polarity/100),hi=1+Math.min(0,p.polarity/100),connectivity=p.diagonal===1?8:4;
 for(let c=0;c<(p.mode===1?3:1);c++){
  for(let i=0;i<n;i++)level[i]=p.mode===1?a[i*4+c]:Math.round(.2126*a[i*4]+.7152*a[i*4+1]+.0722*a[i*4+2]);
  componentOpening(level,w,h,bright,connectivity,ws,opened);componentClosing(level,w,h,dark,connectivity,ws,closed);
  for(let i=0;i<n;i++){const value=level[i]-lo*(level[i]-opened[i])+hi*(closed[i]-level[i]);if(p.mode===1)base[i*3+c]=value;else for(let k=0;k<3;k++)base[i*3+k]=a[i*4+k]+value-level[i];}
 }
 const out=new Uint8ClampedArray(a.length),amount=p.amount/100,detail=p.detail/100,relief=p.relief/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,l=(y*w+Math.max(0,x-1))*3,u=(Math.max(0,y-1)*w+x)*3;
  for(let c=0;c<3;c++){const j=i*3+c,edge=base[j]-.5*(base[l+c]+base[u+c]),value=base[j]+detail*(a[i*4+c]-base[j])+relief*edge*3;out[i*4+c]=a[i*4+c]+amount*(value-a[i*4+c]);}out[i*4+3]=255;
 }return out;
}
