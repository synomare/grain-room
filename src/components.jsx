import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {filters,getFilter,groups} from './filters';
import {putImage} from './renderer';
import {looks} from './looks';
import {useImageViewport} from './use-image-viewport';
import {NumericInput} from './numeric-input';

export function FilterRail({current,thumbnails,onSelect,onLook,lookId,onVary,onRestoreVariation,canRestoreVariation,disabled}){
  const [group,setGroup]=useState('線と面'),[query,setQuery]=useState('');
  const visible=filters.filter(f=>(group==='すべて'||group==='注目'&&f.featured||f.group===group)&&`${f.name} ${f.en}`.toLowerCase().includes(query.toLowerCase()));
  return <nav className="filter-rail" aria-label="フィルター">
    <div className="library-heading"><label className="look-picker"><span>組合せレシピ</span><select aria-label="組み合わせレシピ" value={lookId} disabled={disabled} onChange={e=>onLook(e.target.value)}><option value="" disabled>{looks.length}のレシピから選ぶ</option>{looks.map(look=><option key={look.id} value={look.id}>{look.name} / {look.en}</option>)}</select></label><div className="variation-actions"><button onClick={onVary} disabled={disabled}>大胆に変奏</button><button onClick={onRestoreVariation} disabled={disabled||!canRestoreVariation}>変奏を戻す</button></div></div>
    <div className="filter-search"><div className="categories" aria-label="加工の分類">{groups.map(g=><button key={g} aria-pressed={group===g} onClick={()=>setGroup(g)}>{g}</button>)}</div><input type="search" aria-label="フィルターを検索" placeholder="名前で探す" value={query} onChange={e=>setQuery(e.target.value)}/></div>
    <div className="filter-list">{visible.map(f=><button className={'filter-row '+(current===f.id?'selected':'')} key={f.id} aria-pressed={current===f.id} onClick={()=>onSelect(f.id)} disabled={disabled}>
      <span className="thumb">{thumbnails[f.id]?<img src={thumbnails[f.id]} alt=""/>:<span className="thumb-loading" aria-hidden="true"/>}</span><span className="filter-label"><strong>{f.name}</strong><small>{f.en}</small></span>
    </button>)}{!visible.length&&<p className="hint">該当するフィルターがありません。</p>}</div><p className="library-caption"><span>{filters.length} filters</span><span>{getFilter(current).name} を調整中</span></p>
  </nav>;
}
export function Slider({name,label,value,min,max,step=1,suffix='',onChange}){
  const id='control-'+name;
  return <div className="slider-control"><div className="slider-label"><label htmlFor={id}>{label}</label><span className="numeric"><NumericInput label={label+'の数値'} {...{value,min,max,step}} onChange={next=>onChange(name,next)}/>{suffix}</span></div><input id={id} type="range" value={value} min={min} max={max} step={step} style={{'--fill':`${(value-min)/(max-min)*100}%`}} onChange={e=>onChange(name,Number(e.target.value))}/></div>;
}
export function Inspector({layer,onParam,onStack,onUndo,onReset,layers,disabled}){
  const f=getFilter(layer.id),p=layer.params,panel=useRef(null);
  useEffect(()=>{if(panel.current)panel.current.scrollTop=0;},[layer.id]);
  return <div className="inspector" ref={panel}>
    <div className="effect-title"><h1>{f.name}</h1><span>{f.en}</span></div><p className="effect-description">{f.description}</p>
    <fieldset disabled={disabled} className="adjustments"><legend className="sr-only">加工の調整</legend>
      <div className="color-mode" role="group" aria-label="色のモード">{[['color','カラー'],['mono','白黒']].map(([v,label])=><button type="button" key={v} aria-pressed={p.colorMode===v} onClick={()=>onParam('colorMode',v)}>{label}</button>)}</div>
      <Slider name="mix" label="加工の濃さ" value={p.mix} min={0} max={100} suffix="%" onChange={onParam}/>
      {layer.id==='dither'&&<label className="select-label">ディザ方式<select value={p.mode} onChange={e=>onParam('mode',e.target.value)}><option value="atkinson">Atkinson</option><option value="floyd">Floyd–Steinberg</option><option value="bayer">Bayer 4×4</option></select></label>}
      {f.controls.map(([name,label,min,max,step,suffix])=><Slider key={name} {...{name,label,min,max,step,suffix}} value={p[name]} onChange={onParam}/>)}
      {f.random&&<div className="seed-control"><label>配置番号<NumericInput label="配置番号" value={p.seed} min={0} max={99999} onChange={next=>onParam('seed',next)}/></label><button onClick={()=>onParam('seed',(p.seed+137)%100000)}>別の配置</button></div>}
      <details className="tone-controls"><summary>色と質感</summary><Slider name="saturation" label="彩度" value={p.saturation} min={0} max={220} onChange={onParam}/><Slider name="contrast" label="コントラスト" value={p.contrast} min={30} max={250} onChange={onParam}/><Slider name="brightness" label="明るさ" value={p.brightness} min={-60} max={60} onChange={onParam}/><Slider name="grain" label="粒子" value={p.grain} min={0} max={60} onChange={onParam}/><label className="checkbox"><input type="checkbox" checked={p.invert} onChange={e=>onParam('invert',e.target.checked)}/>ネガ反転</label></details>
    </fieldset>
    <div className="stack-actions"><button className="primary full" onClick={onStack} disabled={disabled||layers.length>=6}>この加工を重ねる <span>＋</span></button><p className="hint">{layers.length>=6?'重ねられる加工は6つまでです。':'重ねたあと、次のフィルターを選べます。'}</p></div>
    <details className="history"><summary>重ねた加工 <span className="count">{layers.length}</span></summary>{layers.length?<><ol>{layers.map((item,i)=><li key={i}><span>{String(i+1).padStart(2,'0')}</span>{getFilter(item.id).name}<small>{getFilter(item.id).en}</small></li>)}</ol><button onClick={onUndo} disabled={disabled}>ひとつ戻す</button></>:<p className="hint">まだ加工を重ねていません。</p>}</details>
    {f.research&&<details className="research-note"><summary>この加工の研究背景</summary><a href={f.research.url} target="_blank" rel="noreferrer">{f.research.title} ↗</a><p>{f.research.note}</p></details>}
    <button className="text-button reset" onClick={onReset} disabled={disabled}>すべての加工をリセット</button>
  </div>;
}
export function ImageStage({data,image,compare,busy,busyLabel,onOpen,onFile,view,onView,qualityPlan}){
  const canvas=useRef(null),original=useRef(null),ambient=useRef(null);
  const viewport=useImageViewport({image,view,onView});
  useLayoutEffect(()=>{if(data&&canvas.current)putImage(canvas.current,data);},[data]);
  useLayoutEffect(()=>{
    if(!image||!original.current)return;
    const c=original.current;c.width=qualityPlan.width;c.height=qualityPlan.height;
    const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);
  },[image,qualityPlan]);
  useEffect(()=>{
    const source=compare||!data?original.current:canvas.current,c=ambient.current;
    if(!image||!source||!c)return;c.width=96;c.height=Math.max(1,Math.round(96*source.height/source.width));c.getContext('2d').drawImage(source,0,0,c.width,c.height);
  },[data,image,compare]);
  return <main ref={viewport.stage} {...viewport.events} tabIndex={image?0:-1} aria-describedby="viewport-help" className={'stage view-'+view+(viewport.canPan?' can-pan':'')+(viewport.dragging?' is-dragging':'')} aria-label="画像プレビュー" aria-busy={busy}>
    <canvas className="ambient-canvas" ref={ambient} aria-hidden="true"/>
    {!image?<button className="empty-state glass" onClick={onOpen}><span>写真を、素材に。</span><small>写真を開く、またはここにドロップ</small></button>:<div className="canvas-holder" style={viewport.style}><canvas ref={canvas} aria-label="加工した写真" hidden={compare||!data}/><canvas ref={original} aria-label="読み込んだ原画" hidden={!compare&&!!data}/></div>}
    <span id="viewport-help" className="sr-only">ホイールで拡大・縮小、ドラッグで移動。ダブルクリックまたは0キーで全体表示。＋と−キーでも倍率を変更できます。</span>
    {viewport.showScale&&!busy&&<span className="zoom-label glass" aria-live="polite">{viewport.percent}%</span>}
    {busy&&<span className="processing glass" role="status">{busyLabel}</span>}
    {compare&&<span className="original-label glass">原画</span>}
  </main>;
}
