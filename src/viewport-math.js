const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function viewScale(mode,frame,size){
  if(mode==='actual')return 1;
  return Math[mode==='fill'?'max':'min'](frame.width/size.width,frame.height/size.height);
}
export function clampCamera(camera,frame,size){
  const x=Math.max(0,(size.width*camera.scale-frame.width)/2),y=Math.max(0,(size.height*camera.scale-frame.height)/2);
  return {...camera,x:x?clamp(camera.x,-x,x):0,y:y?clamp(camera.y,-y,y):0};
}
export function zoomAt(camera,factor,point,frame,size){
  const fit=viewScale('fit',frame,size),scale=clamp(camera.scale*factor,Math.min(fit*.25,1),Math.max(fit*16,1));
  const ratio=scale/camera.scale;
  return clampCamera({scale,x:point.x-(point.x-camera.x)*ratio,y:point.y-(point.y-camera.y)*ratio},frame,size);
}
