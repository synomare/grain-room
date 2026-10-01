import test from 'node:test';
import assert from 'node:assert/strict';
import {viewScale,clampCamera,zoomAt} from '../src/viewport-math.js';
const frame={width:800,height:600},size={width:1000,height:500};
test('fit contains and fill covers both portrait and landscape',()=>{
  for(const img of [size,{width:500,height:1000}]){
    const fit=viewScale('fit',frame,img),fill=viewScale('fill',frame,img);
    assert.ok(img.width*fit<=800&&img.height*fit<=600);
    assert.ok(img.width*fill>=800&&img.height*fill>=600);
    assert.equal(viewScale('actual',frame,img),1);
  }
});
test('zoom preserves the image point under cursor, and reverses without drift',()=>{
  const c={scale:2,x:30,y:-10},p={x:110,y:-80},next=zoomAt(c,1.3,p,frame,size);
  for(const axis of ['x','y'])assert.ok(Math.abs((p[axis]-c[axis])/c.scale-(p[axis]-next[axis])/next.scale)<1e-10);
  const back=zoomAt(next,1/1.3,p,frame,size);
  for(const k of ['scale','x','y'])assert.ok(Math.abs(back[k]-c[k])<1e-10);
});
test('pan bounds prevent losing the image; undersized axes stay centered',()=>{
  assert.deepEqual(clampCamera({scale:1,x:1e4,y:-1e4},frame,size),{scale:1,x:100,y:0});
  const low=zoomAt({scale:1,x:0,y:0},1e-9,{x:200,y:100},frame,size);
  assert.deepEqual(low,{scale:.2,x:0,y:0});
  assert.equal(zoomAt(low,1e9,{x:0,y:0},frame,size).scale,12.8);
});
