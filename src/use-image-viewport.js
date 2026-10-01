import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {clampCamera,viewScale,zoomAt} from './viewport-math';

export function useImageViewport({image,view,onView}){
  const stage=useRef(null),cameraRef=useRef({scale:1,x:0,y:0}),drag=useRef(null),timer=useRef(null);
  const [camera,setCamera]=useState(cameraRef.current),[frame,setFrame]=useState({width:1,height:1}),[dragging,setDragging]=useState(false),[showScale,setShowScale]=useState(false);
  // Camera units are native image pixels, independent of render-buffer size.
  // Completing a sharper render must never change the user's zoom or position.
  const size={width:image?.width||1,height:image?.height||1};
  const update=next=>{cameraRef.current=next;setCamera(next);};
  const flash=()=>{setShowScale(true);clearTimeout(timer.current);timer.current=setTimeout(()=>setShowScale(false),950);};
  function stopDrag(restore=false){
    const d=drag.current;if(!d)return;drag.current=null;setDragging(false);
    if(restore)update(d.initial);
    if(stage.current?.hasPointerCapture(d.id))stage.current.releasePointerCapture(d.id);
  }
  useEffect(()=>{const blur=()=>stopDrag();window.addEventListener('blur',blur);return()=>window.removeEventListener('blur',blur);},[]);
  useLayoutEffect(()=>{
    const el=stage.current,observer=new ResizeObserver(([entry])=>setFrame({width:entry.contentRect.width,height:entry.contentRect.height}));
    observer.observe(el);return()=>observer.disconnect();
  },[]);
  useLayoutEffect(()=>{
    if(!image)return;
    stopDrag();
    update(view==='custom'?clampCamera(cameraRef.current,frame,size):{scale:viewScale(view,frame,size),x:0,y:0});
  },[image,view,frame.width,frame.height,size.width,size.height]);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  useEffect(()=>{
    const el=stage.current;
    const wheel=e=>{
      if(!image||!e.deltaY)return;
      e.preventDefault();
      const rect=el.getBoundingClientRect(),delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?frame.height:1);
      const next=zoomAt(cameraRef.current,Math.exp(-Math.max(-160,Math.min(160,delta))*.0017),{x:e.clientX-rect.left-frame.width/2,y:e.clientY-rect.top-frame.height/2},frame,size);
      update(next);
      if(drag.current)Object.assign(drag.current,{camera:next,x:e.clientX,y:e.clientY});
      onView('custom');flash();
    };
    el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);
  },[image,frame.width,frame.height,size.width,size.height,onView]);
  const reset=()=>{update({scale:viewScale('fit',frame,size),x:0,y:0});onView('fit');flash();};
  const canPan=size.width*camera.scale>frame.width+.5||size.height*camera.scale>frame.height+.5;
  const end=e=>{if(drag.current?.id===e.pointerId)stopDrag();};
  const events={
    onPointerDown:e=>{if(!image||e.button!==0||e.pointerType==='touch'||drag.current)return;e.currentTarget.focus({preventScroll:true});if(!canPan)return;e.preventDefault();drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,camera:cameraRef.current,initial:cameraRef.current};e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);},
    onPointerMove:e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;update(clampCamera({...d.camera,x:d.camera.x+e.clientX-d.x,y:d.camera.y+e.clientY-d.y},frame,size));},
    onPointerUp:end,onPointerCancel:end,onLostPointerCapture:end,
    onDoubleClick:()=>{if(image)reset();},
    onKeyDown:e=>{
      if(!image||e.ctrlKey||e.metaKey||e.altKey)return;
      if(e.key==='Escape'&&drag.current){e.preventDefault();stopDrag(true);}
      else if(e.key==='0'){e.preventDefault();reset();}
      else if(['+','=','-'].includes(e.key)){e.preventDefault();update(zoomAt(cameraRef.current,e.key==='-'?1/1.2:1.2,{x:0,y:0},frame,size));onView('custom');flash();}
      else if(canPan&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
        e.preventDefault();const step=e.shiftKey?100:30,c=cameraRef.current;
        update(clampCamera({...c,x:c.x+(e.key==='ArrowLeft'?step:e.key==='ArrowRight'?-step:0),y:c.y+(e.key==='ArrowUp'?step:e.key==='ArrowDown'?-step:0)},frame,size));
      }
    }
  };
  return {stage,events,canPan,dragging,showScale,percent:Math.round(camera.scale*100),style:{width:size.width,height:size.height,transform:`translate(-50%,-50%) translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`}};
}
