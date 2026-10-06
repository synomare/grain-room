import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ellipticOrbitDefaults as defaults,nextEllipticPoint,ellipticOrbit,closedCaustic,ellipticScene,orbitCoordinates,orbitPhotoCoordinates,orbitBackground,capsuleCoverage,renderOrbitLines,renderOrbitFaces,ellipticOrbits} from '../src/elliptic-orbits.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter,renderPipeline} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';

const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>{const j=Math.floor(i/4),x=j%w,y=Math.floor(j/w);return [255*x/Math.max(1,w-1),255*y/Math.max(1,h-1),128+90*Math.sin(x/23+y/29),255][i%4];});
const byte=v=>new Uint8ClampedArray([v])[0];

// The line's inner-ellipse quadratic must have a double root. This checks
// tangency without using the implementation's tangent contact formula.
test('outer intersections and inner double roots agree with the conic equations',()=>{
 for(const b of [.35,.65,1])for(const theta of [.13,.73,2.1,4.9]){
  const lambda=closedCaustic(1,b,29,8),x=Math.cos(theta),y=b*Math.sin(theta),q=nextEllipticPoint(x,y,1,b,lambda),dx=q.x-x,dy=q.y-y,A=dx*dx/(1-lambda)+dy*dy/(b*b-lambda),B=2*(x*dx/(1-lambda)+y*dy/(b*b-lambda)),C=x*x/(1-lambda)+y*y/(b*b-lambda)-1;
  near(q.x*q.x+q.y*q.y/(b*b),1);near((B*B-4*A*C)/(B*B+4*A*C),0);assert.ok(-B/(2*A)>0&&-B/(2*A)<1);
 }
});

test('successive chords obey specular reflection at the outer ellipse',()=>{
 for(const b of [.35,.65,1]){
  const path=ellipticOrbit(1,b,closedCaustic(1,b,29,8),29,.7).points;
  for(let k=1;k<path.length-1;k++){
   const before=path[k-1],at=path[k],after=path[k+1],Li=Math.hypot(at.x-before.x,at.y-before.y),Lo=Math.hypot(after.x-at.x,after.y-at.y),Ln=Math.hypot(at.x,at.y/(b*b)),ix=(at.x-before.x)/Li,iy=(at.y-before.y)/Li,nx=at.x/Ln,ny=at.y/(b*b)/Ln,dot=ix*nx+iy*ny;
   near(ix-2*dot*nx,(after.x-at.x)/Lo);near(iy-2*dot*ny,(after.y-at.y)/Lo);
  }
 }
});

test('circular caustics have the analytic sin squared radius deficit',()=>{
 for(const N of [24,29,37,64])for(const turns of [1,3,8])near(closedCaustic(1,1,N,turns),Math.sin(Math.PI*turns/N)**2,1e-12);
});

test('permitted boundary configurations close at independent departure phases',()=>{
 for(const N of [24,29,37,64])for(const turns of [1,8])for(const b of [.35,.65,1]){
  const lambda=closedCaustic(1,b,N,turns);assert.ok(lambda>0&&lambda<b*b);
  for(const phase of [0,.13,.77,2.3,5.9]){const q=ellipticOrbit(1,b,lambda,N,phase);assert.ok(q.error<1e-8,`${N}/${turns}/${b}/${phase}: ${q.error}`);near(q.advance,2*Math.PI*turns,1e-8);}
 }
});

test('repeated cycles are drawn once; frame fitting and rotated coordinates round trip',()=>{
 for(const [w,h] of [[320,180],[180,320]])for(const rotation of [0,37,90]){
  const p={...defaults,vertices:24,turns:8,families:3,rotation,scale:100},g=ellipticScene(w,h,p);assert.equal(g.period,3);assert.equal(g.lines.length,9);
  for(const path of g.orbits)assert.ok(path.error<1e-8);
  for(const l of g.lines)for(const [x,y] of [[l.x0,l.y0],[l.x1,l.y1]]){const [u,v]=orbitCoordinates(x,y,g);near(u*u+v*v/(g.b*g.b),1);assert.ok(x>=w*.05-1e-8&&x<=w*.95+1e-8&&y>=h*.05-1e-8&&y<=h*.95+1e-8);}
 }
});

test('capsule distance agrees with separate endpoint and perpendicular cases',()=>{
 for(const l of [{x0:2.3,y0:1.1,x1:8.7,y1:9.3},{x0:4,y0:4,x1:4,y1:4}])for(let y=-2;y<14;y++)for(let x=-2;x<14;x++){
  const dx=l.x1-l.x0,dy=l.y1-l.y0,L=Math.hypot(dx,dy),px=x+.5-l.x0,py=y+.5-l.y0,dot=px*dx+py*dy,d=!L||dot<=0?Math.hypot(px,py):dot>=L*L?Math.hypot(x+.5-l.x1,y+.5-l.y1):Math.abs(dx*py-dy*px)/L;
  near(capsuleCoverage(x+.5,y+.5,l,1.3),Math.min(1,Math.max(0,1.8-d)));
 }
});

test('pruned native line rendering equals every-pixel every-segment blending',()=>{
 const w=43,h=31,a=image(w,h),p={...defaults,width:12,ink:73,paper:53,keep:17,rotation:37,centerX:4,scale:180},g=ellipticScene(w,h,p),expected=orbitBackground(a,p),radius=Math.max(w,h)*p.width/2000;
 for(const l of g.lines)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const c=capsuleCoverage(x+.5,y+.5,l,radius)*p.ink/100,i=(y*w+x)*4;for(let k=0;k<3;k++)expected[i+k]+=c*(a[i+k]*.78-expected[i+k]);
 }
 assert.deepEqual(renderOrbitLines(a,w,h,p,g),expected);
});

// Test each subpixel with a direct ray, without sorted scanline intervals.
test('native four-sample faces equal direct even-odd membership and leave the caustic open',()=>{
 const w=39,h=27,a=image(w,h),p={...defaults,surface:1,vertices:24,turns:8,families:2,rotation:31,ink:73,keep:12,paper:67},g=ellipticScene(w,h,p),expected=orbitBackground(a,p);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let n=0;for(const ox of [.25,.75])for(const oy of [.25,.75]){
   const xx=x+ox,yy=y+oy,odd=g.lines.reduce((sum,l)=>sum+(((l.y0>yy)!==(l.y1>yy)&&xx<l.x0+(yy-l.y0)*(l.x1-l.x0)/(l.y1-l.y0))?1:0),0)%2,[u,v]=orbitCoordinates(xx,yy,g);
   if(odd&&u*u/(1-g.lambda)+v*v/(g.b*g.b-g.lambda)>=1)n++;
  }
  const i=(y*w+x)*4;for(let c=0;c<3;c++)expected[i+c]+=p.ink/100*n/4*(a[i+c]*.78-expected[i+c]);
 }
 assert.deepEqual(renderOrbitFaces(a,w,h,p,g),expected);const center=(Math.floor(h/2)*w+Math.floor(w/2))*4;assert.deepEqual(expected.slice(center,center+4),orbitBackground(a,p).slice(center,center+4));
});

test('angle and radial photograph coordinates reach the declared inner and outer bounds',()=>{
 const w=173,h=91,g=ellipticScene(w,h,defaults);
 for(const theta of [.3,1.4,3.8,5.7]){
  const co=Math.cos(theta),si=Math.sin(theta),inner=1/Math.sqrt(co*co/(1-g.lambda)+g.b*g.b*si*si/(g.b*g.b-g.lambda));
  for(const r of [inner,1]){const u=r*co,v=g.b*r*si,x=g.cx+g.s*(u*g.co-v*g.si),y=g.cy+g.s*(u*g.si+v*g.co),[sx,sy]=orbitPhotoCoordinates(x,y,w,h,g);near(sx,theta/(2*Math.PI)*(w-1));near(sy,r===1?h-1:0);}
 }
});

test('all fifteen dedicated controls affect an active native view',()=>{
 const w=180,h=140,a=image(w,h),out=ellipticOrbits(a,w,h,defaults);
 for(const [key,value] of Object.entries({vertices:37,turns:3,aspect:80,families:1,phase:39,rotation:47,scale:70,centerX:34,centerY:61,width:9,surface:1,mode:1,paper:61,keep:25,ink:57}))assert.ok(ellipticOrbits(a,w,h,{...defaults,[key]:value}).some((v,i)=>v!==out[i]),key);
});

test('inactive geometry, faces width, deterministic seed and coincident angle endpoints stay neutral',()=>{
 const w=75,h=53,a=image(w,h),render=p=>ellipticOrbits(a,w,h,{...defaults,...p});
 assert.deepEqual(render({ink:0}),render({ink:0,vertices:64,turns:1,surface:1,mode:2}));assert.deepEqual(render({width:0}),orbitBackground(a,defaults));
 assert.deepEqual(render({surface:1,width:0}),render({surface:1,width:18}));assert.deepEqual(render({seed:1}),render({seed:9999}));assert.deepEqual(render({rotation:0}),render({rotation:360}));assert.deepEqual(render({phase:0}),render({phase:360}));
});

test('tiny axes and boundary controls are finite opaque repeatable and protect input',()=>{
 for(const [w,h] of [[1,1],[1,17],[19,1],[27,21]])for(const surface of [0,1])for(const mode of [0,1,2]){
  const a=image(w,h),copy=a.slice(),p={...defaults,vertices:24,turns:8,aspect:35,families:8,rotation:360,scale:180,centerX:0,centerY:100,width:18,surface,mode},out=ellipticOrbits(a,w,h,p);assert.equal(out.length,a.length);assert.ok(out.every((v,i)=>Number.isFinite(v)&&(i%4!==3||v===255)));assert.deepEqual(out,ellipticOrbits(a,w,h,p));assert.deepEqual(a,copy);
 }
});

test('native colour survives beyond 1536 and engine mixing mono inverse transparency and recipe replay agree',()=>{
 const w=1537,h=5,a=image(w,h),l=makeLayer('ellipticorbits');l.params={...l.params,width:18,aspect:100,scale:180,keep:100};const out=applyFilter(a,w,h,l);assert.deepEqual(out,ellipticOrbits(a,w,h,l.params));const b=a.slice();b[(w-1)*4]^=255;assert.notDeepEqual(applyFilter(b,w,h,l),out);
 const mixed=applyFilter(a,w,h,{...l,params:{...l.params,invert:true,mix:25}});for(let i=0;i<a.length;i++)if(i%4!==3)assert.equal(mixed[i],byte(a[i]+(255-out[i]-a[i])*.25));assert.deepEqual(applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),a);
 const mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});for(let i=0;i<mono.length;i+=4)assert.equal(mono[i],mono[i+1]),assert.equal(mono[i+1],mono[i+2]);assert.deepEqual(applyFilter(new Uint8ClampedArray([1,73,201,0]),1,1,l),applyFilter(new Uint8ClampedArray([255,255,255,255]),1,1,l));
 for(const look of looks.filter(l=>l.ellipticorbits))assert.deepEqual(renderPipeline(a,w,h,look.layers),renderPipeline(a,w,h,decodeRecipe(encodeRecipe(look.layers))));
});

test('0.55 gates orbits, replays older operators and validates all public recipes',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const f=filters.find(f=>f.ellipticorbits),l=makeLayer(f.id);assert.equal(f.controls.length,15);assert.equal(f.random,false);assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let n=2;n<=54;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('addressrecords');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.54'})),[old]);
 for(const [key,value] of [['vertices',23],['vertices',65],['turns',0],['turns',9],['aspect',34],['families',9],['phase',361],['rotation',-1],['scale',181],['centerX',-1],['centerY',101],['width',18.5],['surface',2],['mode',3],['paper',101],['keep',-1],['ink',101],['seed',.5]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])),key);
 const files=fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(n=>n.endsWith('.json'));assert.equal(files.length,234);for(const file of files){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);}
});
