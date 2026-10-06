import { renderPipeline } from './engine.js';
import {prepareCustomGlyphs} from './glyph-custom.js';
self.onmessage=async({data:{id,rgba,width,height,layers,near}})=>{
  try {await prepareCustomGlyphs(layers);const resources=near?{near:{pixels:new Uint8ClampedArray(near.rgba),width:near.width,height:near.height}}:{};const pixels=renderPipeline(new Uint8ClampedArray(rgba),width,height,layers,resources);self.postMessage({id,pixels:pixels.buffer,width,height},[pixels.buffer]);}
  catch(error){self.postMessage({id,error:error.message});}
};
