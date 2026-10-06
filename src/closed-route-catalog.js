import {closedRouteDefaults} from './closed-route.js';

export function closedRouteFilters(f,c){return [
 {...f('closedroute','一筆の色回路','CLOSED COLOUR PATH','再構成','写真の色を、一つにつながる折り返しの線へ。輪郭への寄り方と丸みを変えて、迷路のような色面をつくる。',closedRouteDefaults,[
  c('size','経路の間隔',8,80),
  c('follow','輪郭への寄り方',0,100,1,'%'),
  c('random','つなぎ方の揺らぎ',0,100,1,'%'),
  c('angle','基準の向き',0,180,1,'°'),
  c('round','角の丸み',0,100,1,'%'),
  c('width','線の幅',1,100,1,'%'),
  c('weight','明暗で変わる幅',0,100,1,'%'),
  c('gamma','幅の明暗',30,300,1,'%'),
  c('reverse','明部が太い0・暗部が太い1',0,1),
  c('mode','写真色0・黒1・白2・反転色3',0,3),
  c('paper','下地の明るさ',0,100,1,'%'),
  c('lift','写真色の暗部を開く',0,100,1,'%'),
 ],true,true),closedroute:true,research:{
  title:'Cocco & Chermain (2026) — Field-Aligned Surface-Filling Curve via Implicit Stitching',
  url:'https://xavierchermain.github.io/publications/surface-filling-curve',
  note:'指定資料「数理描画のための線と履歴」の縞の接続と、Cocco・Chermainの閉曲線、Nomaほかの密度と曲率を参照。平面格子の小さな閉路を、写真の色と方向から選ぶ木に沿って継ぐ独立翻案です。原著の曲線フロー・暗黙場ソルバー・3D面の方式は再現していません。一本という条件は内部の中心線についてのもの。暗部と下地が同色、線同士の接触、原画混合ではPNGが一本に見えない場合があります。線幅は原寸写真の明暗、写真色は覆われた元画素を参照。揺らぎ0では配置番号、輪郭100では基準方向、幅の変化0では明暗と反転、黒白の線では写真色の暗部操作が効かない場合があります。作家の図版・コード・線を使用していません。',
 }},
 ];}
