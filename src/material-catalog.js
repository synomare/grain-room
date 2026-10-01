export function materialFilters(f,c){
 const simonet={title:'制作参照：Jean-Vincent Simonet / In Bloom',url:'https://www.webberrepresents.com/exhibition/self-publish-be-happy',note:'乾かない印刷面を水や薬品で変える制作過程を参照。ここでは色材濃度の移動・拡散・乾燥を独自に計算。作家の技法そのものの再現ではありません。'};
 const castro={title:'制作参照：Jonathan Castro Alejos',url:'https://jonathancastro.pe/',note:'公式作品で見られる、荒れた像・鋭い線・色面の対置を参照。像の複写と浸食を独自に設計したもので、本人の制作手法を推定して再現したものではありません。'};
 return [
 {...f('wetprint','湿式乳剤','WET EMULSION','物質','色材が別々の速さで流れ、溜まり、洗い流される。まだ乾かない像。',{time:36,turbulence:75,separation:65,wash:60,density:40},[c('time','流す時間',0,65),c('turbulence','液体の乱れ',0,150),c('separation','色材の分離',0,100),c('wash','洗い流す量',0,100),c('density','色材の濃度',0,100)],true,true),material:true,research:simonet},
 {...f('squeegee','圧痕延伸','SQUEEGEE','物質','柔らかな写真を刃で押し、長い色の稜線へ引き延ばす。',{pull:370,width:130,strokes:7,angle:105,split:70},[c('pull','引きずる距離',0,450),c('width','刃の幅',20,200),c('strokes','刃の数',2,20),c('angle','押す方向',0,180,1,'°'),c('split','色の剥離',0,100)],true,true),material:true,research:{...simonet,note:'印刷面への身体的介入から着想。局所的な圧の領域、曲がった刃、筋のある座標変形による独立制作。物理的なヘラの精密シミュレーションではありません。'}},
 {...f('chromaticburn','色相焼蝕','CHROMATIC BURN','物質','色の濃度を折り返し、光と影を異なる色の膜に変える。',{burn:78,phase:16,contamination:65,separation:70,halo:40},[c('burn','焼く強さ',0,100),c('phase','色の折り返し',0,100),c('contamination','不均一な反応',0,100),c('separation','色層の分離',0,100),c('halo','輪郭の発光',0,100)],true,true),material:true,research:{...simonet,note:'写真の光と色が反転・混濁する視覚から着想。非単調の色応答と位置依存の反応量による独立処理。現像薬の化学反応の再現ではありません。'}},
 {...f('palimpsest','複写侵食','PALIMPSEST','物質','位置のずれた写真が何度も転写され、破れた色面と残像が折り重なる。',{passes:4,dislocation:55,rotation:25,transfer:70,erosion:65},[c('passes','転写の回数',0,7),c('dislocation','転写のずれ',0,100),c('rotation','回転のずれ',0,90,1,'°'),c('transfer','転写する量',0,100),c('erosion','剥がす量',0,100)],true,true),material:true,research:castro},
 ];
}
