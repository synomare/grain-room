import {fanPhotoDefaults} from './fan-photo.js';
export function fanPhotoFilters(f,c){return [
 {...f('fanphoto','扇になる写真','PLEATED PHOTO FAN','物質','写真を放射状に折り、扇や輪の形にひらきます。',fanPhotoDefaults,[
 c('pleats','ひだの数',3,40),c('open','扇の開き',20,360,1,'°'),c('hub','中央の空き',0,75,1,'%'),c('depth','折り目の深さ',0,100),c('tilt','斜めから見る',-70,70,1,'°'),c('turn','全体を回す',-180,180,1,'°'),c('fit','全体の大きさ',30,140,1,'%'),c('light','折り面の陰影',0,100),c('paper','地の明るさ',0,100),c('lift','写真を白へ',0,100)
 ],true,false),fanphoto:true},
];}
