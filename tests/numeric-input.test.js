import test from 'node:test';
import assert from 'node:assert/strict';
import {commitNumber} from '../src/numeric-value.js';
test('incomplete and invalid drafts preserve committed values',()=>{
  for(const draft of ['',' ','-','.','-.','Infinity','NaN','2e'])assert.equal(commitNumber(draft,17,-60,60,.5),17);
});
test('negative values, decimal steps and range boundaries commit correctly',()=>{
  assert.equal(commitNumber('-12',0,-60,60),-12);
  assert.equal(commitNumber('1.3',1,.5,4,.5),1.5);
  assert.equal(commitNumber('0.3',0,0,1,.1),.3);
  assert.equal(commitNumber('9999',20,0,100),100);
  assert.equal(commitNumber('-100',20,0,100),0);
  assert.equal(commitNumber('−１２．５',0,-60,60,.5),-12.5);
});
