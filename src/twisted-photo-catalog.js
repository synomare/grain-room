import {twistedPhotoDefaults} from './twisted-photo.js';
export function twistedPhotoFilters(f,c){return [
 {...f('twistedphoto','ねじれる写真帯','TWISTED PHOTO SLATS','物質','写真の帯を途中でねじり、像と隙間を波のようにつなぎます。',twistedPhotoDefaults,[
 c('bands','帯の数',3,40),c('width','帯の幅',20,100,1,'%'),c('twist','ねじれの強さ',0,360,1,'°'),c('waves','ねじれの反復',1,4),c('stagger','隣の帯のずれ',0,180,1,'°'),c('direction','帯の方向（0縦・1横）',0,1),c('tilt','斜めから見る',-60,60,1,'°'),c('turn','全体を回す',-90,90,1,'°'),c('fit','全体の大きさ',30,130,1,'%'),c('light','曲面の陰影',0,100),c('paper','地の明るさ',0,100),c('lift','写真を白へ',0,100)
 ],true,false),twistedphoto:true},
];}
