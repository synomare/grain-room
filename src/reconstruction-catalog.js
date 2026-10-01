export function reconstructionFilters(f,c){
 const entry=(filter,title,url,note)=>({...filter,reconstruction:true,research:{title,url,note}});
 return [
 entry(f('quilt','縫合変異','MUTANT QUILT','再構成','写真を断片の採集場に。似た色を探し、輪郭を縫い合わせて未知の像へ。',{size:180,scatter:85,fidelity:38,magnify:155},[c('size','断片の大きさ',60,320),c('scatter','採集する距離',0,150),c('fidelity','元の構図への追従',0,100),c('magnify','断片の拡大',60,250,1,'%')],true,true),'Image Quilting / Efros & Freeman, 2001','https://people.eecs.berkeley.edu/~efros/research/quilting.html','重なりの色差と最小コストの縫い目を計算。一枚の写真を素材と構図の両方に用いる独自の変種。候補探索と二方向の継ぎ目を簡略化し、論文の二画像間転写とは区別しています。'),
 entry(f('elastic','弾性離像','ELASTIC DISLOCATION','再構成','像の内部をつかみ、局所的に引き伸ばす。細部を保ったまま形だけが軋む。',{pull:105,anchors:9,tension:170,twist:65},[c('pull','引く強さ',0,180),c('anchors','引く点の数',3,16),c('tension','変形の局所性',70,300),c('twist','捻る角度',0,180,1,'°')],true,true),'Moving Least Squares / Schaefer et al., 2006','https://people.engr.tamu.edu/schaefer/research/mls.pdf','点ごとに重みを変える相似変換の最小二乗解。写真から自動配置した制御点で逆向きの写像を構成します。対話的な手動ハンドルや剛体版は未実装。強い変形では折り返しを表現として許容します。'),
 entry(f('massbloom','凝集する像','MASS BLOOM','再構成','写真の色が寄り集まり、空洞と粒の群れになる。色を運びながら形を育てる。',{time:70,scale:9,affinity:65,relief:65},[c('time','育てる時間',0,120),c('scale','集まる範囲',3,18),c('affinity','集まりやすさ',0,100),c('relief','粒の起伏',0,100)],true,true),'Flow-Lenia / Plantec et al., 2025','https://arxiv.org/abs/2506.08569','親和性の勾配・過密時の反発・質量を保つ移送から着想。疎な環状サンプリングと双線形散布を使う写真向けの簡略モデルです。進化・学習・論文の生物個体の再現は行いません。'),
 ];
}
