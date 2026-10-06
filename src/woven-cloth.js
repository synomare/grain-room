import {clamp,sample,hash} from './pixels.js';
const PI=Math.PI,TAU=2*PI,mod=(x,n)=>((x%n)+n)%n;
export const wovenDefaults={size:9,weave:0,angle:0,coverage:88,crimp:60,gloss:35,roughness:75,light:120,elevation:48,dye:80,split:0,amount:100,seed:17};
export const weavePeriod=mode=>mode===0?2:mode===1?3:5;
export function warpAbove(i,j,mode){const n=weavePeriod(mode);return mode===0?mod(i+j,2)===0:mode===1?mod(i-j,3)<2:mod(i-2*j,5)!==0;}
// Smooth interpolation between over/under heights; repeated heights make long floats.
export function yarnCrimp(u,v,vertical,mode,height){const across=Math.floor(vertical?u:v),along=(vertical?v:u)-.5,k=Math.floor(along),f=along-k;
 const a=(vertical?warpAbove(across,k,mode):!warpAbove(k,across,mode))?1:-1,b=(vertical?warpAbove(across,k+1,mode):!warpAbove(k+1,across,mode))?1:-1;
 return {height:height*(a+(b-a)*(.5-.5*Math.cos(PI*f))),slope:height*(b-a)*PI/2*Math.sin(PI*f)};
}
export function dielectricFresnel(cosine,eta=1.5){const ci=clamp(cosine,0,1),ct=Math.sqrt(Math.max(0,1-(1-ci*ci)/(eta*eta))),s=(ci-eta*ct)/(ci+eta*ct),p=(eta*ci-ct)/(eta*ci+ct);return(s*s+p*p)/2;}
// Sadeghi et al. (2013), Eq. 2: surface-only cylindrical reflection cone.
export function cylinderReflection(t,wi,wr,sigma,eta=1.5){const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],di=clamp(dot(t,wi),-1,1),dr=clamp(dot(t,wr),-1,1),ci=Math.sqrt(Math.max(0,1-di*di)),cr=Math.sqrt(Math.max(0,1-dr*dr));
 if(ci*cr<1e-12)return 0;const cd=clamp((dot(wi,wr)-di*dr)/(ci*cr),-1,1),az=Math.sqrt((1+cd)/2),ti=Math.asin(di),tr=Math.asin(dr),th=(ti+tr)/2,td=(ti-tr)/2;
 return dielectricFresnel(Math.cos(td)*az,eta)*az*Math.exp(-.5*(th/sigma)**2)/(Math.sqrt(2*PI)*sigma);
}
export function wovenPoint(u,v,p){const radius=p.coverage/200,du=u-Math.floor(u)-.5,dv=v-Math.floor(v)-.5,cv=Math.abs(du)<radius?Math.sqrt(Math.max(0,1-(du/radius)**2)):0,ch=Math.abs(dv)<radius?Math.sqrt(Math.max(0,1-(dv/radius)**2)):0;
 const vc=yarnCrimp(u,v,true,p.weave,.18*p.crimp/100),hc=yarnCrimp(u,v,false,p.weave,.18*p.crimp/100),vertical=cv>0&&(ch===0||warpAbove(Math.floor(u),Math.floor(v),p.weave));if(!cv&&!ch)return[0,0,0,0,1];
 const q=vertical?vc:hc,inv=1/Math.sqrt(1+q.slope*q.slope),t=vertical?[0,inv,q.slope*inv]:[inv,0,q.slope*inv],n=vertical?[0,-q.slope*inv,inv]:[-q.slope*inv,0,inv],a=(p.light-p.angle)*PI/180,e=p.elevation*PI/180,wi=[Math.cos(a)*Math.cos(e),Math.sin(a)*Math.cos(e),Math.sin(e)],wr=[0,0,1],profile=vertical?cv:ch;
 const sigma=(3+p.roughness*.32)*PI/180,illum=Math.max(0,n[0]*wi[0]+n[1]*wi[1]+n[2]*wi[2]),rib=.96+.04*Math.cos(TAU*(8*(vertical?v:u)+1.3*(vertical?du:dv))),diff=(.28+.85*illum)*(.56+.44*profile)*rib;
 const spec=cylinderReflection(t,wi,wr,sigma)*p.gloss/100*1.4*(.5+.5*profile);
 return vertical?[diff,spec,0,0,0]:[0,0,diff,spec,0];
}
// A separable periodic box footprint suppresses unresolved yarns, never rescales the photo.
export function periodicBox(a,W,H,C,radius){const out=new Float32Array(a.length),tmp=new Float32Array(a.length),r=Math.max(0,Math.ceil(radius)),span=2*r+1;
 for(let axis=0;axis<2;axis++){const src=axis?tmp:a,dst=axis?out:tmp,n=axis?H:W,rows=axis?W:H,prefix=new Float64Array(n+1),turns=Math.floor(span/n),remain=span%n;
  for(let y=0;y<rows;y++)for(let c=0;c<C;c++){prefix[0]=0;for(let x=0;x<n;x++)prefix[x+1]=prefix[x]+src[(axis?x*W+y:y*W+x)*C+c];const total=prefix[n];
   for(let x=0;x<n;x++){const start=mod(x-r,n),end=start+remain,s=turns*total+(end<=n?prefix[end]-prefix[start]:total-prefix[start]+prefix[end-n]);dst[(axis?x*W+y:y*W+x)*C+c]=s/span;}
  }
 }return out;
}
export function createWovenTile(params,pitchPixels){const p={...wovenDefaults,...params},n=weavePeriod(p.weave),res=64,W=n*res,C=5,raw=new Float32Array(W*W*C);
 for(let y=0;y<W;y++)for(let x=0;x<W;x++)raw.set(wovenPoint((x+.5)/res,(y+.5)/res,p),(y*W+x)*C);
 const footprint=res*(Math.abs(Math.cos(p.angle*PI/180))+Math.abs(Math.sin(p.angle*PI/180)))/pitchPixels;
 return {w:W,n,res,v:periodicBox(raw,W,W,C,Math.max(0,(footprint-1)/2)),p};
}
export function sampleWovenTile(tile,u,v,out){const x=mod(u*tile.res-.5,tile.w),y=mod(v*tile.res-.5,tile.w),ix=Math.floor(x),iy=Math.floor(y),jx=(ix+1)%tile.w,jy=(iy+1)%tile.w,fx=x-ix,fy=y-iy,a=tile.v,W=tile.w,i00=(iy*W+ix)*5,i10=(iy*W+jx)*5,i01=(jy*W+ix)*5,i11=(jy*W+jx)*5;
 for(let c=0;c<5;c++)out[c]=(a[i00+c]*(1-fx)+a[i10+c]*fx)*(1-fy)+(a[i01+c]*(1-fx)+a[i11+c]*fx)*fy;
 return out;
}
let tileCache=null;
export const clearWovenCache=()=>{tileCache=null;};
export const wovenCacheInfo=()=>({entries:tileCache?1:0,bytes:tileCache?tileCache.tile.v.byteLength:0});
function cachedTile(p,pitch){const key=JSON.stringify([pitch,...['weave','angle','coverage','crimp','gloss','roughness','light','elevation'].map(k=>p[k])]);if(tileCache?.key===key)return tileCache.tile;const tile=createWovenTile(p,pitch);tileCache={key,tile};return tile;}
const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;},encoded=v=>255*(v<=.0031308?12.92*Math.max(0,v):1.055*Math.max(0,v)**(1/2.4)-.055);
export function wovencloth(a,w,h,params){const p={...wovenDefaults,...params};if(!p.amount)return new Uint8ClampedArray(a);const pitch=p.size*Math.max(w,h)/1000,tile=cachedTile(p,pitch),ang=p.angle*PI/180,co=Math.cos(ang),si=Math.sin(ang),phaseU=hash(13,7,p.seed)*tile.n,phaseV=hash(17,11,p.seed)*tile.n,out=new Uint8ClampedArray(a.length),dye=p.dye/100,split=p.split/100,weights=new Float64Array(5);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const u=(x*co+y*si)/pitch+phaseU,v=(-x*si+y*co)/pitch+phaseV,i=(y*w+x)*4;sampleWovenTile(tile,u,v,weights);const wd=weights[0],ws=weights[1],hd=weights[2],hs=weights[3],gap=weights[4],dc=(Math.floor(u)+.5-u)*pitch*dye,dr=(Math.floor(v)+.5-v)*pitch*dye;
  for(let c=0;c<3;c++){const vertical=linear(sample(a,w,h,x+dc*co,y+dc*si,c)),horizontal=linear(sample(a,w,h,x-dr*si,y+dr*co,c)),factor=c===0?.55:c===1?-.08:-.45,value=vertical*(1+factor*split)*wd+horizontal*(1-factor*split)*hd+ws+hs+linear(a[i+c])*.2*gap;
   out[i+c]=a[i+c]+(encoded(value)-a[i+c])*p.amount/100;
  }out[i+3]=255;
 }return out;
}
