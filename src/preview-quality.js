// Keep the native image detail whenever it fits the device's working budget.
// Filtering uses several RGBA/float buffers, in addition to the displayed canvas.
export function previewPlan(width,height,memoryGB,near=null){
  const pixels=memoryGB&&memoryGB<=2?4e6:memoryGB&&memoryGB<=4?8e6:memoryGB?24e6:16e6;
  const extra=near?near.width*near.height:0,scale=Math.min(1,8192/Math.max(width,height,near?.width||0,near?.height||0),Math.sqrt(pixels/(width*height+extra)));
  let edge=Math.max(1,Math.floor(Math.max(width,height)*scale));
  const dimensions=()=>({width:Math.max(1,Math.round(width*edge/Math.max(width,height))),height:Math.max(1,Math.round(height*edge/Math.max(width,height)))});
  let size=dimensions(),nearEdge=near?Math.max(1,Math.floor(Math.max(near.width,near.height)*scale)):0;
  const nearDimensions=()=>near?{width:Math.max(1,Math.round(near.width*nearEdge/Math.max(near.width,near.height))),height:Math.max(1,Math.round(near.height*nearEdge/Math.max(near.width,near.height)))}:{width:0,height:0};
  let ns=nearDimensions();while(size.width*size.height+ns.width*ns.height>pixels){if(near&&nearEdge>edge&&nearEdge>1){nearEdge--;ns=nearDimensions();}else if(edge>1){edge--;size=dimensions();}else if(nearEdge>1){nearEdge--;ns=nearDimensions();}else break;}
  const plan={edge,...size,limited:scale<1};if(near)plan.nearEdge=nearEdge;return plan;
}

// An existing sharp frame stays on screen while the new one is computed.
// If a device cannot complete the full frame, retry smaller rather than go blank.
export async function renderBestPreview(renderer,image,layers,plan,isCurrent,resources={}){
  const floor=Math.min(plan.edge,1600);let edge=plan.edge,nearEdge=plan.nearEdge||plan.edge;
  const nearFloor=Math.min(nearEdge,1600);
  for(let attempt=0;attempt<4;attempt++){
    if(!isCurrent())return null;
    try{
      const paired=resources.nearImage?{...resources,nearEdge}:resources;
      const data=await renderer.render(image,layers,edge,paired);
      return isCurrent()?{data,limited:plan.limited||edge<plan.edge}:null;
    }catch(error){
      if(!isCurrent())return null;
      if((edge<=floor&&(!resources.nearImage||nearEdge<=nearFloor))||attempt===3)throw error;
      edge=Math.max(floor,Math.floor(edge/2));
      nearEdge=Math.max(nearFloor,Math.floor(nearEdge/2));
    }
  }
}
