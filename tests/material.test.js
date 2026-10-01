import test from 'node:test';
import assert from 'node:assert/strict';
import {makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {varyLayers} from '../src/variations.js';
import {decodeRecipe,encodeRecipe} from '../src/recipes.js';
import {looks} from '../src/looks.js';
test('material operators have exact neutral controls',()=>{
 const a=new Uint8ClampedArray(32*48*4);for(let i=0;i<a.length;i+=4){a[i]=i%251;a[i+1]=(i*3)%255;a[i+2]=125;a[i+3]=255;}
 for(const [id,key] of [['wetprint','time'],['squeegee','pull'],['chromaticburn','burn'],['palimpsest','passes']]){const layer=makeLayer(id);layer.params[key]=0;assert.deepEqual(applyFilter(a,32,48,layer),a);}
});
test('variations preserve order and input, stay within valid recipe bounds and replay',()=>{
 for(const look of looks){
  const before=JSON.stringify(look.layers);
  for(const seed of [0,17,99862]){
   const next=varyLayers(look.layers,seed);
   assert.deepEqual(next.map(x=>x.id),look.layers.map(x=>x.id));
   assert.deepEqual(decodeRecipe(encodeRecipe(next)),next);
   assert.deepEqual(varyLayers(look.layers,seed),next);
   assert.equal(JSON.stringify(look.layers),before);
  }
 }
});
test('0.3 recipes remain compatible; new material operators require 0.4',()=>{
 const value=JSON.parse(encodeRecipe([makeLayer('thinfilm')]));value.engine='0.3';assert.equal(decodeRecipe(JSON.stringify(value))[0].id,'thinfilm');
 value.layers=[makeLayer('wetprint')];assert.throws(()=>decodeRecipe(JSON.stringify(value)));
});
