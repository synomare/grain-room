import {haarFilters} from './haar-catalog.js';
import {radonFilters} from './radon-catalog.js';
import {newtonFilters} from './newton-catalog.js';
import {photoelasticFilters} from './photoelastic-catalog.js';
import {crystalFilters} from './crystal-catalog.js';
import {adaptiveFilters} from './adaptive-catalog.js';
import {volumeFilters} from './volume-catalog.js';
import {aperiodicFilters} from './aperiodic-catalog.js';
import {emergentFilters} from './emergent-catalog.js';
import {microstructureFilters} from './microstructure-catalog.js';
import {frontierFilters} from './frontier-catalog.js';
import {fieldFilters} from './field-catalog.js';
import {structureFilters} from './structure-catalog.js';
import {researchFilters} from './research-catalog.js';
import {reconstructionFilters} from './reconstruction-catalog.js';
import {materialFilters} from './material-catalog.js';
export const common={brightness:0,contrast:100,grain:0,invert:false,colorMode:'color',saturation:100,mix:100,seed:17};
const c=(key,label,min,max,step=1,suffix='')=>[key,label,min,max,step,suffix];
const f=(id,name,en,group,description,defaults={},controls=[],featured=false,random=false)=>({id,name,en,group,description,defaults:{...common,...defaults},controls,featured,random});
export const groups=['線と面','再構成','物質','研究室','すべて','注目','印刷','流動','構造','光・色','記号'];
export const filters=[
...haarFilters(f,c),
...radonFilters(f,c),
...newtonFilters(f,c),
...photoelasticFilters(f,c),
...crystalFilters(f,c),
...adaptiveFilters(f,c),
...volumeFilters(f,c),
...aperiodicFilters(f,c),
...emergentFilters(f,c),
...microstructureFilters(f,c),
...frontierFilters(f,c),
...fieldFilters(f,c),
...structureFilters(f,c),
...reconstructionFilters(f,c),
...materialFilters(f,c),
...researchFilters(f,c),
f('memory','残留走査','MEMORY SCAN','流動','色を拾い、引きずり、像を走査。輪郭から長い尾がほどけます。',{drag:85,band:4,drift:18},[c('drag','色の残り',10,98),c('band','走査の幅',1,24),c('drift','うねり',0,70)],true,true),
f('flow','流紋','CURL FIELD','流動','写真の明暗を流れの地図に。輪郭に沿う渦で、像を折り畳みます。',{distance:90,scale:5,tension:60},[c('distance','流れる距離',0,220),c('scale','渦の密度',1,14,.5),c('tension','輪郭への追従',0,100)],true,true),
f('shards','裂片','SHARDS','構造','三角形の断片ごとに写真をずらす。切り口と像の連続をぶつけます。',{size:95,scatter:55,turn:25},[c('size','断片の大きさ',25,200),c('scatter','飛散',0,150),c('turn','回転',0,100)],true,true),
f('score','像の譜','IMAGE SCORE','記号','近くでは線の記号、遠くでは写真。明暗と輪郭の向きで筆跡が変わります。',{size:12,weight:65,paper:15},[c('size','記号の大きさ',5,32),c('weight','筆圧',10,100),c('paper','原画の残り',0,60)],true),
f('reaction','反応膜','REACTION','流動','写真から始まる反応と拡散。色の境目に、穴と枝が育ちます。',{time:140,feed:55,relief:75},[c('time','育てる時間',20,300,10),c('feed','模様の性質',25,70),c('relief','起伏',0,100)],true,true),
f('prism','分光','PRISM','光・色','赤・緑・青の像を異なる方向へ。色の輪郭が開きます。',{distance:18,angle:20},[c('distance','色のずれ',0,100),c('angle','方向',0,360,1,'°')]),
f('riso','色版','COLOR PLATES','印刷','シアン・マゼンタ・イエローの点を重ね、版ごとに位置をずらします。',{size:7,offset:4},[c('size','版の粒',3,25,.5),c('offset','見当ずれ',0,30)]),
f('sort','色の滝','PIXEL SORT','構造','明るさの範囲を選び、連続する画素を並べ替えます。',{threshold:65,span:210},[c('threshold','並べ替えの境界',0,230),c('span','連続する長さ',10,1000,10)]),
f('slit','短冊','SLIT SCAN','構造','細い帯に像を分け、ずれた時間のように組み直します。',{size:24,shift:140},[c('size','帯の幅',4,120),c('shift','ずれの距離',0,300)],false,true),
f('weave','編像','WEAVE','構造','縦と横の色の帯を交互に通す。像が織り目へほどけます。',{size:20,shift:65},[c('size','織り目',5,90),c('shift','引き伸ばし',0,180)]),
f('echo','反復孔','ECHO','構造','拡大と回転を繰り返し、像の内側にもうひとつの奥行きをつくります。',{depth:5,twist:12,zoom:115},[c('depth','反復の数',1,12),c('twist','ねじれ',-45,45),c('zoom','拡大率',102,160)]),
f('glass','屈折','REFRACTION','流動','写真自身の凹凸をレンズに。輪郭の周りで色が屈折します。',{distance:55,size:12},[c('distance','屈折の強さ',0,150),c('size','レンズの広がり',2,40)]),
f('iso','等色線','ISOBANDS','光・色','明るさを色の地層に変え、層の境目を鋭く浮かせます。',{levels:7,edge:65},[c('levels','地層の数',2,20),c('edge','境界の強さ',0,100)]),
f('hatch','彫線','ENGRAVING','印刷','写真の面を、交差する細い線で刻みます。',{size:5,angle:35},[c('size','線の間隔',2,18,.5),c('angle','線の向き',0,180,1,'°')]),
f('relief','起伏','RELIEF','構造','明暗を高さとして持ち上げ、色を尾根と谷へ押し流します。',{height:95,frequency:28},[c('height','高さ',0,220),c('frequency','稜線の数',5,80)]),
f('mosaic','細胞','VORONOI','構造','不均等なセルに色を集める。境界に濃淡を残した結晶状の面。',{size:30,edge:30},[c('size','細胞の大きさ',8,100),c('edge','境界の幅',0,100)],false,true),
f('fold','万華折','FOLD','構造','写真を扇状に折り返す。中心をずらすと別の対称形が現れます。',{segments:6,phase:20,focus:50},[c('segments','折り返す数',2,16),c('phase','回転',0,360,1,'°'),c('focus','中心の位置',10,90)]),
f('adaptive','分岐面','ADAPTIVE TILES','構造','細部の多い領域ほど細かく分割。大きな面と小さな色片が同居します。',{detail:24,size:120},[c('detail','分割の感度',4,70),c('size','最大の面',30,250)]),
f('mono','階調','TONE','光・色','色と明るさを整えます。カラー／白黒はどの加工でも切り替えられます。',{},[]),
f('halftone','網点','HALFTONE','印刷','色ごとの網点を重ね、連続した階調を点へ変えます。',{size:6,angle:45},[c('size','網点の大きさ',3,24,.5),c('angle','角度',0,90,1,'°')]),
f('dither','ディザ','DITHER','印刷','チャンネルごとの誤差を次の粒へ渡し、色を粒の集合へ。',{size:2,mode:'atkinson'},[c('size','粒の大きさ',1,8)]),
f('xerox','コピー','XEROX','印刷','色版ごとのかすれと潰れた影。複写を重ねた紙のように。',{contrast:145,grain:15,threshold:135,bleed:1},[c('threshold','版のしきい値',30,220),c('bleed','にじみ',0,4,.5)]),
f('contour','輪郭','CONTOUR','印刷','色の変わり目を抽出し、面を細い輪郭へほどきます。',{strength:180,width:1.5},[c('strength','線の強さ',40,400,5),c('width','線の太さ',.5,4,.5)]),
f('wave','波形','WAVE','流動','画像の行を揺らし、像を波へ。振幅と周期で歪みを調整します。',{amplitude:25,frequency:6,phase:0},[c('amplitude','振幅',0,100),c('frequency','波の数',1,24,.5),c('phase','位相',0,360,1,'°')]),
];
export const getFilter=id=>filters.find(f=>f.id===id);
export const makeLayer=(id='flow')=>({id,params:{...getFilter(id).defaults}});
