import {ellipticOrbitDefaults} from './elliptic-orbits.js';
export function ellipticOrbitFilters(f,c){return [
 {...f('ellipticorbits','楕円を巡る像','ELLIPTIC PHOTO ORBITS','線と面','楕円の内側を巡る線に写真の色を載せる。回り方を替えると交差と中央の空白が変わり、交差面を写真片として残せます。',ellipticOrbitDefaults,[
  c('vertices','回路の折り返し数',24,64),
  c('turns','中心を巡る回数',1,8),
  c('aspect','楕円の幅と高さの比',35,100,1,'%'),
  c('families','重ねる回路の数',1,8),
  c('phase','回路の出発位置',0,360,1,'°'),
  c('rotation','全体の向き',0,360,1,'°'),
  c('scale','模様の大きさ',20,180,1,'%'),
  c('centerX','模様の横位置',0,100,1,'%'),
  c('centerY','模様の縦位置',0,100,1,'%'),
  c('width','線の太さ',0,18,.5),
  c('surface','描くもの：線0・交差面1',0,1),
  c('mode','色の読み方：写真0・巡る色1・反転2',0,2),
  c('paper','下地の明るさ',0,100,1,'%'),
  c('keep','背景へ写真を残す',0,100,1,'%'),
  c('ink','回路の濃さ',0,100,1,'%'),
 ],true,false),ellipticorbits:true,research:{
  title:'Steve Pomerantz — Creating Art by Constructing Poncelet Grids and Elliptic Billiards (Bridges 2025)',
  url:'https://archive.bridgesmathart.org/2025/bridges2025-407.pdf',
  note:'指定数理資料の補助資料と原著4頁の本文、図3〜7を参照。共焦点の二楕円、内側へ接する弦、閉じる周回と交差の関係を独立実装。外側の半軸1とaspect、内側の半軸sqrt(1−λ)・sqrt(aspect²−λ)を使い、指定折り返し数と周回数で戻るλを二分探索します。固定の始点で条件を求め、出発位置を変えた回路を描きます。数値許容誤差内の閉鎖で、全ての任意角や円錐曲線へ無条件に閉じるという主張ではありません。折り返し数と周回数の公約数により同じ短い回路を複数回巡る場合があります。重複する周回の線は一度だけ描きます。交差面は複数回路全体の偶奇規則で選び、内楕円の中央を除きます。原著の直交座標格子・装飾タイル・実際の織り・双曲線causticは実装しません。線は原寸の距離評価、面は原寸4点の所属評価。元写真のRGB、楕円の角度と内外の距離から読むRGB、反転色を選びます。色は0.78倍で暗くし、出力の画面比へ楕円を合わせます。縦長では長軸を縦へ向ける初期配置。面では線の太さが無効、回路の濃さ0では形の操作が無効。自動で写真の輪郭を追う加工や奥行きの復元ではありません。固有乱数はなく、原著の図版とコードは製品へ取り込みません。',
 }},
 ];}
