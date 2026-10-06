import {entangledMatterDefaults} from './entangled-matter.js';
export function entangledMatterFilters(f,c){return [
 {...f('entangledmatter','混線する質感','ENTANGLED PHOTO MATTER','物質','写真を押し潰し、引き伸ばした面へ細かな破片を混ぜます。',entangledMatterDefaults,[
 c('scale','かたまりの大きさ',40,300),c('pressure','押し潰す強さ',0,160),c('fracture','細片の密度',0,100),c('depth','細片の深さ',1,7),c('stretch','引き伸ばし',0,100),c('relief','面の陰影',0,100),c('bleach','色を薄める',0,100),c('spread','背景へ広げる',0,100)
 ],true,true),entangledmatter:true},
];}
