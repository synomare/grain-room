import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFilter,renderPipeline} from '../src/engine.js';
import {filters,makeLayer} from '../src/filters.js';
const source=(w,h,fn)=>new Uint8ClampedArray(Array.from({length:w*h},(_,i)=>[...fn(i%w,Math.floor(i/w)),255]).flat());
test('all effects are deterministic, opaque, bounded, and preserve the source',()=>{
  const w=31,h=47,pixels=source(w,h,(x,y)=>[x*8,y*5,(x+y)*3]),saved=pixels.slice();
  for(const f of filters){const layer=makeLayer(f.id),a=applyFilter(pixels,w,h,layer),b=applyFilter(pixels,w,h,layer);assert.deepEqual(a,b,f.id);assert.equal(a.length,w*h*4);for(let i=0;i<a.length;i+=4)assert.equal(a[i+3],255);}
  assert.deepEqual(pixels,saved);
});
test('neutral monochrome preserves gray values; inversion complements them',()=>{
  const input=source(256,1,x=>[x,x,x]),p={brightness:0,contrast:100,grain:0,invert:false};
  assert.deepEqual(applyFilter(input,256,1,{id:'mono',params:p}),input);
  const inverted=applyFilter(input,256,1,{id:'mono',params:{...p,invert:true}});
  for(let x=0;x<256;x++)assert.equal(inverted[x*4],255-x);
});
test('zero wave amplitude is identity and flat images have no edges',()=>{
  const w=40,h=50,input=source(w,h,(x,y)=>[x*4+y,x*4+y,x*4+y]);
  const neutral={brightness:0,contrast:100,grain:0,invert:false};
  assert.deepEqual(applyFilter(input,w,h,{id:'wave',params:{...neutral,amplitude:0,frequency:6,phase:0}}),input);
  const edges=applyFilter(source(w,h,()=>[128,128,128]),w,h,makeLayer('contour'));
  assert.ok(edges.every(v=>v===255));
});
test('all three dithers preserve black and white endpoints and emit only one bit',()=>{
  for(const mode of ['atkinson','floyd','bayer'])for(const tone of [0,255]){
    const p={...makeLayer('dither').params,contrast:100,mode};const result=applyFilter(source(64,64,()=>[tone,tone,tone]),64,64,{id:'dither',params:p});
    for(let i=0;i<result.length;i+=4)assert.equal(result[i],tone);
  }
  for(const mode of ['atkinson','floyd','bayer']){
    const layer=makeLayer('dither');layer.params.mode=mode;const out=applyFilter(source(50,50,(x,y)=>[x*5,y*5,128]),50,50,layer);
    for(let i=0;i<out.length;i+=4)assert.ok(out[i]===0||out[i]===255);
  }
});
test('ordered layers compose their output; transparent pixels flatten to white',()=>{
  const input=source(40,40,(x,y)=>[x*6,y*6,100]),a=makeLayer('wave'),b=makeLayer('halftone');
  assert.deepEqual(renderPipeline(input,40,40,[a,b]),applyFilter(applyFilter(input,40,40,a),40,40,b));
  assert.deepEqual(renderPipeline(input,40,40,[]),input);
  assert.deepEqual(applyFilter(new Uint8ClampedArray([0,0,0,0]),1,1,makeLayer('mono')),new Uint8ClampedArray([255,255,255,255]));
});

test('color remains color; all operators support explicit monochrome and zero mix',()=>{
 const w=48,h=64,pixels=source(w,h,(x,y)=>[x*5,y*3,180]);
 assert.deepEqual(applyFilter(pixels,w,h,makeLayer('mono')),pixels);
 for(const f of filters){
  const layer=makeLayer(f.id);layer.params.colorMode='mono';
  const out=applyFilter(pixels,w,h,layer);
  for(let i=0;i<out.length;i+=4){assert.equal(out[i],out[i+1],f.id);assert.equal(out[i],out[i+2],f.id);}
  layer.params.mix=0;assert.deepEqual(applyFilter(pixels,w,h,layer),pixels,f.id);
 }
});
test('neutral stacking never silently removes color',()=>{
 const pixels=source(48,64,(x,y)=>[x*5,y*3,180]),layer=makeLayer('flow');
 assert.deepEqual(renderPipeline(pixels,48,64,[layer,makeLayer('mono')]),applyFilter(pixels,48,64,layer));
 layer.params.distance=0;assert.deepEqual(applyFilter(pixels,48,64,layer),pixels);
});
test('seeded processes vary their output and recipe round trips exactly',async()=>{
 const {encodeRecipe,decodeRecipe}=await import('../src/recipes.js');
 const pixels=source(60,80,(x,y)=>[x*4,y*3,(x*y)%255]);
 for(const id of ['memory','flow','shards','reaction','slit','mosaic']){
  const a=makeLayer(id),b=makeLayer(id);b.params.seed=154;
  assert.notDeepEqual(applyFilter(pixels,60,80,a),applyFilter(pixels,60,80,b),id);
 }
 const layers=[makeLayer('flow'),makeLayer('prism')];layers[0].params.seed=291;layers[1].params.mix=45;
 assert.deepEqual(decodeRecipe(encodeRecipe(layers)),layers);
 assert.deepEqual(renderPipeline(pixels,60,80,decodeRecipe(encodeRecipe(layers))),renderPipeline(pixels,60,80,layers));
 for(const bad of ['{}','invalid',encodeRecipe([{id:'missing',params:{}}]),encodeRecipe([{id:'flow',params:{distance:Infinity}}]),encodeRecipe([{id:'fold',params:{segments:2.5}}])])assert.throws(()=>decodeRecipe(bad));
});
test('transparent narrow and tiny inputs remain valid across the entire library',()=>{
 for(const [w,h] of [[1,1],[1,9],[9,1]])for(const f of filters){
  const out=applyFilter(new Uint8ClampedArray(w*h*4),w,h,makeLayer(f.id));
  assert.equal(out.length,w*h*4);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);
 }
});
