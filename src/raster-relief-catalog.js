import {rasterDefaults} from './raster-relief.js';
export function rasterReliefFilters(f,c){return [
 {...f('rasterrelief','立ち上がる写真線','RASTER PHOTO RELIEF','再構成','写真を色の線へ分け、明るい場所を持ち上げます。線の太さと視点を変えると、細線から幅のある写真帯へ移ります。',rasterDefaults,[
  c('spacing','線の間隔',2,40),c('band','線の太さ',5,100,1,'%'),c('height','明るさを高さへ',0,80,1,'%'),
  c('smooth','高さのなめらかさ',0,30),c('gamma','高さの明暗の偏り',40,240,1,'%'),c('reverse','高さ：通常0・逆1',0,1),
  c('tilt','面を傾ける',0,80,1,'°'),c('turn','面を回す',-180,180,1,'°'),c('direction','線：横0・縦1',0,1),
  c('size','面の大きさ',40,160,1,'%'),c('light','面の陰影',0,100,1,'%'),c('paper','背景の明るさ',0,100,1,'%'),c('lift','線を白へ近づける',0,100,1,'%'),
 ],true),rasterrelief:true,research:{title:'Vasulka & Nygren — Didactic Video (1975); Rutt/Etra manual (1974)',url:'https://www.vasulka.org/archive/4-30c/AfterImageOct75(5024).pdf',note:'原資料Tableau I–IVの波形・面・明るさからの走査線変形を参照。独自の写真加工として、原寸の輝度を鏡映境界の3箱Gaussian近似で平滑化し、高さへ換算。2原寸画素ごとの帯形状を平行投影し、原寸写真色の補間と奥行き判定、画素あたり4点のcoverageをタイル内で計算します。間隔と平滑化は長辺1000px換算、高さは短辺比率。全帯の形状を画面へ収めてから倍率を適用するため、高さや回転でも写真面の大きさが変わります。背面も写真色を使い、陰影は簡易な両面照明です。細線の縮小消失、折返しによる隠れ、明暗だけから生じる背景の起伏、強い倍率での切れが残ります。実物の3D形状・CRT回路・動画／音響の再現ではありません。原資料の写真／コードを加工へ取り込まず、新依存・固有seedはありません。'}},
 ];}
