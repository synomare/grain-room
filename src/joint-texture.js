import {fft2} from './research-spectral.js';
import {at} from './research-math.js';
import {hash} from './pixels.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const power=n=>2**Math.floor(Math.log2(Math.max(1,n)));

export function textureGuide(a,w,h,cap=128){
 const gw=power(Math.min(w,cap)),gh=power(Math.min(h,cap)),l=new Float64Array(gw*gh);
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){
  const x0=x*w/gw,x1=(x+1)*w/gw,y0=y*h/gh,y1=(y+1)*h/gh;let sum=0;
  for(let sy=Math.floor(y0);sy<Math.ceil(y1);sy++)for(let sx=Math.floor(x0);sx<Math.ceil(x1);sx++){
   const i=(sy*w+sx)*4,area=(Math.min(x1,sx+1)-Math.max(x0,sx))*(Math.min(y1,sy+1)-Math.max(y0,sy));sum+=area*(.2126*a[i]+.7152*a[i+1]+.0722*a[i+2])/255;
  }
  l[y*gw+x]=sum/((x1-x0)*(y1-y0));
 }
 return {l,w:gw,h:gh,dx:w/gw,dy:h/gh,long:Math.max(w,h)};
}

export function textureFrame(w,h,dx,dy,long,scale){
 const n=w*h,filters=Array.from({length:12},()=>new Float64Array(n)),residual=new Float64Array(n),radius=new Float64Array(n),top=24*2**(-scale/50);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,kx=(x<=w/2?x:x-w)*long/(w*dx),ky=(y<=h/2?y:y-h)*long/(h*dy),r=Math.hypot(kx,ky);radius[i]=r;
  if(r===0||x===w/2||y===h/2){residual[i]=1;continue;}
  const theta=Math.atan2(ky,kx),radial=Array.from({length:3},(_,s)=>Math.exp(-.5*(Math.log2(r/(top/2**s))/.55)**2)),angular=Array.from({length:4},(_,o)=>Math.abs(Math.cos(theta-o*Math.PI/4))**3),low=Math.exp(-((r/(top/5))**4)),high=Math.sqrt(1-Math.exp(-((r/(top*1.8))**4)));
  let total=low*low+high*high;for(const a of radial)for(const b of angular)total+=a*a*b*b;
  residual[i]=(low*low+high*high)/total;
  for(let s=0;s<3;s++)for(let o=0;o<4;o++){
   const side=kx*Math.cos(o*Math.PI/4)+ky*Math.sin(o*Math.PI/4),base=radial[s]*angular[o]/Math.sqrt(total);
   filters[s*4+o][i]=side>1e-12?Math.SQRT2*base:side< -1e-12?0:base;
  }
 }
 return {w,h,filters,residual,radius,top,cutoff:Math.max(4,top/4)};
}

export function textureAnalyze(input,frame){
 const {w,h,filters}=frame,re=Float64Array.from(input),im=new Float64Array(input.length);fft2(re,im,w,h);
 const bands=filters.map(filter=>{const r=Float64Array.from(re,(v,i)=>v*filter[i]),q=Float64Array.from(im,(v,i)=>v*filter[i]);fft2(r,q,w,h,true);return {re:r,im:q};});
 return {bands,re,im};
}

export function textureRebuild(analysis,frame){
 const {w,h,residual,filters}=frame,re=Float64Array.from(analysis.re,(v,i)=>v*residual[i]),im=Float64Array.from(analysis.im,(v,i)=>v*residual[i]);
 for(let b=0;b<filters.length;b++){const r=analysis.bands[b].re.slice(),q=analysis.bands[b].im.slice();fft2(r,q,w,h);for(let i=0;i<re.length;i++){re[i]+=r[i]*filters[b][i];im[i]+=q[i]*filters[b][i];}}
 fft2(re,im,w,h,true);return re;
}

export function fieldCovariance(fields,center=true){
 const d=fields.length,n=fields[0].length,mean=Float64Array.from(fields,a=>center?a.reduce((s,v)=>s+v,0)/n:0),cov=Array.from({length:d},()=>new Float64Array(d));
 for(let a=0;a<d;a++)for(let b=0;b<=a;b++){let sum=0;for(let i=0;i<n;i++)sum+=(fields[a][i]-mean[a])*(fields[b][i]-mean[b]);cov[a][b]=cov[b][a]=sum/n;}
 return {mean,cov};
}

export function covarianceFactor(cov,ridge=1e-6){
 const d=cov.length,trace=cov.reduce((s,r,i)=>s+r[i],0),epsilon=Math.max(1e-14,trace/d*ridge),L=Array.from({length:d},()=>new Float64Array(d));
 for(let i=0;i<d;i++)for(let j=0;j<=i;j++){let value=cov[i][j]+(i===j?epsilon:0);for(let k=0;k<j;k++)value-=L[i][k]*L[j][k];L[i][j]=i===j?Math.sqrt(Math.max(epsilon*.001,value)):value/L[j][j];}
 return L;
}

export function covarianceTransport(fields,target,amount=1){
 if(amount===0)return fields.map(a=>a.slice());
 const current=fieldCovariance(fields),A=covarianceFactor(current.cov),B=covarianceFactor(target.cov),d=fields.length,n=fields[0].length,out=fields.map(()=>new Float64Array(n)),white=new Float64Array(d);
 for(let i=0;i<n;i++){
  for(let j=0;j<d;j++){let v=fields[j][i]-current.mean[j];for(let k=0;k<j;k++)v-=A[j][k]*white[k];white[j]=v/A[j][j];}
  for(let j=0;j<d;j++){let v=target.mean[j];for(let k=0;k<=j;k++)v+=B[j][k]*white[k];out[j][i]=fields[j][i]*(1-amount)+v*amount;}
 }
 return out;
}

export function matchSpectrum(input,targetRe,targetIm,w,h,amount){
 if(amount===0)return input.slice();const re=Float64Array.from(input),im=new Float64Array(input.length);fft2(re,im,w,h);
 for(let i=0;i<re.length;i++){const mag=Math.hypot(re[i],im[i]),target=Math.hypot(targetRe[i],targetIm[i]);if(mag>1e-15){const gain=(1-amount)+amount*target/mag;re[i]*=gain;im[i]*=gain;}else{re[i]=amount*targetRe[i];im[i]=amount*targetIm[i];}}
 fft2(re,im,w,h,true);return re;
}

export function rankHistogram(input,sorted){
 const order=Array.from({length:input.length},(_,i)=>i).sort((a,b)=>input[a]-input[b]||a-b),out=new Float64Array(input.length);for(let i=0;i<order.length;i++)out[order[i]]=sorted[i];return out;
}

const magnitudes=bands=>bands.map(b=>Float64Array.from(b.re,(v,i)=>Math.hypot(v,b.im[i])));
const doubled=bands=>bands.flatMap(b=>{const r=new Float64Array(b.re.length),q=r.slice();for(let i=0;i<r.length;i++){const amp=Math.hypot(b.re[i],b.im[i]);if(amp>1e-12){r[i]=(b.re[i]**2-b.im[i]**2)/amp;q[i]=2*b.re[i]*b.im[i]/amp;}}return [r,q];});
const raw=bands=>bands.flatMap(b=>[b.re,b.im]);

export function phaseRelations(fine,parent){
 const f=raw(fine),p=doubled(parent),n=f[0].length;
 const cross=f.map(a=>Float64Array.from(p,b=>{let sum=0;for(let i=0;i<n;i++)sum+=a[i]*b[i];return sum/n;}));
 return {cross};
}

export function matchPhaseRelations(fine,parent,target,amount){
 if(amount===0)return;
 const F=raw(fine),P=doubled(parent),n=F[0].length,L=covarianceFactor(fieldCovariance(P,false).cov,1e-4),d=P.length;
 for(let c=0;c<F.length;c++){
  const rhs=new Float64Array(d),white=rhs.slice(),coeff=rhs.slice();
  for(let j=0;j<d;j++){let sum=0;for(let i=0;i<n;i++)sum+=F[c][i]*P[j][i];rhs[j]=target.cross[c][j]-sum/n;}
  for(let j=0;j<d;j++){let v=rhs[j];for(let k=0;k<j;k++)v-=L[j][k]*white[k];white[j]=v/L[j][j];}
  for(let j=d-1;j>=0;j--){let v=white[j];for(let k=j+1;k<d;k++)v-=L[k][j]*coeff[k];coeff[j]=v/L[j][j];}
  let energy=0,change=0;const adjustment=new Float64Array(n);
  for(let i=0;i<n;i++){let v=0;for(let j=0;j<d;j++)v+=coeff[j]*P[j][i];adjustment[i]=v;energy+=F[c][i]**2;change+=v*v;}
  // Damp the conditional correction if the current parent Gram matrix is
  // poorly conditioned. This is an approximate projection, not convergence proof.
  const gain=amount*Math.min(1,Math.sqrt((energy+1e-12)/(change+1e-12))*.75);
  for(let i=0;i<n;i++)F[c][i]+=adjustment[i]*gain;
 }
}

export function compositionProject(input,sourceRe,sourceIm,frame,amount){
 if(amount===0)return input.slice();
 const re=Float64Array.from(input),im=new Float64Array(input.length);fft2(re,im,frame.w,frame.h);
 for(let i=0;i<re.length;i++)if(frame.radius[i]<=frame.cutoff){re[i]=re[i]*(1-amount)+sourceRe[i]*amount;im[i]=im[i]*(1-amount)+sourceIm[i]*amount;}
 fft2(re,im,frame.w,frame.h,true);return re;
}

export function textureModel(source,frame){
 const analysis=textureAnalyze(source,frame),mag=magnitudes(analysis.bands),spectra=mag.map(m=>{const re=m.slice(),im=new Float64Array(m.length);fft2(re,im,frame.w,frame.h);return {re,im};}),phase=[phaseRelations(analysis.bands.slice(0,4),analysis.bands.slice(4,8)),phaseRelations(analysis.bands.slice(4,8),analysis.bands.slice(8,12))];
 return {analysis,mag,spectra,cov:fieldCovariance(mag),phase,sorted:Array.from(source).sort((a,b)=>a-b)};
}

export function textureSynthesize(source,frame,p,{progress}={}){
 const model=textureModel(source,frame),n=source.length,mean=source.reduce((s,v)=>s+v,0)/n,variance=source.reduce((s,v)=>s+(v-mean)**2,0)/n;
 if(variance<1e-15)return {value:source.slice(),model};
 let current=Float64Array.from(source,(_,i)=>{const u=Math.max(1e-9,hash(i,1,p.seed)),v=hash(i,2,p.seed);return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)*Math.sqrt(variance)+mean;});
 current=rankHistogram(current,model.sorted);current=compositionProject(current,model.analysis.re,model.analysis.im,frame,p.structure/100);
 if(progress)progress(0,current,model);
 for(let iteration=0;iteration<p.iterations;iteration++){
  const a=textureAnalyze(current,frame),m=magnitudes(a.bands);
  for(let b=0;b<m.length;b++)m[b]=matchSpectrum(m[b],model.spectra[b].re,model.spectra[b].im,frame.w,frame.h,p.join/100*.65);
  const adjusted=covarianceTransport(m,model.cov,p.join/100);
  for(let b=0;b<a.bands.length;b++)for(let i=0;i<n;i++){
   const old=Math.hypot(a.bands[b].re[i],a.bands[b].im[i]),limit=8*Math.sqrt(model.cov.cov[b][b]+model.cov.mean[b]**2)+1e-6,desired=clamp(adjusted[b][i],0,limit),ratio=old>1e-12?desired/old:0;a.bands[b].re[i]*=ratio;a.bands[b].im[i]*=ratio;
  }
  matchPhaseRelations(a.bands.slice(4,8),a.bands.slice(8,12),model.phase[1],p.polarity/100*.65);
  matchPhaseRelations(a.bands.slice(0,4),a.bands.slice(4,8),model.phase[0],p.polarity/100*.65);
  let next=textureRebuild(a,frame);
  next=rankHistogram(next,model.sorted);
  next=matchSpectrum(next,model.analysis.re,model.analysis.im,frame.w,frame.h,p.regularity/100);
  next=compositionProject(next,model.analysis.re,model.analysis.im,frame,p.structure/100);
  current=next;
  if(progress)progress(iteration+1,current,model);
 }
 return {value:current,model};
}

export function jointTexture(a,w,h,p){
 if(p.amount===0)return Uint8ClampedArray.from(a);
 const g=textureGuide(a,w,h),frame=textureFrame(g.w,g.h,g.dx,g.dy,g.long,p.scale),result=textureSynthesize(g.l,frame,p);
 return renderTexture(a,w,h,g,result,p);
}

export function renderTexture(a,w,h,g,result,p){
 const out=new Uint8ClampedArray(a.length);
 // Photo adaptation: concentrate the newly synthesized field where the source
 // has band energy. This spatial render gate is outside the stationary model.
 const envelope=new Float64Array(g.l.length);
 for(const band of result.model.mag)for(let i=0;i<envelope.length;i++)envelope[i]+=band[i];
 const average=envelope.reduce((s,v)=>s+v,0)/envelope.length;
 const locality=(p.locality??0)/100;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,gx=(x+.5)*g.w/w-.5,gy=(y+.5)*g.h/h-.5,source=at(g.l,g.w,g.h,gx,gy),created=at(result.value,g.w,g.h,gx,gy),l=(.2126*a[i]+.7152*a[i+1]+.0722*a[i+2])/255;
  const gate=1-locality+locality*clamp(at(envelope,g.w,g.h,gx,gy)/(average*1.3+1e-12),0,1);
  const value=source+(created-source)*p.amount/100*gate+(l-source)*p.detail/100;
  for(let c=0;c<3;c++)out[i+c]=255*(value+(a[i+c]/255-l)*p.color/100);out[i+3]=255;
 }
 return out;
}
