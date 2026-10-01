import React,{useEffect,useRef,useState} from 'react';
import {commitNumber} from './numeric-value';

// A draft can be empty, '-' or a partial decimal. Only commit a complete edit.
export function NumericInput({value,min,max,step=1,label,onChange}){
  const [draft,setDraft]=useState(String(value)),cancelBlur=useRef(false),composing=useRef(false);
  useEffect(()=>{setDraft(String(value));},[value]);
  function commit(){
    const next=commitNumber(draft,value,min,max,step);setDraft(String(next));
    if(next!==value)onChange(next);
  }
  return <input type="text" role="spinbutton" inputMode={min<0?'text':step%1?'decimal':'numeric'} aria-label={label} title="Enterで確定、Escで入力を戻す。↑↓で微調整" aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} value={draft}
    onFocus={e=>{cancelBlur.current=false;e.target.select();}} onChange={e=>setDraft(e.target.value)}
    onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}}
    onBlur={()=>{if(cancelBlur.current){cancelBlur.current=false;return;}commit();}}
    onKeyDown={e=>{
      if(composing.current||e.nativeEvent.isComposing)return;
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelBlur.current=true;setDraft(String(value));e.currentTarget.blur();}
      else if(e.key==='Enter'){e.preventDefault();commit();}
      else if(e.key==='ArrowUp'||e.key==='ArrowDown'){
        e.preventDefault();const base=commitNumber(draft,value,min,max,step),next=commitNumber(String(base+(e.key==='ArrowUp'?1:-1)*step*(e.shiftKey?10:1)),value,min,max,step);
        setDraft(String(next));if(next!==value)onChange(next);
      }
    }}/>
}
