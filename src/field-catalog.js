export function fieldFilters(f,c){
 const add=(value,title,url,note)=>({...value,field:true,research:{title,url,note}});
 return [
 add(f('marble','色の櫛','CHROMATIC RAKE','線と面','色を櫛で引き、巻き込み、交差させる。写真の面が細い流線へ折り重なる。',{pull:190,passes:3,spacing:160,angle:85,swirl:65},[c('pull','引く距離',0,400),c('passes','櫛を通す回数',0,7),c('spacing','櫛の間隔',45,300),c('angle','櫛の向き',0,360,1,'°'),c('swirl','巻き込み',0,150)],true,true),'Oseen Flow in Paint Marbling / Jaffer, 2017–2018','https://arxiv.org/abs/1702.02106','第3節の指数減衰する直線変形を、交互方向の周期的な櫛へ拡張。独自の半径依存回転と逆写像を合成し、変形済み画像の再変形を避け、元写真を適応的に採取します。有限ストロークのOseen場や実際の絵具の物理シミュレーションではありません。'),
 add(f('accrete','輪郭の鉱物','CONTOUR MINERAL','線と面','輪郭から距離を測り、色の層を外側へ増やす。像と空白の境目に鉱物のような稜線が現れる。',{threshold:70,reach:130,spacing:18,relief:80,light:135,paper:0},[c('threshold','輪郭の選別',30,95),c('reach','層の広がり',0,300),c('spacing','層の間隔',5,65),c('relief','層の起伏',0,100),c('light','光の向き',0,360,1,'°'),c('paper','下地の明るさ',0,100)],true,false),'Distance Transforms of Sampled Functions / Felzenszwalb & Huttenlocher, 2012','https://cs.brown.edu/people/pfelzens/papers/dt-final.pdf','放物線の下包絡を使う正確な格子上のユークリッド距離変換を実装。輪郭抽出・距離の層・色の延長・照明は独自の表現です。鉱物の成長物理を再現するものではありません。'),
 ];
}
