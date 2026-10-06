import test from 'node:test';import assert from 'node:assert/strict';
import {shapeDescriptor,shapeDistance,preparedGlyphs,glyphSet,glyphGeometry,rasterGlyphSegments,matchGlyph,fitGlyphGeometry,deformationPenalty,glyphCoverage,glyphContours,renderGlyphPlan,registerCustomGlyph} from '../src/glyph-contours.js';
import {glyphCharacters} from '../src/glyph-characters.js';import {glyphFromCoverage} from '../src/glyph-custom.js';
import {makeLayer} from '../src/filters.js';import {applyFilter} from '../src/engine.js';import {decodeRecipe,encodeRecipe} from '../src/recipes.js';import {varyLayers} from '../src/variations.js';
const p=makeLayer('glyphcontours').params,near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
function image(w=240,h=160){const a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const xx=x/w,yy=y/h,r=Math.hypot((xx-.45)*1.5,yy-.5),ink=Math.abs(r-.31)<.012||Math.abs(yy-.3-.18*Math.sin(xx*13))<.014||Math.abs(xx-.8)<.009&&yy>.4;a.set(ink?[26,60,109,255]:[232,217,204,255],(y*w+x)*4);}return a;}

test('Fixed log-polar descriptors retain orientation and position, are symmetric and finite on empty masks',()=>{
 const a=new Float64Array(240),b=a.slice(),c=a.slice();for(let y=3;y<17;y++){a[y*12+4]=1;b[y*12+8]=1;}for(let x=2;x<10;x++)c[8*12+x]=1;
 const A=shapeDescriptor(a),B=shapeDescriptor(b),C=shapeDescriptor(c),Z=shapeDescriptor(new Float64Array(240));near(shapeDistance(A,A),0);near(shapeDistance(A,B),shapeDistance(B,A));assert.ok(shapeDistance(A,B)>.1);assert.ok(shapeDistance(A,C)>.1);near(shapeDistance(Z,Z),0);assert.ok(Number.isFinite(shapeDistance(A,Z)));
});

test('Bundled real glyph masks recover their own shape and all three repertoires contain distinct nonempty outlines',()=>{
 assert.equal(preparedGlyphs().length,145);assert.equal(glyphSet(0).length,95);assert.ok(glyphSet(1).some(g=>g.char==='ｱ'));assert.equal(glyphSet(2).length,145);
 for(const char of ['A','/','(','ｶ','ｰ']){const glyph=preparedGlyphs().find(g=>g.char===char);assert.ok(glyph.shape.some(v=>v>0));assert.ok(glyph.sdf.every(Number.isFinite));const matched=matchGlyph(glyph.shape,glyphSet(2));near(matched.error,0);assert.deepEqual(matched.glyph.shape,glyph.shape);}
});

test('Every accepted shared-vertex move agrees with a full reraster and the independently summed final penalty',()=>{
 const q={...p,size:45,prune:25,relax:100,passes:5},g=glyphGeometry(image(),240,160,q),plan=fitGlyphGeometry(g,q),masks=rasterGlyphSegments(plan,plan.segments.map((_,i)=>i));assert.ok(plan.accepted>0);assert.ok(plan.attempted>plan.accepted);assert.ok(plan.energy<=plan.originalError+1e-9);
 let shape=0;for(let i=0;i<plan.cells.length;i++){const actual=matchGlyph(masks.get(i)||new Float64Array(240),glyphSet(q.alphabet));assert.equal(plan.cells[i].glyph.char,actual.glyph.char);near(plan.cells[i].error,actual.error);shape+=actual.error;}
 near(shape,plan.shapeError);near(plan.segments.reduce((s,segment)=>s+deformationPenalty(plan,segment,plan.maxMove),0),plan.penalty);near(shape+plan.penalty,plan.energy);
 for(const v of plan.vertices){assert.ok(Math.hypot(v.x-v.x0,v.y-v.y0)<=plan.maxMove+1e-9);for(const id of v.segments)assert.ok(plan.segments[id].a===plan.vertices.indexOf(v)||plan.segments[id].b===plan.vertices.indexOf(v));}
});

test('Zero relaxation freezes geometry and the same seed restores the complete glyph plan',()=>{
 const a=image(),q={...p,size:45,prune:25,relax:0},plan=fitGlyphGeometry(glyphGeometry(a,240,160,q),q);assert.equal(plan.accepted,0);assert.equal(plan.attempted,0);for(const v of plan.vertices){near(v.x,v.x0);near(v.y,v.y0);}near(plan.energy,plan.originalError);
 const active={...q,relax:100};assert.deepEqual(fitGlyphGeometry(glyphGeometry(a,240,160,active),active),fitGlyphGeometry(glyphGeometry(a,240,160,active),active));
});

test('Equal-luminance chromatic boundaries remain in the contour guide',()=>{
 const w=96,h=80,a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)a.set(x<48?[180,0,0,255]:[0,53,0,255],(y*w+x)*4);
 const g=glyphGeometry(a,w,h,{...p,detail:40,prune:0});assert.ok(g.segments.length>0);assert.ok(g.vertices.some(v=>Math.abs(v.x*g.cellW/12-48)<3));
});

test('Free choice deduplicates graphemes, keeps compound emoji and combining accents, and excludes whitespace',()=>{
 assert.deepEqual(glyphCharacters('A A\n界界e\u0301👩‍🎨'),['A','界','e\u0301','👩‍🎨']);assert.deepEqual(glyphCharacters('  \n\t'),[]);assert.throws(()=>glyphCharacters('x'.repeat(513)));assert.throws(()=>glyphCharacters(Array.from({length:65},(_,i)=>String.fromCodePoint(0x4e00+i)).join('')));
 assert.deepEqual(glyphSet(3,'AA/()/').map(g=>g.char),['A','/','(',')']);assert.throws(()=>glyphSet(3,'\u{10fffd}'));
 const q={...p,alphabet:3,characters:'/'},plan=fitGlyphGeometry(glyphGeometry(image(),240,160,q),q);assert.ok(plan.cells.some(c=>c.glyph.char==='/'));assert.ok(plan.cells.every(c=>['/',' '].includes(c.glyph.char)));
});

test('Runtime glyph coverage yields a finite centerline and signed distances and participates in the same matcher',()=>{
 const coverage=new Float32Array(48*80);for(let y=12;y<68;y++)for(let x=21;x<27;x++)coverage[y*48+x]=1;
 const g=glyphFromCoverage('│',coverage);assert.ok(g.shape.some(v=>v>0));assert.ok(g.sdf.every(Number.isFinite));assert.ok(g.sdf[40*48+24]>0);assert.ok(g.sdf[0]<0);registerCustomGlyph(g);assert.equal(glyphSet(3,'│')[0],g);near(matchGlyph(g.shape,[g]).error,0);assert.throws(()=>glyphFromCoverage('x',new Float32Array(10)));
});

test('All seven layers can retain 64 new glyph candidates at once',()=>{
 const base=preparedGlyphs().find(g=>g.char==='A'),layers=[];
 for(let j=0;j<7;j++){const chars=Array.from({length:64},(_,i)=>String.fromCodePoint(0x4e00+j*64+i));for(const char of chars)registerCustomGlyph({...base,char});layers.push(chars.join(''));}
 for(const chars of layers)assert.equal(glyphSet(3,chars).length,64);
});

test('Glyph rendering samples fixed-cell shapes at native size and original RGB is retained underneath',()=>{
 const g=preparedGlyphs().find(g=>g.char==='A'),base=image(120,200),plan={cols:1,rows:1,cellW:120,cellH:200,cells:[{glyph:g}]},q={...p,paper:100,color:0};const out=renderGlyphPlan(base,120,200,plan,q);let ink=0,clear=0;
 for(let y=0;y<200;y++)for(let x=0;x<120;x++){const i=(y*120+x)*4,alpha=glyphCoverage(g,(x+.5)/120,(y+.5)/200,q.weight,24/120);for(let c=0;c<3;c++)near(out[i+c],base[i+c]*(1-alpha)+24*alpha,.501);if(alpha===0)clear++;if(alpha>.9)ink++;assert.equal(out[i+3],255);}assert.ok(ink>20&&clear>100);assert.equal(glyphCoverage(g,-1,0),0);
});

test('Narrow, tiny and extreme contour plans stay finite and leave owned input pixels intact',()=>{
 for(const [w,h]of[[1,1],[1,37],[35,1],[9,13]])for(const size of [12,72]){const a=image(w,h),saved=a.slice(),q={...p,size,relax:100,passes:5,weight:180,alphabet:3,characters:'()/'},plan=fitGlyphGeometry(glyphGeometry(a,w,h,q),q);assert.ok(Number.isFinite(plan.energy));assert.ok(plan.vertices.every(v=>Number.isFinite(v.x)&&Number.isFinite(v.y)));const out=glyphContours(a,w,h,q);assert.equal(out.length,a.length);assert.deepEqual(a,saved);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);out[0]=255-a[0];assert.deepEqual(a,saved);}
 const a=image(19,23),out=glyphContours(a,19,23,{...p,alphabet:3,characters:'',paper:0});for(let i=0;i<out.length;i+=4)assert.deepEqual([...out.slice(i,i+4)],[246,246,246,255]);
});

test('Free characters survive JSON and variation and require v0.32 with validated string and integer mode',()=>{
 const l=makeLayer('glyphcontours');l.params.alphabet=3;l.params.characters='光 / A👩‍🎨 e\u0301';assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);const varied=varyLayers([l],934)[0];assert.equal(varied.params.characters,l.params.characters);assert.equal(varied.params.alphabet,3);
 for(let n=2;n<=31;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const [key,value]of[['characters',42],['characters','x'.repeat(513)],['characters',Array.from({length:65},(_,i)=>String.fromCodePoint(0x4e00+i)).join('')],['alphabet',4],['alphabet',2.5],['passes',0],['passes',1.5],['weight',181],['unknown',1]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 for(const id of ['lightsheet','jointtexture'])assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([makeLayer(id)])),engine:id==='lightsheet'?'0.31':'0.30'})),[makeLayer(id)]);
});

test('Common alpha compositing, mix and monochrome use the same glyph result and input remains unchanged',()=>{
 const w=120,h=80,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=(i*17)%256;const saved=a.slice(),l=makeLayer('glyphcontours');l.params={...p,size:45,prune:25};const full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...l.params,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++)near(half[i+c],(a[i+c]*a[i+3]/255+255-a[i+3]+full[i+c])/2,.501);}assert.deepEqual(a,saved);assert.deepEqual(applyFilter(a,w,h,l),full);
});
