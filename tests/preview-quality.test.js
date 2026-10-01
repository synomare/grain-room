import test from 'node:test';
import assert from 'node:assert/strict';
import {previewPlan,renderBestPreview} from '../src/preview-quality.js';
test('preview retains native pixels, including Retina-sized and thin images',()=>{
  assert.deepEqual(previewPlan(1536,1024,8),{edge:1536,width:1536,height:1024,limited:false});
  assert.deepEqual(previewPlan(6000,4000,8),{edge:6000,width:6000,height:4000,limited:false});
  assert.deepEqual(previewPlan(4096,1,8),{edge:4096,width:4096,height:1,limited:false});
});
test('large images respect memory and maximum-edge budgets without upscaling',()=>{
  for(const memory of [2,4,8,undefined])for(const [w,h] of [[10000,6000],[9000,1],[800,600]]){
    const p=previewPlan(w,h,memory),limit=memory===2?4e6:memory===4?8e6:memory?24e6:16e6;
    assert.ok(p.width*p.height<=limit&&p.edge<=8192&&p.width<=w&&p.height<=h);
    assert.ok(p.width>0&&p.height>0);
  }
});
test('capacity failure retries a smaller sharp frame and marks the limit',async()=>{
  const attempts=[],renderer={render:async(_,__,edge)=>{attempts.push(edge);if(edge>3000)throw Error('capacity');return {width:edge,height:edge};}};
  const result=await renderBestPreview(renderer,{width:6000,height:4000},[],previewPlan(6000,4000,8),()=>true);
  assert.deepEqual(attempts,[6000,3000]);assert.equal(result.data.width,3000);assert.equal(result.limited,true);
});
test('superseded work cannot publish pixels or start fallback work',async()=>{
  let current=true,calls=0;
  const result=await renderBestPreview({render:async()=>{calls++;current=false;throw Error('cancelled');}},{width:6000,height:4000},[],previewPlan(6000,4000,8),()=>current);
  assert.equal(result,null);assert.equal(calls,1);
  current=true;
  const late=await renderBestPreview({render:async()=>{current=false;return {width:6000};}},{width:6000,height:4000},[],previewPlan(6000,4000,8),()=>current);
  assert.equal(late,null);
});
