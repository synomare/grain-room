import {getFilter} from './filters.js';
import {hash} from './pixels.js';
export function varyLayers(layers,seed){
 return layers.map((layer,index)=>{
  const next=structuredClone(layer),f=getFilter(layer.id);next.params.seed=(seed+index*137)%100000;
  for(const [j,[key,,min,max,step=1]] of f.controls.entries()){
   if(f.glyphcontours&&key==='alphabet'&&layer.params.alphabet===3)continue;
   const delta=(hash(index,j,seed)-.5)*(max-min)*.55;
   next.params[key]=Math.max(min,Math.min(max,min+Math.round((next.params[key]+delta-min)/step)*step));
  }
  return next;
 });
}
