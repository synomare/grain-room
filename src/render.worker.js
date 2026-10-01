import { renderPipeline } from './engine.js';
self.onmessage=({data:{id,rgba,width,height,layers}})=>{
  try {const pixels=renderPipeline(new Uint8ClampedArray(rgba),width,height,layers);self.postMessage({id,pixels:pixels.buffer,width,height},[pixels.buffer]);}
  catch(error){self.postMessage({id,error:error.message});}
};
