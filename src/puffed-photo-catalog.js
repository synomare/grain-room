import {puffedPhotoDefaults} from './puffed-photo.js';
export function puffedPhotoFilters(f,c){return [
 {...f('puffedphoto','ふくらむ写真膜','PUFFED PHOTO MEMBRANE','物質','写真の色面に沿って、薄い膜をふくらませます。',puffedPhotoDefaults,[
 c('size','色面の大きさ',60,320),c('boundary','色の境目に沿う',0,100),c('pressure','ふくらみ',0,180),c('round','肩の丸み',0,100),c('softness','谷をなめらかに',0,100),c('tilt','斜めから見る',-65,65,1,'°'),c('turn','全体を回す',-180,180,1,'°'),c('fit','全体の大きさ',30,120,1,'%'),c('light','膜の陰影',0,100),c('paper','地の明るさ',0,100),c('lift','写真を白へ',0,100)
 ],true,true),puffedphoto:true},
];}
