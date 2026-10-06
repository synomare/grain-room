import{miuraDefaults}from'./miura-photo.js';
export function miuraPhotoFilters(f,c){return[
 {...f('miuraphoto','折る写真面','MIURA PHOTO SHEET','構造','一枚の写真を、連動する山と谷で畳みます。折り込む角度で像を詰め、視点と光で面の向きが現れます。白い折り面にも変えられます。',miuraDefaults,[
  c('cells','折り面の細かさ',2,32),c('ratio','面の細長さ',40,200,1,'%'),c('angle','折り目の斜めの角度',20,80,1,'°'),c('fold','折り込む角度',0,82,1,'°'),
  c('tilt','見る傾き',-75,75,1,'°'),c('turn','面の回転',-180,180,1,'°'),c('direction','折りの向き：縦0・横1',0,1),c('size','面の大きさ',40,160,1,'%'),
  c('light','光の向き',0,360,1,'°'),c('shade','面の陰影',0,100,1,'%'),c('paper','下地の明るさ',0,100,1,'%'),c('lift','写真を白へ寄せる',0,100,1,'%'),
 ],true,false),miuraphoto:true,research:{title:'Schenk & Guest — Geometry of Miura-folded metamaterials, 2013; Simon Schubert — paper folded',url:'https://www-g.eng.cam.ac.uk/advancedstructures/files/pdf/2013GuestD.pdf',note:'Schenk／Guest（2013）のunit cellの式1–4とFig.1を実見し、同じ辺長・面積を保つ平行四辺形の連動する山谷を独立実装。KudlekのSimon Schubert《o.T.(Schachtelung und Licht)》（2025、paper folded）を実見し、紙の折りと光が像をつくる関係を参照。Schubertの作品の折り方をMiura折りと同定せず、写真色を載せる構成と白化は独自の翻案。写真の矩形で面をclipし、原寸UVを保持した一続きの面を回転→平行投影、奥行きと原寸4点bilinearで描きます。折り角度に応じて面の投影寸法が縮み、自動fitでその縮みを相殺しません。照明は二面の簡易diffuse、写真色のbyte shadingで、反射・多重反射・落ちる影・紙厚み・折り目の丸み・紙の変形力学・被写体の実物3Dの再現は行いません。深い折りでは隠れと細部の縮小、角度と倍率による画面外の切れ、白化での色消失が残ります。新依存・原著画像／コードの本体取込み・固有randomなし。'}},
];}
