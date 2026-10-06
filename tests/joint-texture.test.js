import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {textureGuide,textureFrame,textureAnalyze,textureRebuild,fieldCovariance,covarianceTransport,rankHistogram,matchSpectrum,phaseRelations,matchPhaseRelations,compositionProject,textureSynthesize,renderTexture,jointTexture} from '../src/joint-texture.js';
import {fft2} from '../src/research-spectral.js';import {filters,makeLayer}from'../src/filters.js';import {looks}from'../src/looks.js';import {applyFilter}from'../src/engine.js';import {encodeRecipe,decodeRecipe,ENGINE_VERSION}from'../src/recipes.js';
const p=makeLayer('jointtexture').params,near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`),image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256),fourier=(a,w,h)=>{const re=a.slice(),im=new Float64Array(a.length);fft2(re,im,w,h);return{re,im};};
const maxDifference=(a,b)=>Math.max(...a.map((v,i)=>Math.abs(v-b[i])));
const flat=a=>a.flatMap(r=>Array.from(r)),error=(a,b)=>a.reduce((s,v,i)=>s+(v-b[i])**2,0);

test('Area-integrated power-of-two guide keeps native spacing without upsampling narrow images',()=>{
 const a=new Uint8ClampedArray(5*2*4);for(let y=0;y<2;y++)for(let x=0;x<5;x++)a.set([x*40,x*40,x*40,255],(y*5+x)*4);const g=textureGuide(a,5,2);assert.equal(g.w,4);assert.equal(g.h,2);near(g.dx,1.25);near(g.dy,1);near(g.l[0],8/255);near(g.l[1],56/255);near(g.l[2],104/255);near(g.l[3],152/255);
 const n=textureGuide(image(1,769),1,769);assert.equal(n.w,1);assert.equal(n.h,128);near(n.dx,1);near(n.dy,769/128);
});

test('Twelve analytic bands and the residual reconstruct DC, Nyquist, oriented waves and native aspect ratios',()=>{
 for(const [w,h,dx,dy]of[[32,32,1,1],[16,32,3,2],[1,32,1,5],[32,1,5,1]])for(const scale of [0,100]){
  const input=Float64Array.from({length:w*h},(_,i)=>.4+.15*Math.cos((i%w)*Math.PI/4)+.12*Math.sin(Math.floor(i/w)*Math.PI/8)+.07*((i%w)%2?1:-1)),saved=input.slice(),f=textureFrame(w,h,dx,dy,Math.max(w*dx,h*dy),scale),a=textureAnalyze(input,f),r=textureRebuild(a,f);assert.equal(a.bands.length,12);assert.ok(maxDifference(r,input)<1e-9);assert.deepEqual(input,saved);assert.equal(f.residual[0],1);assert.ok(f.filters.every(b=>b[0]===0));assert.ok([...r,...a.bands.flatMap(b=>[...b.re,...b.im])].every(Number.isFinite));
 }
 const f=textureFrame(32,32,2,1,64,0);near(f.radius[1],1);near(f.radius[32],2);
});

test('Whitening/coloring matches covariance and means, with owned outputs and a neutral zero amount',()=>{
 const x=Float64Array.from({length:128},(_,i)=>Math.cos(i*2*Math.PI/128)),y=Float64Array.from(x,(_,i)=>Math.sin(i*2*Math.PI/128)),source=[x,y],targetFields=[Float64Array.from(x,(v,i)=>2*v+.5*y[i]+3),Float64Array.from(y,(v,i)=>.7*v-.3*x[i]-2)],target=fieldCovariance(targetFields),out=covarianceTransport(source,target),stats=fieldCovariance(out);
 for(let i=0;i<2;i++){near(stats.mean[i],target.mean[i]);for(let j=0;j<2;j++)near(stats.cov[i][j],target.cov[i][j],5e-6);}const copy=covarianceTransport(source,target,0);assert.deepEqual(copy,source);copy[0][0]=999;assert.equal(x[0],1);assert.ok(out.flatMap(a=>Array.from(a)).every(Number.isFinite));
 const flatOut=covarianceTransport([new Float64Array(4),new Float64Array(4)],target);assert.ok(flatOut.flatMap(a=>Array.from(a)).every(Number.isFinite));
});

test('Spectrum projection matches periodic autocorrelation while rank projection retains the exact luminance distribution',()=>{
 const w=16,h=8,input=Float64Array.from({length:w*h},(_,i)=>.4+.2*Math.sin(i*.7)),target=Float64Array.from(input,(_,i)=>.3+.1*Math.cos(i*.91)),t=fourier(target,w,h),result=matchSpectrum(input,t.re,t.im,w,h,1),r=fourier(result,w,h);
 for(let i=0;i<input.length;i++)near(Math.hypot(r.re[i],r.im[i]),Math.hypot(t.re[i],t.im[i]),1e-9);assert.deepEqual(matchSpectrum(input,t.re,t.im,w,h,0),input);
 const zero=matchSpectrum(new Float64Array(input.length),t.re,t.im,w,h,1);assert.ok(maxDifference(zero,target)<1e-9);
 assert.deepEqual(Array.from(rankHistogram([3,1,1,2],[10,20,30,40])),[40,10,20,30]);assert.deepEqual(Array.from(rankHistogram(input,Array.from(target).sort((a,b)=>a-b))).sort((a,b)=>a-b),Array.from(target).sort((a,b)=>a-b));
});

test('Parent phase doubling retains amplitude and the cross-scale projection reduces the actual conditional error',()=>{
 const n=128,t=Float64Array.from({length:n},(_,i)=>i*2*Math.PI/n),parent=[{re:Float64Array.from(t,v=>2*Math.cos(v)),im:Float64Array.from(t,v=>2*Math.sin(v))}],fine=[{re:Float64Array.from(t,v=>Math.cos(2*v)),im:Float64Array.from(t,v=>Math.sin(2*v))}],target=phaseRelations(fine,parent);near(target.cross[0][0],1);near(target.cross[1][1],1);near(target.cross[0][1],0);near(target.cross[1][0],0);
 const shifted=[{re:Float64Array.from(t,v=>Math.cos(2*v+.6)),im:Float64Array.from(t,v=>Math.sin(2*v+.6))}],saved=structuredClone(parent),before=error(flat(phaseRelations(shifted,parent).cross),flat(target.cross));matchPhaseRelations(shifted,parent,target,1);const after=error(flat(phaseRelations(shifted,parent).cross),flat(target.cross));assert.ok(after<before*.01);assert.deepEqual(parent,saved);
 const inverted=parent.map(b=>({re:Float64Array.from(b.re,v=>-v),im:Float64Array.from(b.im,v=>-v)}));for(let i=0;i<2;i++)for(let j=0;j<2;j++)near(phaseRelations(fine,inverted).cross[i][j],target.cross[i][j]);
});

test('Large-scale Fourier composition is constrained at initialization and after every synthesis iteration',()=>{
 const w=32,h=32,source=Float64Array.from({length:w*h},(_,i)=>.4+.2*Math.cos((i%w)*2*Math.PI/w)+.05*Math.sin(i*.7)),f=textureFrame(w,h,1,1,32,0),s=fourier(source,w,h),trace=[];
 const result=textureSynthesize(source,f,{...p,iterations:4,structure:100},{progress:(it,v)=>{trace.push(it);const q=fourier(v,w,h);for(let i=0;i<v.length;i++)if(f.radius[i]<=f.cutoff){near(q.re[i],s.re[i],1e-8);near(q.im[i],s.im[i],1e-8);}}});assert.deepEqual(trace,[0,1,2,3,4]);assert.ok(result.value.every(Number.isFinite));
 const random=Float64Array.from(source,(_,i)=>Math.sin(i*.81));assert.deepEqual(compositionProject(random,s.re,s.im,f,0).map(v=>Math.round(v*1e9)),random.map(v=>Math.round(v*1e9)));
});

test('Combined constraints improve both measured magnitude covariance and cross-scale phase over independent bands',()=>{
 const w=128,h=128,source=Float64Array.from({length:w*h},(_,i)=>{const x=i%w,y=Math.floor(i/w);return((x%20-10)**2+(y%20-10)**2<25)?.1:.8;}),f=textureFrame(w,h,1,1,128,0),full=textureSynthesize(source,f,{...p,iterations:12}),independent=textureSynthesize(source,f,{...p,iterations:12,join:0,polarity:0});
 const metrics=value=>{const b=textureAnalyze(value,f).bands,m=b.map(b=>Float64Array.from(b.re,(v,i)=>Math.hypot(v,b.im[i]))),phase=[phaseRelations(b.slice(0,4),b.slice(4,8)),phaseRelations(b.slice(4,8),b.slice(8,12))];return [error(flat(fieldCovariance(m).cov),flat(full.model.cov.cov)),error(phase.flatMap(p=>flat(p.cross)),full.model.phase.flatMap(p=>flat(p.cross)))];};const a=metrics(full.value),b=metrics(independent.value);assert.ok(a[0]<b[0]*.6);assert.ok(a[1]<b[1]*.4);
});

test('Native detail and chroma are restored separately; the optional envelope gate suppresses smooth source regions',()=>{
 const w=768,h=4,a=new Uint8ClampedArray(w*h*4);for(let i=0;i<a.length;i+=4){const v=Math.floor((i/4)%w/2)%2?160:80;a.set([v+10,v,v-10,255],i);}const g=textureGuide(a,w,h),result={value:Float64Array.from(g.l,v=>v+.04),model:{mag:[new Float64Array(g.l.length).fill(1)]}},out=renderTexture(a,w,h,g,result,{...p,amount:100,locality:0});
 for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)near(out[i+c],a[i+c]+.04*255,.501);assert.equal(out[8]-out[0],80);
 const identity=renderTexture(a,w,h,g,{...result,value:g.l},{...p,detail:100,color:100});assert.deepEqual(identity,a);
 const gateResult={value:Float64Array.from(g.l,v=>v+.04),model:{mag:[Float64Array.from(g.l,(_,i)=>i<g.l.length/2?0:1)]}},gated=renderTexture(a,w,h,g,gateResult,{...p,amount:100,locality:100});assert.equal(gated[0],a[0]);assert.ok(gated.at(-4)>a.at(-4));
 const gray=renderTexture(a,w,h,g,result,{...p,detail:0,color:0,locality:0});for(let i=0;i<gray.length;i+=4)assert.equal(gray[i],gray[i+1]);
});

test('Tiny, narrow, constant and extreme float states stay finite before coercion and preserve Buffer ownership',()=>{
 for(const [w,h]of[[1,1],[1,33],[35,1],[5,7],[32,48]])for(const scale of [0,100]){
  const a=Buffer.from(image(w,h)),saved=Buffer.from(a),g=textureGuide(a,w,h),f=textureFrame(g.w,g.h,g.dx,g.dy,g.long,scale),extreme={...p,scale,iterations:3,structure:0,regularity:100,amount:180,detail:0,color:0},result=textureSynthesize(g.l,f,extreme);assert.ok(result.value.every(Number.isFinite));assert.ok(result.model.analysis.bands.flatMap(b=>[...b.re,...b.im]).every(Number.isFinite));const out=jointTexture(a,w,h,extreme);assert.equal(out.length,a.length);assert.deepEqual(a,saved);out[0]=255-a[0];assert.deepEqual(a,saved);
 }
 for(const v of [0,127,255]){const a=new Uint8ClampedArray(9*7*4);for(let i=0;i<a.length;i+=4)a.set([v,v,v,255],i);assert.deepEqual(jointTexture(a,9,7,p),a);}
 const a=Buffer.from(image(5,7)),saved=Buffer.from(a),zero=jointTexture(a,5,7,{...p,amount:0});assert.deepEqual(Buffer.from(zero),a);zero[0]=255-a[0];assert.deepEqual(a,saved);
});

test('Seed, all visible controls, common alpha/mix/monochrome and deterministic restores operate through the engine',()=>{
 const w=32,h=48,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=i*19%256;const saved=a.slice(),l=makeLayer('jointtexture'),full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...p,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...p,colorMode:'mono'}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++)near(half[i+c],(a[i+c]*a[i+3]/255+255-a[i+3]+full[i+c])/2,.501);}
 for(const change of [{scale:60},{iterations:4},{structure:0},{regularity:0},{join:0},{polarity:0},{amount:150},{detail:0},{color:0},{locality:0},{seed:917}]){assert.notDeepEqual(applyFilter(a,w,h,{...l,params:{...p,...change}}),full,JSON.stringify(change));assert.deepEqual(applyFilter(a,w,h,l),full);}assert.deepEqual(a,saved);
});

test('0.30 gate retains 0.29 phase and 0.28 directional settings, rejects future fields and restores every public recipe',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const l=makeLayer('jointtexture');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=29;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const [id,engine]of[['phasefold','0.29'],['waveweft','0.28']]){const old=makeLayer(id);if(id==='waveweft')old.params.crossfreq=35;assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine})),[old]);}
 for(const [key,v]of[['scale',101],['iterations',2],['iterations',12.5],['structure',-1],['regularity',101],['join',101],['polarity',101],['amount',181],['detail',-1],['color',101],['locality',101],['seed',100000],['unknown',1]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...p,[key]:v}}])));
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
