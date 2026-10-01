import React,{useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';

export function Icon({name}){
  const paths={menu:<path d="M5 6h14M5 12h14M5 18h14"/>,adjust:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="2.5"/><circle cx="15" cy="17" r="2.5"/></>,library:<><rect x="6" y="6" width="14" height="14" rx="2"/><path d="M16 3H4a1 1 0 0 0-1 1v12m6-2 3-3 5 5"/></>,close:<path d="m6 6 12 12M6 18 18 6"/>,open:<><path d="M12 4v12m-4-8 4-4 4 4M4 15v5h16v-5"/></>,compare:<><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 3v18"/></>,save:<path d="M12 15V3m-4 4 4-4 4 4M6 12H4v9h16v-9h-2"/>};
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export function useEdgePanels(){
  const [panelState,setPanelState]=useState({name:null,revision:0});
  const active=panelState.name;
  const current=useRef(null),pinned=useRef(false),dragging=useRef(false),openTimer=useRef(null),closeTimer=useRef(null);
  const panelRefs=useRef({}),triggerRefs=useRef({}),zoneRefs=useRef({}),focusRequest=useRef(null);
  const pointer=useRef(null),dismissed=useRef(null);
  const nearEntry=useCallback(name=>{
    const point=pointer.current;if(!point)return false;
    return [zoneRefs.current[name],triggerRefs.current[name]].some(el=>{if(!el)return false;const r=el.getBoundingClientRect();return point.x>=r.left&&point.x<=r.right&&point.y>=r.top&&point.y<=r.bottom;});
  },[]);
  const clearTimers=useCallback(()=>{clearTimeout(openTimer.current);clearTimeout(closeTimer.current);},[]);
  const show=useCallback((name,{pin=false,focus=false,restore=false}={})=>{
    clearTimers();
    focusRequest.current=focus?{panel:name}:restore&&current.current?{trigger:current.current}:null;
    current.current=name;pinned.current=pin;setPanelState(previous=>({name,revision:previous.revision+1}));
  },[clearTimers]);
  const close=useCallback(()=>{dismissed.current=nearEntry(current.current)?current.current:null;show(null,{restore:true});},[show,nearEntry]);
  useLayoutEffect(()=>{
    const request=focusRequest.current;focusRequest.current=null;
    if(request?.panel)panelRefs.current[request.panel]?.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary')?.focus();
    else if(request?.trigger)triggerRefs.current[request.trigger]?.focus();
  },[panelState]);
  const scheduleClose=useCallback(()=>{
    clearTimers();
    closeTimer.current=setTimeout(()=>{
      const name=current.current;if(!name||pinned.current||dragging.current)return;
      const panel=panelRefs.current[name];
      if(panel?.matches(':hover')||triggerRefs.current[name]?.matches(':hover')||zoneRefs.current[name]?.matches(':hover')||panel?.querySelector(':focus-visible'))return;
      show(null);
    },380);
  },[clearTimers,show]);
  const approach=useCallback((name,event)=>{
    if(event.pointerType!=='mouse'||!matchMedia('(hover:hover)').matches)return;
    clearTimers();if(current.current===name||pinned.current||dismissed.current===name)return;
    openTimer.current=setTimeout(()=>show(name),140);
  },[clearTimers,show]);
  useEffect(()=>{
    const escape=e=>{if(e.key==='Escape'&&current.current){e.preventDefault();close();}};
    const outside=e=>{if(e.pointerType==='mouse')pointer.current={x:e.clientX,y:e.clientY};if(e.target.closest('.toast'))return;const name=current.current;if(name&&!panelRefs.current[name]?.contains(e.target)&&!Object.values(triggerRefs.current).some(el=>el?.contains(e.target)))show(null);};
    const release=()=>{dragging.current=false;scheduleClose();};
    const move=e=>{if(e.pointerType!=='mouse')return;pointer.current={x:e.clientX,y:e.clientY};if(dismissed.current&&!nearEntry(dismissed.current))dismissed.current=null;};
    document.addEventListener('keydown',escape);document.addEventListener('pointerdown',outside);
    document.addEventListener('pointermove',move);
    document.addEventListener('pointerup',release);document.addEventListener('pointercancel',release);window.addEventListener('blur',release);
    return()=>{clearTimers();document.removeEventListener('keydown',escape);document.removeEventListener('pointerdown',outside);document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',release);document.removeEventListener('pointercancel',release);window.removeEventListener('blur',release);};
  },[clearTimers,close,scheduleClose,show,nearEntry]);
  return {active,close,show,
    triggerProps:name=>({id:`${name}-toggle`,ref:el=>{triggerRefs.current[name]=el;},'aria-controls':`${name}-panel`,'aria-expanded':active===name,tabIndex:active===name?-1:0,onPointerEnter:e=>approach(name,e),onPointerLeave:scheduleClose,onClick:e=>current.current===name&&pinned.current?close():show(name,{pin:true,focus:true})}),
    zoneProps:name=>({ref:el=>{zoneRefs.current[name]=el;},onPointerEnter:e=>approach(name,e),onPointerLeave:scheduleClose}),
    panelProps:name=>({id:`${name}-panel`,ref:el=>{panelRefs.current[name]=el;},inert:active!==name,'aria-hidden':active!==name,onPointerEnter:clearTimers,onPointerLeave:scheduleClose,onPointerDown:()=>{dragging.current=true;},onBlur:scheduleClose})
  };
}

const menus=[['toolbar','menu','写真・表示・書き出し'],['adjust','adjust','加工の調整'],['library','library','フィルターと組合せレシピ']];
export function EdgeTriggers({panels}){
  return menus.map(([name,icon,label])=><React.Fragment key={name}><div className={`edge-zone ${name}-zone`} aria-hidden="true" {...panels.zoneProps(name)}/><button className={`edge-trigger glass ${name}-trigger`} title={label} aria-label={`${label}を開閉`} {...panels.triggerProps(name)}><Icon name={icon}/></button></React.Fragment>);
}
export function FloatingPanel({name,title,panels,children}){
  return <section className={`floating-panel glass ${name}-panel ${panels.active===name?'is-open':''}`} aria-label={title} {...panels.panelProps(name)}><div className="panel-header"><h2>{title}</h2><button className="icon-button" onClick={panels.close} aria-label={`${title}を閉じる`}><Icon name="close"/></button></div>{children}</section>;
}

export function PhotoTools({image,name,compare,onCompare,onOpen,onExport,exporting,loading,disabled,view,onView,exportSize,onSize,onSample,onSaveRecipe,onLoadRecipe,saved,onDismissSaved,previewInfo,busy}){
  return <div className="photo-tools">
    <div className="tool-actions"><button onClick={onOpen} disabled={loading||exporting}><Icon name="open"/><span>写真を開く</span></button><button onClick={onCompare} disabled={disabled} aria-pressed={compare}><Icon name="compare"/><span>比較</span></button><button className="primary" onClick={onExport} disabled={disabled}><Icon name="save"/><span>{exporting?'書き出し中…':'書き出す'}</span></button></div>
    <div className="tool-options"><label>表示<select aria-label="画像の表示方法" value={view} onChange={e=>onView(e.target.value)} disabled={!image}>{view==='custom'&&<option value="custom">自由ズーム</option>}<option value="fit">全体表示</option><option value="fill">画面いっぱい</option><option value="actual">100%表示</option></select></label><label>PNGの長辺<select aria-label="書き出しの長辺" value={exportSize} onChange={e=>onSize(Number(e.target.value))} disabled={disabled}><option value={1600}>1600 px</option><option value={2560}>2560 px</option><option value={4096}>元サイズ（最大4096 px）</option></select></label></div>
    <div className="image-meta"><span className="filename" title={name}>{name}</span><span>{image?`${image.width} × ${image.height}`:'JPEG / PNG / WebP'}</span></div>
    {previewInfo&&<p className="preview-quality">{busy?'高精細に更新中':previewInfo.limited?'高精細表示':'原寸サイズで表示'}<span>{previewInfo.width} × {previewInfo.height} px</span></p>}
    {view==='fill'&&<p className="hint">表示では端が切れます。PNGは画像全体を書き出します。</p>}
    <details className="tool-details"><summary>レシピ・サンプル</summary><div className="recipe-actions"><button onClick={onSaveRecipe} disabled={disabled}>レシピを保存</button><button onClick={onLoadRecipe} disabled={disabled}>読み込む</button></div><p className="hint">加工順と調整値をJSONで保存。別の写真にも使えます。</p><div className="sample-buttons"><span>サンプル</span><button onClick={()=>onSample('color')} disabled={loading||exporting}>カラー</button><button onClick={()=>onSample('calla')} disabled={loading||exporting}>白い花</button><button onClick={()=>onSample('architecture')} disabled={loading||exporting}>建築</button></div><p className="hint">写真は端末内で処理されます。PNGは元画像より拡大しません。</p></details>
    {saved&&<div className="saved-output"><span>{saved.recipe?'加工のレシピ':`${saved.width} × ${saved.height} px`}</span><a href={saved.url} download={saved.name}>{saved.recipe?'JSONを保存':'PNGを保存'}</a><button className="icon-button" onClick={onDismissSaved} aria-label="保存リンクを閉じる"><Icon name="close"/></button></div>}
  </div>;
}
