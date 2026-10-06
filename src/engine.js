import {entangledPhotoRefined} from './entangled-photo-refined.js';
import {entangledMatter} from './entangled-matter.js';
import {twistedPhoto} from './twisted-photo.js';
import {fanPhoto} from './fan-photo.js';
import {wovenPhoto} from './woven-photo.js';
import {puffedPhoto} from './puffed-photo.js';
import {knottedPhoto} from './knotted-photo.js';
import {nestedPhoto} from './nested-photo.js';
import {sweptPhoto} from './swept-photo.js';
import {entangledPhoto} from './entangled-photo.js';
import {colourPeel} from './colour-peel.js';
import {embroideredPhoto} from './embroidered-photo.js';
import {photoMirrors} from './photo-mirrors.js';
import {miuraPhoto} from './miura-photo.js';
import {transmittedFilm} from './transmitted-film.js';
import {rasterRelief} from './raster-relief.js';
import {hybridImage} from './hybrid-image.js';
import {contextWindows} from './context-windows.js';
import {pinnedFilm} from './pinned-film.js';
import {edgeOwnership} from './edge-ownership.js';
import {heatStitches} from './heat-stitches.js';
import {ellipticOrbits} from './elliptic-orbits.js';
import {addressRecords} from './address-records.js';
import {polarizedPair} from './polarized-pair.js';
import {meromorphicPhoto} from './meromorphic-photo.js';
import {resistFronts} from './resist-fronts.js';
import {logicGlyphs} from './logic-glyphs.js';
import {closedRoute} from './closed-route.js';
import {stereoRelief} from './stereo-relief.js';
import {rowReinterpretation} from './row-reinterpretation.js';
import {drawCurlicues} from './curlicues.js';
import {sandAvalanches} from './sand-avalanches.js';
import {lbgDots} from './lbg-dots.js';
import {flowPlates} from './flow-plates.js';
import {flockThreads} from './flock-threads.js';
import {componentIslands} from './component-islands.js';
import {shockLines} from './shock-lines.js';
import {domainColour} from './domain-colour.js';
import {seamfold} from './seam-fold.js';
import {wovencloth} from './woven-cloth.js';
import {graphcut} from './graphcut-textures.js';
import {watercolour} from './watercolour.js';
import {painterly} from './painterly-strokes.js';
import {scratchLight} from './scratch-light.js';
import {speckleField} from './speckle-field.js';
import {glyphContours} from './glyph-contours.js';
import {lightSheet} from './light-sheet.js';
import {jointTexture} from './joint-texture.js';
import {monogenic} from './monogenic.js';
import {graphPlates} from './graph-regions.js';
import {curlSheet} from './curl-sheet.js';
import {bandMoire} from './band-moire.js';
import {contactTransport} from './contact-transport.js';
import {diffusionCurves} from './diffusion-curves.js';
import {spectralTV} from './spectral-tv.js';
import {palettePlates} from './palette-plates.js';
import {pupilPSF} from './pupil-psf.js';
import {artisticScreen} from './artistic-screen.js';
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
export function applyFilter(rgba,w,h,layer,resources={}){
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
 let preparedNear=null;
 if(definition.hybridimage&&resources.near){
  const {pixels,width,height}=resources.near;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||pixels?.length!==width*height*4)throw new Error('近くの写真のサイズが不正です。');
  const colourLayer={id:'mono',params:{...p,mix:100,invert:false}};
  preparedNear={pixels:applyFilter(pixels,width,height,colourLayer),w:width,h:height};
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
 }else out=id==='mono'?a:definition.entangledphotorefined?entangledPhotoRefined(a,w,h,p):definition.entangledmatter?entangledMatter(a,w,h,p):definition.twistedphoto?twistedPhoto(a,w,h,p):definition.fanphoto?fanPhoto(a,w,h,p):definition.wovenphoto?wovenPhoto(a,w,h,p):definition.puffedphoto?puffedPhoto(a,w,h,p):definition.knottedphoto?knottedPhoto(a,w,h,p):definition.nestedphoto?nestedPhoto(a,w,h,p):definition.sweptphoto?sweptPhoto(a,w,h,p):definition.entangledphoto?entangledPhoto(a,w,h,p):definition.colourpeel?colourPeel(a,w,h,p):definition.embroideredphoto?embroideredPhoto(a,w,h,p):definition.photomirrors?photoMirrors(a,w,h,p):definition.miuraphoto?miuraPhoto(a,w,h,p):definition.transmittedfilm?transmittedFilm(a,w,h,p):definition.rasterrelief?rasterRelief(a,w,h,p):definition.hybridimage?hybridImage(a,w,h,p,preparedNear):definition.contextwindows?contextWindows(a,w,h,p):definition.pinnedfilm?pinnedFilm(a,w,h,p):definition.edgeownership?edgeOwnership(a,w,h,p):definition.heatstitches?heatStitches(a,w,h,p):definition.ellipticorbits?ellipticOrbits(a,w,h,p):definition.addressrecords?addressRecords(a,w,h,p):definition.polarizedpair?polarizedPair(a,w,h,p):definition.meromorphic?meromorphicPhoto(a,w,h,p):definition.resistfronts?resistFronts(a,w,h,p):definition.logicglyphs?logicGlyphs(a,w,h,p):definition.closedroute?closedRoute(a,w,h,p):definition.stereorelief?stereoRelief(a,w,h,p):definition.researchgraphics?(id==='rowreinterpret'?rowReinterpretation(a,w,h,p):drawCurlicues(a,w,h,p)):definition.sandavalanches?sandAvalanches(a,w,h,p):definition.lbgdots?lbgDots(a,w,h,p):definition.flowplates?flowPlates(a,w,h,p):definition.flockthreads?flockThreads(a,w,h,p):definition.componentislands?componentIslands(a,w,h,p):definition.shocklines?shockLines(a,w,h,p):definition.domaincolour?domainColour(a,w,h,p):definition.seamfold?seamfold(a,w,h,p):definition.wovencloth?wovencloth(a,w,h,p):definition.graphcut?graphcut(a,w,h,p):definition.watercolour?watercolour(a,w,h,p):definition.painterly?painterly(a,w,h,p):definition.scratchlight?scratchLight(a,w,h,p):definition.speckle?speckleField(a,w,h,p):definition.glyphcontours?glyphContours(a,w,h,p):definition.lightsheet?lightSheet(a,w,h,p):definition.jointtexture?jointTexture(a,w,h,p):definition.monogenic?monogenic(a,w,h,p):definition.graphplates?graphPlates(a,w,h,p):definition.curlsheet?curlSheet(a,w,h,p):definition.bandmoire?bandMoire(a,w,h,p):definition.contactcarry?contactTransport(a,w,h,p):definition.diffusioncurves?diffusionCurves(a,w,h,p):definition.spectraltv?spectralTV(a,w,h,p):definition.palette?palettePlates(a,w,h,p):definition.pupil?pupilPSF(a,w,h,p):definition.artisticscreen?artisticScreen(a,w,h,p):definition.haar?haar(a,w,h,p):definition.radon?radon(a,w,h,p):definition.newton?newton(a,w,h,p):definition.photoelastic?photoelastic(a,w,h,p):definition.crystal?crystallize(a,w,h,p):definition.adaptive?({inksearch,metametric,fungal})[id](a,w,h,p):definition.volume?({porous,dendrite})[id](a,w,h,p):definition.aperiodic?({quasicut,waveweft,resonant})[id](a,w,h,p):definition.emergent?({hyperbolic,spinodal,wavebrdf})[id](a,w,h,p):definition.microstructure?({softcells,steergrain,gaborcloth,phasorweave})[id](a,w,h,p):definition.frontier?({sharpflow,deposition,transport})[id](a,w,h,p):definition.field?({marble,accrete})[id](a,w,h,p):definition.structure?structureTransform(a,w,h,id,p):definition.reconstruction?reconstructionTransform(a,w,h,id,p):definition.material?materialTransform(a,w,h,id,p):definition.research?researchTransform(a,w,h,id,p):transform(a,w,h,id,p);
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
export function renderPipeline(rgba,w,h,layers,resources={}){let result=rgba;for(const layer of layers)result=applyFilter(result,w,h,layer,resources);return result;}
