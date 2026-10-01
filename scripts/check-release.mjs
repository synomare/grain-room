import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const info=JSON.parse(await readFile('dist/build-info.json','utf8'));
const html=await readFile('dist/index.html','utf8');
assert.ok(html.includes('/grain-room/assets/'));
assert.ok(!html.includes('local-fonts'));
for(const file of info.files){
 assert.ok(!/Replica|\.otf$|\.env|node_modules|sourceMappingURL/i.test(file.path),file.path);
 if(/\.(js|css|html)$/.test(file.path)){
  const text=await readFile('dist/'+file.path,'utf8');
  assert.ok(!text.includes('C:/Users/'),file.path+' local path');
  assert.ok(!text.includes('/local-fonts/replica'),file.path+' local font');
  assert.ok(!/["']\/sample-(?:color|calla|architecture)\.png/.test(text),file.path+' root sample');
 }
}
for(const path of ['sample-color.png','sample-calla.png','sample-architecture.png','fonts/ZenKakuGothicNew-Regular.ttf','fonts/Zen-OFL.txt','licenses/Mixwell-MIT.txt'])assert.ok(info.files.some(f=>f.path===path),path);
assert.ok(info.files.some(f=>/^assets\/render\.worker-.*\.js$/.test(f.path)));
console.log('Release paths, Worker, sample images and permitted fonts/licenses verified');
