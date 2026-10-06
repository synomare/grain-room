import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {filters,makeLayer} from './filters';
import {createRenderer,loadImage,putImage} from './renderer';
import {FilterRail,Inspector,ImageStage} from './components';
import {useEdgePanels,EdgeTriggers,FloatingPanel,PhotoTools} from './editor-shell';
import {encodeRecipe,decodeRecipe} from './recipes';
import './style.css';
import {looks} from './looks';
import {varyLayers} from './variations';
import {previewPlan,renderBestPreview} from './preview-quality';

function App(){
  const [image,setImage]=useState(null),[name,setName]=useState('SAMPLE / CALLA');
  const [nearImage,setNearImage]=useState(null),[nearName,setNearName]=useState(''),[nearLoading,setNearLoading]=useState(false),nearInput=useRef(null),nearLoadGeneration=useRef(0);
  const [layer,setLayer]=useState(()=>makeLayer('marble')),[layers,setLayers]=useState([]);
  const [data,setData]=useState(null),[thumbnails,setThumbnails]=useState({});
  const [previewInfo,setPreviewInfo]=useState(null);
  const activeNearImage=(layer.id==='hybridimage'||layers.some(l=>l.id==='hybridimage'))?nearImage:null;
  const qualityPlan=useMemo(()=>image?previewPlan(image.width,image.height,navigator.deviceMemory,activeNearImage):null,[image,activeNearImage]);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[exporting,setExporting]=useState(false);
  const [compare,setCompare]=useState(false),[view,setView]=useState('fit'),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [exportSize,setExportSize]=useState(4096);
  const [saved,setSaved]=useState(null);
  const [lookId,setLookId]=useState('');
  const [variationBackup,setVariationBackup]=useState(null);
  const [fileHover,setFileHover]=useState(false);
  const editRevision=useRef(0),dropDepth=useRef(0);
  const panels=useEdgePanels();
  const fileInput=useRef(null),recipeInput=useRef(null),renderer=useRef(null),generation=useRef(0),loadGeneration=useRef(0);
  useEffect(()=>{renderer.current=createRenderer({latestOnly:true});openSample();return()=>renderer.current?.dispose();},[]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(timer);},[notice]);
  useEffect(()=>()=>{if(saved)URL.revokeObjectURL(saved.url);},[saved]);
  useEffect(()=>{
    if(!image||!renderer.current)return;
    const current=++generation.current;setBusy(true);
    const timer=setTimeout(()=>{
      renderBestPreview(renderer.current,image,[...layers,layer],qualityPlan,()=>generation.current===current,{nearImage:activeNearImage}).then(result=>{if(result&&generation.current===current){setData(result.data);setPreviewInfo({width:result.data.width,height:result.data.height,limited:result.limited});setBusy(false);}}).catch(e=>{if(generation.current===current){setError(e.message);setBusy(false);}});
    },70);
    return()=>{clearTimeout(timer);generation.current++;};
  },[image,layer,layers,qualityPlan,activeNearImage]);
  useEffect(()=>{
    if(!image)return;let cancelled=false;
    const thumbRenderer=createRenderer();
    (async()=>{
      const result={};
      for(const f of filters){
        if(f.hybridimage)continue;
        const thumbWidth=Math.ceil(180*Math.min(3,Math.max(1,window.devicePixelRatio||1))),thumbHeight=Math.round(thumbWidth*2/3);
        const coverScale=Math.max(thumbWidth/image.width,thumbHeight/image.height);
        const pixels=await thumbRenderer.render(image,[makeLayer(f.id)],Math.min(960,Math.ceil(Math.max(image.width,image.height)*coverScale)));
        if(cancelled)return;
        const source=document.createElement('canvas');putImage(source,pixels);
        const thumb=document.createElement('canvas');thumb.width=thumbWidth;thumb.height=thumbHeight;
        const ctx=thumb.getContext('2d'),cropW=Math.min(source.width,source.height*1.5),cropH=cropW/1.5;
        ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        ctx.drawImage(source,(source.width-cropW)/2,(source.height-cropH)/3,cropW,cropH,0,0,thumbWidth,thumbHeight);
        result[f.id]=thumb.toDataURL('image/png');
        if(!cancelled)setThumbnails(previous=>({...previous,...result}));
      }
      if(!cancelled)setThumbnails(previous=>({...previous,...result}));
    })().catch(()=>{});
    return()=>{cancelled=true;thumbRenderer.dispose();};
  },[image]);
  useEffect(()=>{
    if(!image)return;let cancelled=false;const thumbRenderer=createRenderer(),width=Math.ceil(180*Math.min(3,Math.max(1,window.devicePixelRatio||1))),height=Math.round(width*2/3);
    const coverScale=Math.max(width/image.width,height/image.height),edge=Math.min(960,Math.ceil(Math.max(image.width,image.height)*coverScale));
    thumbRenderer.render(image,[makeLayer('hybridimage')],edge,{nearImage}).then(pixels=>{
      if(cancelled)return;const source=document.createElement('canvas');putImage(source,pixels);const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d'),cw=Math.min(source.width,source.height*1.5),ch=cw/1.5;ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,(source.width-cw)/2,(source.height-ch)/3,cw,ch,0,0,width,height);const uri=canvas.toDataURL('image/png');setThumbnails(previous=>({...previous,hybridimage:uri}));
    }).catch(()=>{});return()=>{cancelled=true;thumbRenderer.dispose();};
  },[image,nearImage]);
  async function openSource(url,filename){
    const id=++loadGeneration.current;++editRevision.current;setLoading(true);setError('');setNotice('');
    try{
      const loaded=await loadImage(url);
      if(id!==loadGeneration.current)return;
      if(loaded.width*loaded.height>60000000)throw new Error('6000万画素を超える画像です。小さくしてから開いてください。');
      setVariationBackup(null);setLookId('');setImage(loaded);setName(filename);setLayers([]);setLayer(makeLayer('marble'));setCompare(false);setView('fit');setData(null);setPreviewInfo(null);setThumbnails({});setSaved(null);
    }catch(e){if(id===loadGeneration.current)setError(e.message);}
    finally{if(id===loadGeneration.current)setLoading(false);}
  }
  function openSample(kind='color'){if(exporting)return;return openSource(new URL(import.meta.env.BASE_URL+(kind==='calla'?'sample-calla.png':kind==='architecture'?'sample-architecture.png':'sample-color.png'),location.href).href,kind==='calla'?'SAMPLE / CALLA':kind==='architecture'?'SAMPLE / ARCHITECTURE':'SAMPLE / COLOR');}
  async function openFile(file){
    if(!file||exporting)return;
    if(!/^image\/(jpeg|png|webp|avif|gif|bmp)$/.test(file.type)){setError('JPEG・PNG・WebP形式の写真を選んでください。HEICはJPEGに変換してから開けます。');return;}
    if(file.size>50*1024*1024){setError('50 MB以下の画像を選んでください。');return;}
    const url=URL.createObjectURL(file);try{await openSource(url,file.name);}finally{URL.revokeObjectURL(url);}
  }
  async function openNearFile(file){
    if(!file||exporting)return;
    if(!/^image\/(jpeg|png|webp|avif|gif|bmp)$/.test(file.type)){setError('近くの写真にはJPEG・PNG・WebP形式を選んでください。');return;}
    if(file.size>50*1024*1024){setError('近くの写真は50 MB以下を選んでください。');return;}
    const id=++nearLoadGeneration.current,url=URL.createObjectURL(file);++editRevision.current;setNearLoading(true);setError('');
    try{const loaded=await loadImage(url);if(id!==nearLoadGeneration.current)return;if(loaded.width*loaded.height>60000000)throw new Error('6000万画素を超える画像です。小さくしてから開いてください。');setNearImage(loaded);setNearName(file.name);setCompare(false);setSaved(null);setNotice('近くで読む写真を追加しました。位置と倍率を合わせてください。');}
    catch(e){if(id===nearLoadGeneration.current)setError(e.message);}
    finally{URL.revokeObjectURL(url);if(id===nearLoadGeneration.current)setNearLoading(false);}
  }
  function clearNear(){++nearLoadGeneration.current;++editRevision.current;setNearImage(null);setNearName('');setNearLoading(false);setSaved(null);setCompare(false);setNotice('現在の写真の細部を使います。');}
    function vary(){++editRevision.current;const previous=structuredClone([...layers,layer]);setVariationBackup(previous);const seed=crypto.getRandomValues(new Uint32Array(1))[0]%100000;const next=varyLayers(previous,seed);setLayers(next.slice(0,-1));setLayer(next.at(-1));setLookId('');setCompare(false);setError('');setNotice('別の崩れ方へ変奏しました。「変奏を戻す」で直前に戻せます。');}
  function restoreVariation(){++editRevision.current;if(!variationBackup)return;const previous=structuredClone(variationBackup);setLayers(previous.slice(0,-1));setLayer(previous.at(-1));setVariationBackup(null);setLookId('');setCompare(false);setError('');}
  function selectLook(id){++editRevision.current;setVariationBackup(null);setLookId(id);const look=looks.find(item=>item.id===id);if(!look)return;const list=structuredClone(look.layers);setLayers(list.slice(0,-1));setLayer(list.at(-1));setCompare(false);setError('');setNotice(look.name+'：'+look.description);}
  function selectFilter(id){++editRevision.current;setVariationBackup(null);setLookId('');setLayer(makeLayer(id));setCompare(false);setError('');}
  function changeParam(key,value){++editRevision.current;setError('');setLookId('');setLayer(previous=>({...previous,params:{...previous.params,[key]:value}}));setCompare(false);}
  function stack(){++editRevision.current;setLookId('');if(layers.length>=6)return;setVariationBackup(null);setLayers(previous=>[...previous,structuredClone(layer)]);setLayer(makeLayer('mono'));setCompare(false);setNotice('加工を重ねました。次のフィルターを選べます。');}
  function undo(){++editRevision.current;setLookId('');if(!layers.length)return;setVariationBackup(null);setLayer(layers[layers.length-1]);setLayers(layers.slice(0,-1));setCompare(false);setNotice('最後の加工を、調整できる状態に戻しました。');}
  function reset(){++editRevision.current;setVariationBackup(null);setLookId('');setLayers([]);setLayer(makeLayer('mono'));setCompare(false);setError('');setNotice('加工をリセットしました。');}
  function saveRecipe(){
    const url=URL.createObjectURL(new Blob([encodeRecipe([...layers,layer])],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='grain-room-recipe.json';document.body.appendChild(link);link.click();link.remove();
    setSaved({url,name:link.download,recipe:true});setNotice('レシピを作成しました。右上のメニューからも保存できます。');
  }
  async function loadRecipe(file){
    if(!file||loading||exporting)return;
    const revision=++editRevision.current;
    try{
      if(file.size>100000)throw new Error('100 KB以下のレシピを選んでください。');
      const list=decodeRecipe(await file.text());
      if(editRevision.current!==revision)return;
      setVariationBackup(null);setLookId('');setLayers(list.slice(0,-1));setLayer(list.at(-1));setCompare(false);setError('');setNotice('レシピを読み込みました。');
    }catch(e){if(editRevision.current===revision)setError(e.message);}
  }
  async function download(){
    if(!image||exporting||loading||nearLoading)return;++editRevision.current;setExporting(true);setSaved(null);setError('');setNotice('');
    const exporter=createRenderer();
    try{
      const pixels=await exporter.render(image,[...layers,layer],exportSize,{nearImage:activeNearImage});
      const canvas=document.createElement('canvas');putImage(canvas,pixels);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('保存用の画像を作れませんでした。書き出しサイズを小さくしてお試しください。');
      const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=`grain-room_${name==='SAMPLE / CALLA'?'calla':name.replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}_-]/gu,'_')}_${pixels.width}x${pixels.height}.png`;
      setSaved({url,name:link.download,width:pixels.width,height:pixels.height});
      document.body.appendChild(link);link.click();link.remove();
      setNotice(`${pixels.width} × ${pixels.height} px のPNGを作成しました。保存されない場合は右上の「PNGを保存」を押してください。`);
    }catch(e){setError(e.message||'書き出せませんでした。サイズを小さくしてお試しください。');}
    finally{exporter.dispose();setExporting(false);}
  }
  const disabled=loading||nearLoading||exporting||!image;
  return <div className="app" onDragEnter={e=>{if(Array.from(e.dataTransfer.types).includes('Files')){e.preventDefault();dropDepth.current++;setFileHover(true);}}} onDragLeave={()=>{dropDepth.current=Math.max(0,dropDepth.current-1);if(!dropDepth.current)setFileHover(false);}} onDragOver={e=>{if(Array.from(e.dataTransfer.types).includes('Files')){e.preventDefault();e.dataTransfer.dropEffect=exporting?'none':'copy';}}} onDrop={e=>{e.preventDefault();dropDepth.current=0;setFileHover(false);openFile(e.dataTransfer.files[0]);}} onDragEnd={()=>{dropDepth.current=0;setFileHover(false);}}>
    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp" hidden onChange={e=>{openFile(e.target.files[0]);e.target.value='';}}/>
    <input ref={recipeInput} type="file" accept=".json,application/json" hidden onChange={e=>{loadRecipe(e.target.files[0]);e.target.value='';}}/>
    <input ref={nearInput} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif,image/bmp" hidden onChange={e=>{openNearFile(e.target.files[0]);e.target.value='';}}/>
    <ImageStage {...{data,image,compare,view,qualityPlan}} onView={setView} busy={busy||loading||nearLoading||exporting} busyLabel={loading?'写真を読み込み中…':nearLoading?'近くの写真を読み込み中…':exporting?'PNGを書き出し中…':'高精細に描画中…'} onOpen={()=>fileInput.current.click()} onFile={openFile}/>
    {fileHover&&<div className="file-drop-target"><span className="glass">{exporting?'書き出しの完了をお待ちください':'写真をここにドロップ'}</span></div>}
    <EdgeTriggers panels={panels}/>
    <FloatingPanel name="toolbar" title="写真・表示" panels={panels}><PhotoTools {...{image,name,compare,exporting,loading,disabled,view,exportSize,saved,previewInfo,busy}} onCompare={()=>setCompare(v=>!v)} onOpen={()=>fileInput.current.click()} onExport={download} onView={setView} onSize={setExportSize} onSample={openSample} onSaveRecipe={saveRecipe} onLoadRecipe={()=>recipeInput.current.click()} onDismissSaved={()=>setSaved(null)}/></FloatingPanel>
    <FloatingPanel name="adjust" title="調整" panels={panels}><Inspector {...{layer,layers,disabled,nearName}} onNearOpen={()=>nearInput.current.click()} onNearClear={clearNear} onParam={changeParam} onStack={stack} onUndo={undo} onReset={reset}/></FloatingPanel>
    <FloatingPanel name="library" title="加工" panels={panels}><FilterRail onVary={vary} onRestoreVariation={restoreVariation} canRestoreVariation={!!variationBackup} lookId={lookId} current={layer.id} thumbnails={thumbnails} onSelect={selectFilter} onLook={selectLook} disabled={disabled}/></FloatingPanel>
    {(notice||error)&&<div className={'toast glass '+(error?'error':'')} role={error?'alert':'status'}>{error||notice}<button aria-label="通知を閉じる" onClick={()=>{setNotice('');setError('');}}>×</button></div>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
