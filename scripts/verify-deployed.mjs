import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base=new URL(process.argv[2]||'https://synomare.github.io/grain-room/'),sha=process.argv[3]||process.env.GITHUB_SHA;
assert.ok(sha,'Expected commit is required');
let info;
for(let attempt=0;attempt<18;attempt++){
 try{const response=await fetch(new URL('build-info.json?commit='+sha+'&attempt='+attempt,base),{signal:AbortSignal.timeout(20000),cache:'no-store'});if(response.ok){const value=await response.json();if(value.commit===sha){info=value;break;}}}catch{}
 if(attempt<17)await new Promise(r=>setTimeout(r,10000));
}
assert.ok(info,'Published commit did not match '+sha);
assert.equal(info.app,'grain-room');assert.ok(info.files.length>10);
// Every published resource, including Worker, samples, font, licenses and recipes.
for(let i=0;i<info.files.length;i+=5)await Promise.all(info.files.slice(i,i+5).map(async file=>{
 const url=new URL(file.path,base);url.searchParams.set('commit',sha);
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,200,file.path);const data=Buffer.from(await response.arrayBuffer());
 assert.equal(data.length,file.bytes,file.path+' size');assert.equal(createHash('sha256').update(data).digest('hex'),file.sha256,file.path+' hash');
}));
console.log(`Verified ${info.files.length} production files at ${base} against ${sha}`);
