import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{componentDefaults,componentWorkspace,componentTree,componentOpening,componentClosing,componentAreas,componentIslands}from'../src/component-islands.js';import{filters,makeLayer}from'../src/filters.js';import{looks}from'../src/looks.js';import{applyFilter}from'../src/engine.js';import{encodeRecipe,decodeRecipe,ENGINE_VERSION}from'../src/recipes.js';
const base=makeLayer('componentislands').params,near=(a,b,e=1)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`),image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:125+40*Math.sin(Math.floor(i/4)%w/17+i%4)+35*Math.cos(Math.floor(i/(4*w))/23)+(i*13%17));
function components(a,w,h,g,conn){const seen=new Uint8Array(a.length),result=[];for(let p=0;p<a.length;p++){if(seen[p]||a[p]<g)continue;const queue=[p];seen[p]=1;for(let head=0;head<queue.length;head++){const k=queue[head],x=k%w,y=Math.floor(k/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy||conn===4&&dx&&dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=w||yy>=h)continue;const q=yy*w+xx;if(!seen[q]&&a[q]>=g){seen[q]=1;queue.push(q);}}}result.push(queue);}return result;}
function brute(a,w,h,threshold,conn){const out=new Uint8Array(a.length);out.fill(Math.min(...a));for(let g=1;g<=255;g++)for(const c of components(a,w,h,g,conn))if(c.length>=threshold)for(const q of c)out[q]=g;return out;}
test('max-tree opening matches independent threshold-by-threshold BFS on plateaus and tiny axes',()=>{
 let seed=17;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)>>>0);
 for(let trial=0;trial<35;trial++){const w=1+rand()%8,h=1+rand()%7,a=Uint8Array.from({length:w*h},()=>rand()%5*51),saved=a.slice();for(const conn of[4,8])for(const threshold of[1,2,4,9,a.length+1])assert.deepEqual(componentOpening(a,w,h,threshold,conn),brute(a,w,h,threshold,conn),JSON.stringify({w,h,trial,conn,threshold}));assert.deepEqual(a,saved);}
});
test('canonical nodes have exact threshold-component areas and parents precede every child',()=>{
 const w=9,h=7,a=Uint8Array.from({length:w*h},(_,i)=>(i*37+i%w*13)%7*31);
 for(const conn of[4,8]){const t=componentTree(a,w,h,conn),rank=new Int32Array(a.length);t.order.forEach((p,k)=>rank[p]=k);assert.equal(t.area[t.order[0]],a.length);for(let p=0;p<a.length;p++){const q=t.parent[p];assert.ok(rank[q]<=rank[p]);assert.ok(a[q]<=a[p]);if(p===q||a[p]!==a[q])assert.equal(t.area[p],components(a,w,h,a[p],conn).find(c=>c.includes(p)).length);else assert.ok(q===t.parent[q]||a[q]!==a[t.parent[q]]);}}
});
test('area opening is antiextensive, increasing, idempotent and ordered by area threshold',()=>{
 const w=13,h=9,a=Uint8Array.from({length:w*h},(_,i)=>(i*47)%256),b=Uint8Array.from(a,(v,i)=>Math.min(255,v+i%17));for(const conn of[4,8])for(const threshold of[2,7,19,200]){const out=componentOpening(a,w,h,threshold,conn),larger=componentOpening(a,w,h,threshold+13,conn),higher=componentOpening(b,w,h,threshold,conn);assert.deepEqual(componentOpening(out,w,h,threshold,conn),out);out.forEach((v,i)=>{assert.ok(v<=a[i]);assert.ok(larger[i]<=v);assert.ok(higher[i]>=v);});}
});
test('closing is the exact complemented opening and obeys the dual bounds',()=>{
 const w=7,h=11,a=Uint8Array.from({length:w*h},(_,i)=>i*37%256),saved=a.slice(),ws=componentWorkspace(a.length);for(const conn of[4,8])for(const threshold of[1,4,11,200]){const out=componentClosing(a,w,h,threshold,conn,ws);assert.deepEqual(out,Uint8Array.from(brute(Uint8Array.from(a,v=>255-v),w,h,threshold,conn),v=>255-v));assert.deepEqual(componentClosing(out,w,h,threshold,conn,ws),out);out.forEach((v,i)=>assert.ok(v>=a[i]));}assert.deepEqual(a,saved);
});
test('diagonal connections join a complete component while four directions remove isolated points',()=>{
 const a=Uint8Array.from([200,0,0,0,200,0,0,0,200]);assert.deepEqual(componentOpening(a,3,3,3,8),a);assert.ok(componentOpening(a,3,3,3,4).every(v=>v===0));
});
test('area threshold preserves all 1537 native columns when each complete stripe meets the size',()=>{
 const w=1537,h=3,a=Uint8Array.from({length:w*h},(_,i)=>i%w%2?200:30);assert.deepEqual(componentOpening(a,w,h,3),a);const removed=componentOpening(a,w,h,4);assert.ok(removed.every(v=>v===30));
});
test('area units scale quadratically with image size and independently weight light and dark islands',()=>{
 assert.deepEqual(componentAreas(1000,700,base),[576,576]);assert.deepEqual(componentAreas(2000,1400,base),[2304,2304]);assert.deepEqual(componentAreas(1000,700,{...base,balance:80}),[2304,144]);assert.deepEqual(componentAreas(1000,700,{...base,balance:-80}),[144,2304]);
});
test('all eight controls change and restore native RGB without changing the input',()=>{
 const w=239,h=167,a=image(w,h),saved=a.slice(),initial=componentIslands(a,w,h,base),changes={size:64,balance:60,polarity:100,detail:80,relief:50,mode:0,diagonal:1,amount:45};for(const[key,value]of Object.entries(changes)){assert.notDeepEqual(componentIslands(a,w,h,{...base,[key]:value}),initial,key);assert.deepEqual(componentIslands(a,w,h,base),initial,key+' restore');}assert.deepEqual(a,saved);assert.equal(filters.find(f=>f.componentislands).random,false);
});
test('constant colours and fully returned detail retain source colour and zero amount owns the source',()=>{
 const w=173,h=127,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>[31,129,214,255][i%4]);for(const mode of[0,1])assert.deepEqual(componentIslands(a,w,h,{...base,size:80,mode,relief:100}),a);const photo=image(w,h);assert.deepEqual(componentIslands(photo,w,h,{...base,detail:100}),photo);photo[3]=17;const zero=componentIslands(photo,w,h,{...base,amount:0});assert.notEqual(zero,photo);assert.deepEqual(zero,photo);const full=componentIslands(photo,w,h,base),half=componentIslands(photo,w,h,{...base,amount:50});for(let i=0;i<photo.length;i++)if(i%4!==3)near(half[i],(photo[i]+full[i])/2);
});
test('islands retain dimensions and ownership on one-pixel axes and extreme settings',()=>{
 for(const[w,h]of[[1,1],[1,47],[47,1],[3,7],[79,101]]){const a=image(w,h),saved=a.slice(),out=componentIslands(a,w,h,{...base,size:80,balance:-80,polarity:-100,relief:100,mode:0,diagonal:1});assert.equal(out.length,a.length);assert.notEqual(out,a);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);assert.deepEqual(a,saved);}
});
test('tree workspace reuse does not mix photographs, channels or connected-component attributes',()=>{
 const a=Uint8Array.from({length:33},(_,i)=>i*17%256),b=Uint8Array.from(a,v=>255-v),ws=componentWorkspace(a.length);const expected=componentOpening(a,11,3,7);componentClosing(b,11,3,13,8,ws);assert.deepEqual(componentOpening(a,11,3,7,4,ws),expected);const p=image(239,167),q=image(167,239);const before=componentIslands(p,239,167,base);componentIslands(q,167,239,{...base,mode:0,balance:-60});assert.deepEqual(componentIslands(p,239,167,base),before);
});
test('engine composites transparent inputs and supports mix, monochrome and inversion',()=>{
 const w=151,h=113,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=(i*7)%256;const saved=a.slice(),l=makeLayer('componentislands'),full=applyFilter(a,w,h,l),zero=applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}}),inverted=applyFilter(a,w,h,{...l,params:{...l.params,invert:true}});for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++){near(zero[i+c],a[i+c]*a[i+3]/255+255-a[i+3],.5);assert.equal(inverted[i+c],255-full[i+c]);}assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i+1],mono[i+2]);}assert.deepEqual(a,saved);
});
test('0.42 adds islands, accepts 0.41 grooves and round-trips all public presets',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);assert.equal(filters.find(f=>f.componentislands).controls.length,8);const l=makeLayer('componentislands');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=41;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('shocklines');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.41'})),[old]);for(const[key,value]of[['size',81],['balance',-81],['mode',.5],['diagonal',2],['polarity',101],['relief',101],['detail',-1],['amount',101]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
