import {wovenPhotoDefaults} from './woven-photo.js';
export function wovenPhotoFilters(f,c){return [
 {...f('wovenphoto','編み込む写真帯','INTERLACED PHOTO STRIPS','物質','写真の帯が交互に上下を渡り、隙間のある立体の織物へ変わります。',wovenPhotoDefaults,[
 c('size','帯の間隔',40,240),c('coverage','帯の幅',30,98,1,'%'),c('relief','交差の起伏',0,160),c('weave','編み方（平→綾→朱子）',0,2),c('bend','全体を反らす',-150,150),c('shift','横帯の像をずらす',-50,50,1,'%'),c('tilt','斜めから見る',-70,70,1,'°'),c('turn','全体を回す',-180,180,1,'°'),c('fit','全体の大きさ',30,140,1,'%'),c('light','帯の陰影',0,100),c('paper','地の明るさ',0,100),c('lift','写真を白へ',0,100)
 ],true,false),wovenphoto:true},
];}
