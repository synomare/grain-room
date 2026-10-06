import {sweptPhotoDefaults} from './swept-photo.js';
export function sweptPhotoFilters(f,c){return [
 {...f('sweptphoto','巻き出す写真','SWEEPING PHOTO STRIPS','物質','写真の端を残し、細い帯へ巻き出します。像が長い筋となって重なり、ひらきます。',sweptPhotoDefaults,[
 c('spacing','帯の間隔',2,40,.5),c('band','帯の幅',10,100,1,'%'),c('hold','曲げ始める位置',0,85,1,'%'),c('length','引き延ばす長さ',30,300,1,'%'),c('curl','巻く角度',-360,420,1,'°'),c('spread','束のひらき',0,100),c('twist','帯のひねり',0,150),c('detail','写真による揺れ',0,100),c('tilt','見下ろす角度',-65,65,1,'°'),c('turn','全体を回す',-180,180,1,'°'),c('size','全体の大きさ',30,140,1,'%'),c('light','帯の陰影',0,100),c('paper','地の明るさ',0,100),c('lift','写真を白へ',0,100)
 ],true,true),sweptphoto:true},
];}
