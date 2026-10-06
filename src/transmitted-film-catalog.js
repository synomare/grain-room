import{filmDefaults}from'./transmitted-film.js';
export function transmittedFilmFilters(f,c){return[
 {...f('transmittedfilm','透過する写真片','TRANSMITTED PHOTO FILM','光・色','写真片の交差で光と色を変えます。白地の透過像と、写真色の光跡を切り替え、形・位置・厚さで重なりを調整できます。',filmDefaults,[
  c('cells','写真片の細かさ',2,30),c('scale','写真片の大きさ',60,250,1,'%'),c('scatter','写真片のずれ',0,120,1,'%'),c('turn','写真片の回転',0,180,1,'°'),
  c('shape','形：四角0・丸1・菱形2',0,2),c('density','片の厚さ',0,250,1,'%'),c('clear','片の透ける量',0,80,1,'%'),c('exposure','通す光の量',40,200,1,'%'),
  c('negative','片の色：写真0・反対色1',0,1),c('edge','縁を薄くする',0,40,1,'%'),c('readout','表示：透過0・光跡1',0,1),
 ],true,true),transmittedfilm:true,research:{title:'James Welling — Glass House; Moholy-Nagy — Photograms',url:'https://www.regenprojects.com/exhibitions/james-welling7/press-release',note:'Regen Projectsの色フィルターによる撮影の解説と0158（2006）／8167（2009）の図版、Moholy-Nagy Foundationのfgm_422（1923）を実見し、色を通す層と重なりの関係を独自の写真片へ翻案。原寸RGBをlinear光量の代理値から光学厚みへ変換し、移動・回転・拡縮した四角／楕円／菱形の各点で厚みを補間して加算、指数の透過則へ渡します。縁では厚みを減らし、原寸4点をタイル内で計算。反対色の片と光跡表示の組合せでは写真色が戻り、透過表示では補色寄りになります。格子の片は被写体を自動認識せず、画像外の色は端を延長。3RGB帯域の代理計算であり、実フィルムの分光特性・反射・散乱・屈折・回折・銀塩紙の化学応答は再現しません。強い重なりの白化／暗化、背景の格子・同じ写真の断片反復、帯域proxy・clampは残ります。原著画像／コードの取り込みや新依存はなく、配置は共通seedで再現します。'}},
];}
