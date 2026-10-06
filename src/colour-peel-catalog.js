import {colourPeelDefaults} from './colour-peel.js';
export function colourPeelFilters(f,c){return [
 {...f('colourpeel','剥がれる写真の層','PEELING COLOUR SHEETS','物質','写真の色面を薄い紙の層へ。めくれた裏面と、下に残る像が重なります。',colourPeelDefaults,[
 c('size','剥がれる面の大きさ',80,340),c('boundary','写真の色に沿う',0,100),c('amount','剥がす範囲',0,100,1,'%'),c('curl','めくる角度',0,270,1,'°'),c('direction','剥がす向き',0,360,1,'°'),c('scatter','向きのばらつき',0,100),c('paper','下の紙の明るさ',0,100),c('under','下に残す像',0,100,1,'%'),c('shadow','紙の影',0,100),c('light','光の向き',0,360,1,'°')
 ],true,true),colourpeel:true,research:{title:'写真の色面を剥がれる支持体に変える',note:'近い色と位置をまとめた領域を連結した薄片へ分け、片端を残して円筒状に曲げます。表面は原寸写真を運び、裏面は紙の色と微細な繊維、下地には少し位置をずらした淡い像を置きます。Jacques Villeglé《122 rue du temple》のMoMA掲載画像で、欠損と露出した色面の関係を参照しました。作品画像を素材には使いません。被写体の意味認識や破壊・接着の力学計算ではなく、有限の色領域と曲面による独自の近似です。均一な背景では領域分割が見え、大きくめくると被写体が隠れることがあります。',url:'https://www.moma.org/collection/works/35414'}},
];}
