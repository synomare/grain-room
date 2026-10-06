import {entangledPhotoDefaults} from './entangled-photo.js';
export function entangledPhotoFilters(f,c){return [
 {...f('entangledphoto','錯綜する像','ENTANGLED IMAGE','再構成','写真の細片、折れた面、極小の記録。密集した像から細い帯が伸びます。',entangledPhotoDefaults,[
 c('ribbonVisible','数字の帯',0,1),c('density','細片の密度',0,100),c('shrink','像を圧縮する',0,100),c('distort','面のうねり',0,100),c('bands','帯・細線の広がり',0,100),c('writing','帯の文字量',0,100),c('records','極小の記録',0,100),c('wires','引き出す細線',0,100),c('frames','赤い輪郭',0,100),c('colour','写真の色',0,100),c('source','下に残す写真',0,100,1,'%'),c('paper','地の明るさ',0,100)
 ],true,true),entangledphoto:true},
];}
