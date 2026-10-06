import {hybridDefaults} from './hybrid-image.js';
export function hybridImageFilters(f,c){return [
 {...f('hybridimage','遠近の二重像','NEAR FAR HYBRID IMAGE','光・色','大きな色面と別の細部を一枚へ。同じ写真を使うか、近くで読む写真を追加し、位置を合わせて倍率による読みの変化を試します。',hybridDefaults,[
  c('farCut','遠くの形を残す尺度',4,64),c('nearCut','近くの細部を残す尺度',16,240),
  c('farGain','遠くの形の強さ',0,150,1,'%'),c('nearGain','近くの細部の強さ',0,250,1,'%'),
  c('farColour','遠くの写真色',0,100,1,'%'),c('nearColour','近くの写真色',0,100,1,'%'),
  c('zoom','近くの写真の倍率',50,200,1,'%'),c('turn','近くの写真を回す',-180,180,1,'°'),
  c('offsetX','近くの写真の位置・横',-100,100,1,'%'),c('offsetY','近くの写真の位置・縦',-100,100,1,'%'),
  c('mirror','近くの写真：元0・裏返し1',0,1),c('viewBand','表示：重ねる0・遠く1・近く2',0,2),
 ],true),hybridimage:true,research:{title:'Oliva, Torralba & Schyns — Hybrid images (SIGGRAPH 2006)',url:'https://web.stanford.edu/class/ee367/reading/OlivaTorralb_Hybrid_Siggraph06.pdf',note:'原論文Figure 2–4の低周波と高周波の加算、輪郭と大きな色面の位置合わせを参照。大きな形を3回の原寸box blurでGaussian近似し、近くの写真から同じ近似ぼかしを引いた細部を加算します。尺度は長辺あたりのcutoffをGaussianの1/2応答から換算した目安で、有限箱の実際の応答はGaussianと同一ではありません。追加写真は中央を縦横比を保って採り、原寸出力面上で細部を計算。画像外は端を延長し、blurの境界は鏡映。追加写真がない場合は調整中の写真を使います。2写真と位置合わせの内容によって読みの変化は異なり、色飽和・clampや輪郭の白黒縁は残ります。任意写真で原論文と同じ知覚効果を保証しません。固有seed・新依存・原著画像／コードの取り込みはありません。写真はレシピJSONへ含まれず、再現時は同じ2写真を別に開いてください。'}},
 ];}
