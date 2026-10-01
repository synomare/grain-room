// Keep the native image detail whenever it fits the device's working budget.
// Filtering uses several RGBA/float buffers, in addition to the displayed canvas.
export function previewPlan(width,height,memoryGB){
  const pixels=memoryGB&&memoryGB<=2?4e6:memoryGB&&memoryGB<=4?8e6:memoryGB?24e6:16e6;
  const scale=Math.min(1,8192/Math.max(width,height),Math.sqrt(pixels/(width*height)));
  let edge=Math.max(1,Math.floor(Math.max(width,height)*scale));
  const dimensions=()=>({width:Math.max(1,Math.round(width*edge/Math.max(width,height))),height:Math.max(1,Math.round(height*edge/Math.max(width,height)))});
  let size=dimensions();while(size.width*size.height>pixels){edge--;size=dimensions();}
  return {edge,...size,limited:scale<1};
}

// An existing sharp frame stays on screen while the new one is computed.
// If a device cannot complete the full frame, retry smaller rather than go blank.
export async function renderBestPreview(renderer,image,layers,plan,isCurrent){
  const floor=Math.min(plan.edge,1600);let edge=plan.edge;
  for(let attempt=0;attempt<4;attempt++){
    if(!isCurrent())return null;
    try{
      const data=await renderer.render(image,layers,edge);
      return isCurrent()?{data,limited:plan.limited||edge<plan.edge}:null;
    }catch(error){
      if(!isCurrent())return null;
      if(edge<=floor||attempt===3)throw error;
      edge=Math.max(floor,Math.floor(edge/2));
    }
  }
}
