import {contextDefaults} from './context-windows.js';
export function contextWindowFilters(f,c){return [
 {...f('contextwindows','つながる写真窓','SHARED PHOTO WINDOWS','光・色','写真模様を窓の内外でつなぎ、周囲だけ明暗や向きを変える。同じ窓を二つの地に並べて見比べられます。',contextDefaults,[
  c('shape','窓の形：楕円0・曲線1',0,1),
  c('columns','横の窓・曲線の数',1,8),
  c('rows','縦の窓・曲線のうねり',1,8),
  c('size','窓の幅',0,100,1,'%'),
  c('stretch','楕円の縦横',50,200,1,'%'),
  c('bend','曲線を曲げる',0,100,1,'%'),
  c('angle','窓の向き',0,180,1,'°'),
  c('smooth','写真模様をまとめる',0,40),
  c('detail','原寸の細部を残す',0,100,1,'%'),
  c('colour','写真の色を残す',0,100,1,'%'),
  c('ground','周囲の明るさ',0,100,1,'%'),
  c('range','周囲の明暗差',0,100,1,'%'),
  c('turn','周囲だけ回す',0,180,1,'°'),
  c('ring','窓の縁を囲む幅',0,40),
  c('ringTone','囲む縁の明るさ',0,100,1,'%'),
  c('compare','比較：一枚0・左右1・上下2',0,2),
 ],true),contextwindows:true,research:{title:'Anderson & Winawer — Layered image representations and the computation of surface lightness (2008)',url:'https://bpb-us-e1.wpmucdn.com/wp.nyu.edu/dist/4/2136/files/2017/01/anderson_winawer_jov_2008.pdf?bid=2136',note:'指定写真資料第6節と原論文Figure 3–8の幾何的連続・明暗差・囲む縁の関係を参照。写真を共通の模様として使い、窓の内側と輪郭を固定したまま周囲を伸縮・移動する明暗域へ写します。曲線の窓は独自の周期正弦帯、楕円は隣接窓の和。原寸全画素を長辺384以下の面積平均格子へ集計してGaussianでまとめ、原寸から採った細部と色を混ぜます。比較は同じ中央範囲を縦横比を保って二度採り、周囲の明るさを反対にします。回転は周囲だけへ作用し、画像外は端の値を延長します。縁は内側にも覆い、囲む明暗と連続性を同時に変えます。物理的な半透明合成・透過率推定・1/f^4雲・実験条件の再現ではありません。見かけの明るさや層の読みは写真と表示環境により、色を残す場合の知覚効果は原論文から保証できません。固有seed・新依存・原論文の画像やコードを製品へ取り込みません。'}},
 ];}
