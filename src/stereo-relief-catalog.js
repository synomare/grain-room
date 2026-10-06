import {stereoDefaults} from './stereo-relief.js';

export function stereoReliefFilters(f,c){return [
 {...f('stereorelief','一枚の立体潜像','STEREO RELIEF','再構成','写真の明暗を高さに割り当て、繰り返す模様の間隔へ隠す。画面より奥へ視線を合わせて見る潜像。加工の濃さ100が基準です。',stereoDefaults,[
  c('pitch','模様の間隔',5,35,.1,'%'),
  c('depth','奥行きの幅',0,85,1,'%'),
  c('smooth','高さの滑らかさ',0,40,.5),
  c('gamma','高さの明暗',30,300,1,'%'),
  c('reverse','明るい所が近い0・遠い1',0,1),
  c('pattern','写真模様0・色粒1・白黒粒2',0,2),
  c('size','模様の粒の大きさ',.5,12,.5),
  c('phase','種模様の位置',0,100,.5,'%'),
  c('texture','模様の濃淡',0,100,1,'%'),
  c('guide','視線の目印',0,1),
  c('display','潜像0・高さを見る1',0,1),
 ],true,true),stereorelief:true,research:{
  title:'Thimbleby, Inglis & Witten (1994) — Displaying 3D Images: Algorithms for Single-Image Random-Dot Stereograms',
  url:'https://www2.cs.sfu.ca/CourseCentral/414/li/material/refs/SIRDS-Computer-94.pdf',
  note:'指定補足研究「影と立体視と光の配分」第3節、原著の視差幾何・両眼の遮蔽と、著者のPhotoshop資料の模様・高さの分離を参照。原寸の明度から仮想の高さを作り、見える対応画素を同色へ束ねる独立実装です。被写体の本当の3D形状は復元しません。原画への混合や後から重ねる加工は同色対応を崩す場合があります。濃さ100・潜像表示が基準。目印を出す場合は画面下5.5%を補助帯にします。表示の大きさ・模様・視線によって見え方が変わり、全員の立体知覚を保証しません。作者の図版・模様・コードは使用していません。',
 }},
 ];}
