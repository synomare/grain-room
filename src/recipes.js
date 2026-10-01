import {getFilter} from './filters.js';
export const ENGINE_VERSION='0.13';
const commonBounds={brightness:[-60,60],contrast:[30,250],grain:[0,60],saturation:[0,220],mix:[0,100],seed:[0,99999]};
export function encodeRecipe(layers){return JSON.stringify({app:'grain-room',version:1,engine:ENGINE_VERSION,layers},null,2);}
export function decodeRecipe(text){
 if(text.length>100000)throw new Error('レシピのサイズが大きすぎます。');
 let data;try{data=JSON.parse(text);}catch{throw new Error('JSONファイルを読み取れませんでした。');}
 if(data.app!=='grain-room'||data.version!==1||!['0.2','0.3','0.4','0.5','0.6','0.7','0.8','0.9','0.10','0.11','0.12',ENGINE_VERSION].includes(data.engine)||!Array.isArray(data.layers)||!data.layers.length||data.layers.length>7)throw new Error('対応するGRAIN ROOMのレシピではありません。');
 return data.layers.map(layer=>{
  const f=getFilter(layer?.id);if(!f||!layer.params||typeof layer.params!=='object')throw new Error('レシピに不明な加工が含まれています。');
  if(data.engine==='0.2'&&f.research)throw new Error('この加工は0.3以降のレシピに対応しています。');
  if(['0.2','0.3'].includes(data.engine)&&f.material)throw new Error('この加工は0.4以降のレシピに対応しています。');
  if(['0.2','0.3','0.4'].includes(data.engine)&&f.reconstruction)throw new Error('この加工は0.5以降のレシピに対応しています。');
  if(['0.2','0.3','0.4','0.5'].includes(data.engine)&&f.structure)throw new Error('この加工は0.6以降のレシピに対応しています。');
  if(['0.2','0.3','0.4','0.5','0.6'].includes(data.engine)&&f.field)throw new Error('この加工は0.7以降のレシピに対応しています。');
  if(!['0.8','0.9','0.10','0.11','0.12',ENGINE_VERSION].includes(data.engine)&&f.frontier)throw new Error('この加工は0.8以降のレシピに対応しています。');
  if(!['0.9','0.10','0.11','0.12',ENGINE_VERSION].includes(data.engine)&&f.microstructure)throw new Error('この加工は0.9以降のレシピに対応しています。');
  if(!['0.10','0.11','0.12',ENGINE_VERSION].includes(data.engine)&&f.emergent)throw new Error('この加工は0.10以降のレシピに対応しています。');
  if(!['0.11','0.12',ENGINE_VERSION].includes(data.engine)&&f.aperiodic)throw new Error('この加工は0.11以降のレシピに対応しています。');
  if(!['0.12',ENGINE_VERSION].includes(data.engine)&&f.volume)throw new Error('この加工は0.12以降のレシピに対応しています。');
  if(data.engine!==ENGINE_VERSION&&f.adaptive)throw new Error('この加工は0.13以降のレシピに対応しています。');
  const p={...f.defaults},bounds={...commonBounds,...Object.fromEntries(f.controls.map(([key,,min,max])=>[key,[min,max]]))};
  for(const [key,value] of Object.entries(layer.params)){
   if(!Object.hasOwn(p,key))throw new Error('レシピに不明な設定があります。');
   if(bounds[key]){if(!Number.isFinite(value)||value<bounds[key][0]||value>bounds[key][1])throw new Error('設定値が範囲外です。');if((key==='seed'||f.controls.some(c=>c[0]===key&&c[4]===1))&&!Number.isInteger(value))throw new Error('整数の設定値が必要です。');}
   else if(key==='invert'){if(typeof value!=='boolean')throw new Error('反転の設定が不正です。');}
   else if(key==='colorMode'){if(!['color','mono'].includes(value))throw new Error('色の設定が不正です。');}
   else if(key==='mode'){if(!['atkinson','floyd','bayer'].includes(value))throw new Error('ディザ方式が不正です。');}
   p[key]=value;
  }return {id:f.id,params:p};
 });
}
