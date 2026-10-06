import {nestedPhotoDefaults} from './nested-photo.js';
export function nestedPhotoFilters(f,c){return [
 {...f('nestedphoto','奥へ入る写真','NESTED PHOTO SPIRAL','再構成','同じ写真が縮みながら奥へ続きます。枠を曲げ、入れ子を渦へ変えます。',nestedPhotoDefaults,[
 c('ratio','次の像の大きさ',12,75,1,'%'),c('spin','渦の巻数',-3,3),c('phase','奥へ進める',0,100,1,'%'),c('angle','向きを回す',-180,180,1,'°'),c('zoom','像を拡大',40,200,1,'%'),c('centerX','奥の位置・横',0,100,1,'%'),c('centerY','奥の位置・縦',0,100,1,'%'),c('sourceX','写真の位置・横',20,80,1,'%'),c('sourceY','写真の位置・縦',20,80,1,'%'),c('crop','写真の範囲',30,140,1,'%'),c('round','枠を丸く',0,100),c('gap','枠の幅',0,20),c('shade','奥の陰影',0,100),c('paper','地の明るさ',0,100)
 ],true,false),nestedphoto:true},
];}
