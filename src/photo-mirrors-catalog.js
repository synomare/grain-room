import{mirrorDefaults}from'./photo-mirrors.js';
export function photoMirrorFilters(f,c){return[
 {...f('photomirrors','曲面の写真鏡','CURVED PHOTO MIRRORS','光・色','写真を周囲へ広げ、球や輪の鏡へ映します。曲がり方で色と線が集まり、鏡を重ねると手前の面が像を隠します。',mirrorDefaults,[
  c('shape','鏡の形：球0・輪1',0,1),c('copies','鏡の数',1,24),c('size','鏡の大きさ',40,180,1,'%'),c('aspect','鏡の縦長さ',50,200,1,'%'),
  c('bulge','鏡のふくらみ',20,180,1,'%'),c('hole','輪の穴の大きさ',10,80,1,'%'),c('turn','鏡の回転',-180,180,1,'°'),
  c('yaw','映る向き',-180,180,1,'°'),c('pitch','映る傾き',-90,90,1,'°'),c('zoom','映る写真の倍率',40,220,1,'%'),c('paper','下地の明るさ',0,100,1,'%'),c('background','背景に残す写真',0,100,1,'%'),
 ],true,false),photomirrors:true,research:{title:'Public Art Fund — Anish Kapoor, Sky Mirror (2006); PBRT 4th — specular reflection and spherical coordinates',url:'https://www.publicartfund.org/exhibitions/view/sky-mirror/',note:'Public Art FundのSky Mirror（2006、Rockefeller Plaza）の解説と2207／2208の写真を実見。周囲の建築と空が曲面の中で別のまとまりになる関係を参照し、球／輪と一枚の写真環境へ独自翻案。設置作品の寸法や凹面の焦点・反転・観客の移動は再現しません。PBRT 4th §9.3.3式9.1の鏡面反射と§3.8.3の球座標を読み、固定の平行視線・解析的な楕円体／変形トーラスの法線・反射方向・原寸UVを独立実装。写真を水平方向に折返して周囲へ広げ、倍率は折返し後のUVへ適用して継ぎ目の飛びを抑えます。96pxタイルと原寸4点bilinear、各点の奥行きで描きます。写真は実360°環境測定ではなく、同じ像の反復・端の延長・極付近の圧縮と拡大時の隠れが残ります。実材のFresnel／分光・粗さ・多重反射・鏡同士の映り込み・落ちる影・被写体の実物3Dは再現しません。新依存・原著図版／コードの本体取込み・固有randomなし。'}},
];}
