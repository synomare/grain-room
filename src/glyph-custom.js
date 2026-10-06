import {glyphCharacters} from './glyph-characters.js';
import {availableGlyph,registerCustomGlyph,shapeDescriptor} from './glyph-contours.js';

const W=48,H=80;
export function glyphFromCoverage(char,coverage){
 if(coverage.length!==W*H)throw Error('字形画像の寸法が不正です。');
 const mask=Uint8Array.from(coverage,v=>v>=.5?1:0),skeleton=mask.slice();
 let changed=true;
 while(changed){changed=false;for(let phase=0;phase<2;phase++){
  const remove=[];for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
   const i=y*W+x;if(!skeleton[i])continue;const q=[skeleton[i-W],skeleton[i-W+1],skeleton[i+1],skeleton[i+W+1],skeleton[i+W],skeleton[i+W-1],skeleton[i-1],skeleton[i-W-1]],sum=q.reduce((a,b)=>a+b,0),transitions=q.reduce((a,v,j)=>a+(!v&&q[(j+1)%8]?1:0),0);
   if(sum<2||sum>6||transitions!==1)continue;
   if(phase===0?(q[0]*q[2]*q[4]||q[2]*q[4]*q[6]):(q[0]*q[2]*q[6]||q[0]*q[4]*q[6]))continue;
   remove.push(i);
  }for(const i of remove)skeleton[i]=0;if(remove.length)changed=true;
 }}
 const shape=new Float64Array(240),sdf=new Float32Array(W*H),boundary=new Uint8Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x;if(skeleton[i])shape[Math.floor(y/4)*12+Math.floor(x/4)]+=.25;
  for(const [dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]])if(mask[i]!==mask[Math.max(0,Math.min(H-1,y+dy))*W+Math.max(0,Math.min(W-1,x+dx))])boundary[i]=1;
 }
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const i=y*W+x;let distance=6;
  for(let yy=Math.max(0,y-6);yy<=Math.min(H-1,y+6);yy++)for(let xx=Math.max(0,x-6);xx<=Math.min(W-1,x+6);xx++)if(boundary[yy*W+xx])distance=Math.min(distance,Math.hypot(x-xx,y-yy)+.5);
  if(distance<1)distance=Math.abs(coverage[i]-.5);
  sdf[i]=(mask[i]?1:-1)*Math.min(3,distance/2);
 }
 const points=[];for(let i=0;i<240;i++)if(shape[i]>.05)points.push([i%12+.5,Math.floor(i/12)+.5]);
 return {char,latin:false,shape,sdf,points,descriptor:shapeDescriptor(shape)};
}

let fontReady;
async function loadFont(){
 if(!fontReady)fontReady=(async()=>{const url=new URL(import.meta.env.BASE_URL+'fonts/ZenKakuGothicNew-Regular.ttf',self.location.origin),font=new FontFace('GlyphContourInput',`url("${url.href}")`);await font.load();self.fonts.add(font);})();
 return fontReady;
}
export async function prepareCustomGlyphs(layers){
 const needed=[...new Set(layers.filter(l=>l.id==='glyphcontours'&&l.params.alphabet===3&&l.params.mix!==0).flatMap(l=>glyphCharacters(l.params.characters||'')))].filter(char=>!availableGlyph(char));
 if(!needed.length)return;
 await loadFont();const canvas=new OffscreenCanvas(W,H),ctx=canvas.getContext('2d',{willReadFrequently:true});
 const coverageFor=char=>{
  ctx.clearRect(0,0,W,H);ctx.font='80px GlyphContourInput, sans-serif';ctx.textBaseline='alphabetic';
  const m=ctx.measureText(char),left=m.actualBoundingBoxLeft,right=m.actualBoundingBoxRight,ascent=m.actualBoundingBoxAscent,descent=m.actualBoundingBoxDescent,scale=Math.min(1,44/Math.max(1,left+right),72/Math.max(1,ascent+descent));
  ctx.save();ctx.translate(W/2+(left-right)*scale/2,H/2+(ascent-descent)*scale/2);ctx.scale(scale,scale);ctx.fillStyle='#000';ctx.fillText(char,0,0);ctx.restore();
  const pixels=ctx.getImageData(0,0,W,H).data;return Float32Array.from({length:W*H},(_,i)=>pixels[i*4+3]/255);
 };
 const missing=[coverageFor('\u{10ffff}'),coverageFor('\u{10fffe}')];
 for(const char of needed){const coverage=coverageFor(char);
  if(!coverage.some(v=>v>=.5)||missing.some(a=>a.every((v,i)=>Math.abs(v-coverage[i])<1/255)))throw Error(`「${char}」の字形を表示できません。この端末で表示できる文字を入力してください。`);
  registerCustomGlyph(glyphFromCoverage(char,coverage));
 }
}
