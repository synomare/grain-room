import {haar} from './haar.js';
import {radon} from './radon.js';
import {newton} from './newton.js';
import {photoelastic} from './photoelastic.js';
import {crystallize} from './crystal-growth.js';
import {inksearch} from './adaptive-halftone.js';
import {metametric} from './adaptive-texture.js';
import {fungal} from './adaptive-decay.js';
import {porous} from './volume-porous.js';
import {dendrite} from './volume-growth.js';
import {quasicut} from './aperiodic-tiles.js';
import {waveweft} from './aperiodic-wave.js';
import {resonant} from './aperiodic-resonance.js';
import {hyperbolic} from './emergent-hyperbolic.js';
import {spinodal} from './emergent-phase.js';
import {wavebrdf} from './emergent-wavebrdf.js';
import {phasorweave} from './microstructure-phasor.js';
import {softcells} from './microstructure-sad.js';
import {steergrain} from './microstructure-steer.js';
import {gaborcloth} from './microstructure-gabor.js';
import {sharpflow} from './frontier-mixwell.js';
import {deposition} from './frontier-capsule.js';
import {transport} from './frontier-transport.js';
import {marble} from './field-marbling.js';
import {accrete} from './field-distance.js';
import {applyFilter as monochrome} from './monochrome.js';
import {getFilter} from './filters.js';
import {clamp,hash,lum} from './pixels.js';
import {transform} from './transforms.js';
import {researchTransform} from './research-engine.js';
import {reconstructionTransform} from './reconstruction-engine.js';
import {structureTransform} from './structure-engine.js';
import {materialTransform} from './material-effects.js';
const classic=new Set(['halftone','dither','xerox','contour']);
export function applyFilter(rgba,w,h,layer){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||rgba.length!==w*h*4)throw new Error('画像サイズが不正です。');
 const definition=getFilter(layer.id);if(!definition)throw new Error('未対応のフィルターです。');
 // Absent colorMode preserves old v0.1 recipes. New recipes always store it.
 const p={...definition.defaults,...layer.params,colorMode:layer.params.colorMode??'mono'},id=layer.id;
 if(p.mix===0)return composite(rgba);
 const a=new Uint8ClampedArray(rgba.length),scale=Math.max(w,h)/1000;
 for(let i=0;i<a.length;i+=4){
  const alpha=rgba[i+3]/255,l=lum(rgba,i),n=p.grain?(hash(Math.floor(i/4%w/scale),Math.floor(Math.floor(i/4/w)/scale),p.seed)-.5)*p.grain*2:0;
  for(let c=0;c<3;c++){
   let v=p.colorMode==='mono'?l:l+(rgba[i+c]-l)*p.saturation/100;
   v=v*alpha+255*(1-alpha);a[i+c]=(v-127.5)*p.contrast/100+127.5+p.brightness*2.55+n;
  }a[i+3]=255;
 }
 let out;
 if(classic.has(id)){
  out=new Uint8ClampedArray(a.length);
  const mono=new Uint8ClampedArray(a.length);
  for(let c=0;c<3;c++){
   for(let i=0;i<a.length;i+=4){mono[i]=mono[i+1]=mono[i+2]=a[i+c];mono[i+3]=255;}
   const pixels=monochrome(mono,w,h,{id,params:{...p,contrast:100,brightness:0,grain:id==='xerox'?p.grain:0,invert:false,angle:p.angle+(p.colorMode==='color'?c*30:0)}});
   for(let i=0;i<a.length;i+=4){out[i+c]=pixels[i];out[i+3]=255;}
   if(p.colorMode==='mono'){for(let i=0;i<a.length;i+=4)out[i+1]=out[i+2]=out[i];break;}
  }
 }else out=id==='mono'?a:definition.haar?haar(a,w,h,p):definition.radon?radon(a,w,h,p):definition.newton?newton(a,w,h,p):definition.photoelastic?photoelastic(a,w,h,p):definition.crystal?crystallize(a,w,h,p):definition.adaptive?({inksearch,metametric,fungal})[id](a,w,h,p):definition.volume?({porous,dendrite})[id](a,w,h,p):definition.aperiodic?({quasicut,waveweft,resonant})[id](a,w,h,p):definition.emergent?({hyperbolic,spinodal,wavebrdf})[id](a,w,h,p):definition.microstructure?({softcells,steergrain,gaborcloth,phasorweave})[id](a,w,h,p):definition.frontier?({sharpflow,deposition,transport})[id](a,w,h,p):definition.field?({marble,accrete})[id](a,w,h,p):definition.structure?structureTransform(a,w,h,id,p):definition.reconstruction?reconstructionTransform(a,w,h,id,p):definition.material?materialTransform(a,w,h,id,p):definition.research?researchTransform(a,w,h,id,p):transform(a,w,h,id,p);
 for(let i=0;i<out.length;i+=4){
  // Enforce a real monochrome output, including operators that generate new color.
  if(p.colorMode==='mono'){const l=lum(out,i);out[i]=out[i+1]=out[i+2]=l;}
  for(let c=0;c<3;c++){
   const v=p.invert?255-out[i+c]:out[i+c],original=rgba[i+c]*rgba[i+3]/255+255-rgba[i+3];
   out[i+c]=original+(v-original)*p.mix/100;
  }
 }return out;
}
function composite(a){const out=new Uint8ClampedArray(a.length);for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++)out[i+c]=a[i+c]*a[i+3]/255+255-a[i+3];out[i+3]=255;}return out;}
export function renderPipeline(rgba,w,h,layers){let result=rgba;for(const layer of layers)result=applyFilter(result,w,h,layer);return result;}
