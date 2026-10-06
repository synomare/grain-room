import test from 'node:test';
import assert from 'node:assert/strict';
import {fitWeights,extractPalette,decomposePalette,recolorPalette,replacementColor,PLATE_COUNT} from '../src/palette-plates.js';
import {makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe} from '../src/recipes.js';
const image=(w,h,v=130)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:v);
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} vs ${b}`);

test('Constrained RGB fit agrees with analytical two-color mixtures and simplex bounds',()=>{
 const anchors=[[0,0,0,0,0],[1,1,1,1,1]];
 for(const value of [0,.1,.4,.8,1]){const weights=fitWeights([value,value,value,.2,.8],anchors,0,128);near(weights[1],value,1e-4);near(weights[0]+weights[1],1,1e-12);assert.ok(weights.every(v=>Number.isFinite(v)&&v>=0));}
 for(let i=0;i<30;i++){const q=[i%7/7,i%5/5,i%11/11,i%3/3,i%13/13],anchors=Array.from({length:6},(_,k)=>[(k*3)%7/7,k%3/3,k%5/5,k%4/4,k%2]);const w=fitWeights(q,anchors,100);near(w.reduce((a,b)=>a+b,0),1,1e-12);assert.ok(w.every(v=>v>=0));}
});

test('Redundant palettes permit non-affine one-component edits of equal RGB at different positions',()=>{
 const anchors=[[0,0,0,0,0],[.5,.5,.5,.5,1],[1,1,1,1,0]],a=fitWeights([.5,.5,.5,.5,1],anchors,100),b=fitWeights([.5,.5,.5,.5,0],anchors,100);
 near(a[1],1,.001);near(b[1],0,.001);
 for(const weights of [a,b])near(weights[1]*.5+weights[2],.5,1e-10);
 // Gray component .5 -> .8 changes the first sample, while the second stays .5.
 near(a[1]*.8+a[2],.8,.001);near(b[1]*.8+b[2],.5,.001);
 // A common affine transform acts identically on both reconstructed RGB values.
 for(const weights of [a,b])near(weights[0]*.1+weights[1]*.5+weights[2]*.9,.5,1e-10);
});

test('Palette extraction is global, deterministic, hue-ordered and collapses constants',()=>{
 const points=[[1,0,0,.1,.1],[0,0,1,.8,.7],[1,0,0,.9,.9],[0,0,1,.2,.3]];
 const anchors=extractPalette(points);assert.deepEqual(anchors,extractPalette(points));assert.equal(anchors.length,2);assert.deepEqual(anchors[0],[1,0,0,.5,.5]);assert.deepEqual(anchors[1],[0,0,1,.5,.5]);
 assert.deepEqual(extractPalette([[.5,.5,.5,.5,.5]]),[[.5,.5,.5,.5,.5]]);
 // XY centroid values must not participate in RGB hue/neutral ordering.
 const ordered=extractPalette([[.8,.78,.77,.01,.99],[.6,.1,.1,.99,.01],[.2,.5,.1,.5,.5]]);
 assert.deepEqual(ordered.map(v=>v.slice(0,3)),[[.6,.1,.1],[.2,.5,.1],[.8,.78,.77]]);
});

test('Weight maps are finite convex mixtures; full input and decomposition survive edits',()=>{
 const w=47,h=63,a=image(w,h);for(let i=0;i<a.length;i+=4){a[i]=i%256;a[i+1]=i*17%256;a[i+2]=i*3%256;}
 const saved=a.slice(),analysis=decomposePalette(a,w,h,25),weights=analysis.weights.slice(),anchors=structuredClone(analysis.anchors);
 for(let i=0;i<w*h;i++){let sum=0;for(let k=0;k<PLATE_COUNT;k++){const v=analysis.weights[i*PLATE_COUNT+k];assert.ok(Number.isFinite(v)&&v>=0);sum+=v;}near(sum,1,1e-7);}
 const c=analysis.anchors[0].slice(0,3);assert.deepEqual(recolorPalette(a,w,h,analysis,1,c),a);
 recolorPalette(a,w,h,analysis,1,[.1,.8,.9]);recolorPalette(a,w,h,analysis,3,[.9,.2,.1]);assert.deepEqual(analysis.weights,weights);assert.deepEqual(analysis.anchors,anchors);assert.deepEqual(a,saved);
 // Repeated decompositions depend on the same source and position, not target hue.
 assert.deepEqual(decomposePalette(a,w,h,25).weights,weights);
});

test('One-component difference matches fixed weights and residual formula, including clipping',()=>{
 const a=Uint8ClampedArray.of(30,40,50,255,220,230,240,255),weights=new Float32Array(2*6);weights[0]=.25;weights[6]=.75;
 const analysis={w:2,h:1,anchors:[[.2,.3,.4,.5,.5]],weights},target=[.5,.1,.9],out=recolorPalette(a,2,1,analysis,1,target,80);
 for(let i=0;i<2;i++)for(let c=0;c<3;c++){const expected=Math.min(255,Math.max(0,a[i*4+c]+255*weights[i*6]*(target[c]-analysis.anchors[0][c])*.8));assert.ok(Math.abs(out[i*4+c]-expected)<=.5);}
 assert.deepEqual(recolorPalette(a,2,1,analysis,1,target,0),a);
 assert.deepEqual(recolorPalette(a,2,1,analysis,6,target),a);
 const mask=recolorPalette(a,2,1,analysis,1,target,80,1);assert.equal(mask[0],64);assert.equal(mask[4],191);assert.equal(mask[3],255);
});

test('Tiny constants, monochrome and transparent sources have defined behavior',()=>{
 const layer=makeLayer('paletteplates');
 for(const [w,h] of [[1,1],[1,31],[29,1]]){const out=applyFilter(image(w,h,130),w,h,layer);assert.equal(out.length,w*h*4);for(let i=0;i<out.length;i+=4)assert.equal(out[i+3],255);}
 const a=image(19,21,0);for(let i=3;i<a.length;i+=4)a[i]=0;
 layer.params.replace=0;assert.deepEqual(applyFilter(a,19,21,layer),image(19,21,255));
 layer.params.replace=75;layer.params.colorMode='mono';const out=applyFilter(a,19,21,layer);for(let i=0;i<out.length;i+=4)assert.ok(out[i]===out[i+1]&&out[i]===out[i+2]);
 assert.deepEqual(replacementColor(190,65,100),[1,1,1]);assert.deepEqual(replacementColor(190,65,0),[0,0,0]);assert.deepEqual(replacementColor(0,100,50),[1,0,0]);
});

test('Recipe version gates new components while accepting v0.19 hook and v0.20 pupil',()=>{
 const layer=makeLayer('paletteplates');assert.deepEqual(decodeRecipe(encodeRecipe([layer])),[layer]);
 for(let n=2;n<=20;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([layer])),engine:'0.'+n})));
 for(const [id,version] of [['artisticscreen','0.19'],['pupilpsf','0.20']]){const old=makeLayer(id);assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:version})),[old]);}
 for(const [key,value] of [['component',7],['component',1.5],['position',101],['view',2]])assert.throws(()=>decodeRecipe(encodeRecipe([{...layer,params:{...layer.params,[key]:value}}])));
});
