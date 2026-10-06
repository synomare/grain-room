import {knottedPhotoDefaults} from './knotted-photo.js';
export function knottedPhotoFilters(f,c){return [
 {...f('knottedphoto','結ばれる写真','KNOTTED PHOTO RIBBON','物質','写真を折り返してつなぎ、幅のある帯で輪や結び目をつくります。',knottedPhotoDefaults,[
 c('shape','輪と結び目',0,2),c('width','帯の幅',20,140,1,'%'),c('depth','結びの奥行き',20,100),c('twist','帯をひねる',-3,3),c('roll','帯の傾き',-180,180,1,'°'),c('tilt','上下から見る',-80,80,1,'°'),c('yaw','左右から見る',-80,80,1,'°'),c('turn','全体を回す',-180,180,1,'°'),c('size','全体の大きさ',20,140,1,'%'),c('repeat','写真の反復',1,8),c('light','帯の陰影',0,100),c('paper','地の明るさ',0,100),c('lift','写真を白へ',0,100)
 ],true,false),knottedphoto:true},
];}
