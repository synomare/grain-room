export const domainDefaults={size:32,range:40,passes:3,method:0,detail:25,tone:100,edge:0,amount:100};
export const domainSigmas=(sigma,n)=>Array.from({length:n},(_,i)=>sigma*Math.sqrt(3)*2**(n-1-i)/Math.sqrt(4**n-1));
// Fixed guidance distances, Eq. 11. Only line-sized coordinates are stored.
export function domainPositions(guide,w,h,horizontal,line,sigma,range,out=new Float64Array(horizontal?w:h)){
 const n=horizontal?w:h,step=horizontal?4:w*4,start=horizontal?line*w*4:line*4,ratio=sigma/range/255;out[0]=0;
 for(let k=1;k<n;k++){const i=start+k*step,j=i-step;out[k]=out[k-1]+1+ratio*(Math.abs(guide[i]-guide[j])+Math.abs(guide[i+1]-guide[j+1])+Math.abs(guide[i+2]-guide[j+2]));}return out;
}
// Normalized convolution, Eqs. 15–16: exact sample mean in a transformed box.
export function domainBoxLine(values,positions,radius,out=new Float64Array(values.length),counts=null){
 const n=positions.length;let lo=0,hi=0,r=0,g=0,b=0;
 for(let k=0;k<n;k++){const left=positions[k]-radius,right=positions[k]+radius;
  while(hi<n&&positions[hi]<=right){r+=values[hi*3];g+=values[hi*3+1];b+=values[hi*3+2];hi++;}
  while(lo<hi&&positions[lo]<left){r-=values[lo*3];g-=values[lo*3+1];b-=values[lo*3+2];lo++;}
  const count=hi-lo;out[k*3]=r/count;out[k*3+1]=g/count;out[k*3+2]=b/count;if(counts)counts[k]=count;
 }return out;
}
// Recursive filtering, Eqs. 20–21. Constant endpoint initialization.
export function domainRecursiveLine(values,positions,sigma,out=new Float64Array(values.length)){
 out.set(values);const n=positions.length,k=-Math.sqrt(2)/sigma;
 for(let i=1;i<n;i++){const a=Math.exp(k*(positions[i]-positions[i-1]));for(let c=0;c<3;c++){const j=i*3+c;out[j]+=a*(out[j-3]-out[j]);}}
 for(let i=n-2;i>=0;i--){const a=Math.exp(k*(positions[i+1]-positions[i]));for(let c=0;c<3;c++){const j=i*3+c;out[j]+=a*(out[j+3]-out[j]);}}
 return out;
}
export function filterDomain(rgb,guide,w,h,sigma,range,passes=3,method=0){
 return runDomain(Float32Array.from(rgb),guide,w,h,sigma,range,passes,method);
}
function runDomain(result,guide,w,h,sigma,range,passes,method){
 if(sigma<=0||range<=0)return result;
 const longest=Math.max(w,h),positions=new Float64Array(longest),values=new Float64Array(longest*3),filtered=values.slice();
 for(const s of domainSigmas(sigma,passes))for(const horizontal of[true,false]){
  const n=horizontal?w:h,lines=horizontal?h:w,step=horizontal?1:w,begin=line=>horizontal?line*w:line;
  for(let line=0;line<lines;line++){const start=begin(line),pos=positions.subarray(0,n),v=values.subarray(0,n*3),f=filtered.subarray(0,n*3);domainPositions(guide,w,h,horizontal,line,sigma,range,pos);
   for(let k=0;k<n;k++){const i=(start+k*step)*3;v[k*3]=result[i];v[k*3+1]=result[i+1];v[k*3+2]=result[i+2];}
   if(method===0)domainBoxLine(v,pos,s*Math.sqrt(3),f);else domainRecursiveLine(v,pos,s,f);
   for(let k=0;k<n;k++){const i=(start+k*step)*3;result[i]=f[k*3];result[i+1]=f[k*3+1];result[i+2]=f[k*3+2];}
  }
 }return result;
}
export function domainStylePixel(original,base,mean,p,edge=0){
 const B=base;
 const darkness=1-Math.min(.85,edge*p.edge/100*2.4);
 return B.map((v,c)=>(mean[c]+(v-mean[c])*p.tone/100+(original[c]-base[c])*p.detail/100)*darkness);
}
export function domainColour(a,w,h,p=domainDefaults){
 if(p.amount===0)return a.slice();const n=w*h,rgb=new Float32Array(n*3),mean=[0,0,0];
 for(let i=0;i<n;i++)for(let c=0;c<3;c++){const value=a[i*4+c]/255;rgb[i*3+c]=value;mean[c]+=value/n;}
 const sigma=p.size*Math.max(w,h)/1000,base=runDomain(rgb,a,w,h,sigma,p.range/100,p.passes,p.method),out=new Uint8ClampedArray(a.length),original=[0,0,0],colour=[0,0,0],amount=p.amount/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=i*3;let edge=0;
  if(p.edge){const l=(y*w+Math.max(0,x-1))*3,r=(y*w+Math.min(w-1,x+1))*3,u=(Math.max(0,y-1)*w+x)*3,d=(Math.min(h-1,y+1)*w+x)*3;for(let c=0;c<3;c++)edge+=Math.abs(base[r+c]-base[l+c])+Math.abs(base[d+c]-base[u+c]);edge/=3;}
  for(let c=0;c<3;c++){original[c]=a[i*4+c]/255;colour[c]=base[j+c];}const styled=domainStylePixel(original,colour,mean,p,edge);
  for(let c=0;c<3;c++)out[i*4+c]=a[i*4+c]+(styled[c]*255-a[i*4+c])*amount;out[i*4+3]=255;
 }return out;
}
