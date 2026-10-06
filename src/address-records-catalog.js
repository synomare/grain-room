import {addressDefaults} from './address-records.js';
export function addressFilters(f,c){return [
 {...f('addressrecords','色の住所','COLOUR ADDRESSES','記号','写真を格子の位置と番号へ写す。少しずらした記録を色で分け、近くでは住所、遠くでは像として読む。',addressDefaults,[
  c('size','格子の大きさ',10,100),
  c('select','拾う部分：明0・暗1・色2',0,2),
  c('threshold','拾う部分の境目',0,100,1,'%'),
  c('coverage','セルを埋める面積',0,100,1,'%'),
  c('records','重ねる記録の数',1,5),
  c('spread','記録どうしの距離',0,100,1,'%'),
  c('angle','記録をずらす向き',0,180,1,'°'),
  c('originX','番号0の横位置',0,100,1,'%'),
  c('originY','番号0の縦位置',0,100,1,'%'),
  c('basis','住所：列0・行1・通し2',0,2),
  c('mode','色の重ね方：帯0・透過1・番号2',0,2),
  c('fill','色面の濃さ',0,100,1,'%'),
  c('source','写真の色を使う',0,100,1,'%'),
  c('paper','紙の明るさ',0,100,1,'%'),
  c('text','番号の大きさ',10,100,1,'%'),
 ],true,false),addressrecords:true,research:{
  title:'Charles Gaines — conversation with Stacen Berg / Trees, David Platzker (2019)',
  url:'https://www.hauserwirth.com/ursula/24750-conversation-charles-gaines-stacen-berg/',
  note:'指定写真資料第4節と作者対話・Treesの解説、三画面と作業図を参照。位置を失わない格子、原点からの番号、空白、複数記録の色を独立の写真加工へ翻案しました。選択は原寸画素の明暗または最大最小RGB差とセル内面積で、花・樹木の意味認識や輪郭抽出ではありません。同じ写真のセルを整数で循環移動し、記録ごとに元のセル住所を表示します。列／行は原点との差、通し番号は行優先セルindexと原点indexとの差。作者の樹木の座標法そのものではなく、参照作品の異なる複数の樹木や政治的文脈を再現しません。帯は記録ごとにセルを分割、透過は色面を乗算、番号では色面の濃さは無効です。記録1では距離と向きは無効、距離0や整数丸めで移動0では向きが効きません。列は縦原点、行は横原点が無効。既存のRoboto Mono字形を距離場から原寸描画し、全入力画素をセル集計します。格子は表現の構造であり縮小プレビューではありません。配置番号は使わず、図版と作者コードは製品へ取り込みません。',
 }},
 ];}
