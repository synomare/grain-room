// All spatial controls use a 1000px long-edge coordinate system.
// Export and preview therefore preserve the apparent size of the texture.
const clamp = (v,a=0,b=255) => Math.min(b,Math.max(a,v));
const hash = (x,y,s=7) => {
  let n=Math.imul(x+1,374761393)^Math.imul(y+1,668265263)^Math.imul(s,1274126177);
  n=Math.imul(n^(n>>>13),1274126177); return ((n^(n>>>16))>>>0)/4294967295;
};
function luminance(rgba,p,w,h){
  const values=new Float32Array(w*h), scale=Math.max(w,h)/1000;
  for(let i=0;i<values.length;i++){
    const a=rgba[i*4+3]/255;
    let v=(.2126*rgba[i*4]+.7152*rgba[i*4+1]+.0722*rgba[i*4+2])*a+255*(1-a);
    v=(v-127.5)*(p.contrast/100)+127.5+p.brightness*2.55;
    if(p.grain) v+=(hash(Math.floor(i%w/scale),Math.floor(Math.floor(i/w)/scale))-0.5)*p.grain*2;
    values[i]=clamp(v);
  } return values;
}
function bilinear(a,w,h,x,y){
  x=clamp(x,0,w-1); y=clamp(y,0,h-1);
  const x0=Math.floor(x), y0=Math.floor(y), x1=Math.min(w-1,x0+1), y1=Math.min(h-1,y0+1), fx=x-x0, fy=y-y0;
  return a[y0*w+x0]*(1-fx)*(1-fy)+a[y0*w+x1]*fx*(1-fy)+a[y1*w+x0]*(1-fx)*fy+a[y1*w+x1]*fx*fy;
}
function dither(a,w,h,p,scale){
  const cell=Math.max(1,p.size*scale), sw=Math.max(1,Math.ceil(w/cell)), sh=Math.max(1,Math.ceil(h/cell));
  const grid=new Float32Array(sw*sh), bits=new Uint8Array(sw*sh);
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++) grid[y*sw+x]=bilinear(a,w,h,(x+.5)*cell,(y+.5)*cell);
  const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
  const add=(x,y,e)=>{if(x>=0&&x<sw&&y>=0&&y<sh) grid[y*sw+x]+=e;};
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){
    const i=y*sw+x, old=grid[i], value=old>(p.mode==='bayer'?(bayer[(y%4)*4+x%4]+.5)*16:127.5)?255:0;
    bits[i]=value; const e=old-value;
    if(p.mode==='bayer')continue;
    if(p.mode==='floyd'){add(x+1,y,e*7/16);add(x-1,y+1,e*3/16);add(x,y+1,e*5/16);add(x+1,y+1,e/16);}
    else {add(x+1,y,e/8);add(x+2,y,e/8);add(x-1,y+1,e/8);add(x,y+1,e/8);add(x+1,y+1,e/8);add(x,y+2,e/8);}
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)a[y*w+x]=bits[Math.min(sh-1,Math.floor(y/cell))*sw+Math.min(sw-1,Math.floor(x/cell))];
  return a;
}
export function applyFilter(rgba,w,h,{id,params:p}){
  const a=luminance(rgba,p,w,h), scale=Math.max(w,h)/1000;
  let out=a;
  if(id==='halftone'){
    out=new Float32Array(w*h); const cell=p.size*scale, t=p.angle*Math.PI/180,c=Math.cos(t),s=Math.sin(t);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const u=x*c+y*s,v=-x*s+y*c, cx=(Math.floor(u/cell)+.5)*cell, cy=(Math.floor(v/cell)+.5)*cell;
      const ink=1-bilinear(a,w,h,cx*c-cy*s,cx*s+cy*c)/255;
      // Circular dark dots turn into white holes in the deep shadows.
      const dx=u-cx,dy=v-cy;
      let coverage;
      if(ink<=.5){const r=Math.sqrt(ink/Math.PI)*cell;coverage=clamp(r-Math.hypot(dx,dy)+.5,0,1);}
      else {const r=Math.sqrt((1-ink)/Math.PI)*cell;coverage=1-clamp(r-Math.hypot(cell/2-Math.abs(dx),cell/2-Math.abs(dy))+.5,0,1);}
      out[y*w+x]=255*(1-coverage);
    }
  }else if(id==='dither')out=dither(a,w,h,p,scale);
  else if(id==='xerox'){
    out=new Float32Array(w*h);const d=p.bleed*scale;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      let v=a[y*w+x];
      if(d>0)v=Math.min(v,bilinear(a,w,h,x+d,y),bilinear(a,w,h,x,y+d));
      const nx=Math.floor(x/scale),ny=Math.floor(y/scale), n=hash(nx,ny,21);
      const gate=p.threshold+(n-.5)*p.grain*3;
      const paper=248-hash(nx,ny,33)*Math.min(24,p.grain);
      out[y*w+x]=v<gate?(n>.985&&p.grain>0?paper:8+hash(nx,ny,11)*18):paper;
    }
  }else if(id==='contour'){
    out=new Float32Array(w*h);const d=p.width*scale;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const gx=bilinear(a,w,h,x+d,y)-bilinear(a,w,h,x-d,y),gy=bilinear(a,w,h,x,y+d)-bilinear(a,w,h,x,y-d);
      out[y*w+x]=255-clamp(Math.hypot(gx,gy)*p.strength/100);
    }
  }else if(id==='wave'){
    out=new Float32Array(w*h);const phase=p.phase*Math.PI/180;
    for(let y=0;y<h;y++){
      const offset=Math.sin(y/h*Math.PI*2*p.frequency+phase)*p.amplitude*scale;
      for(let x=0;x<w;x++)out[y*w+x]=bilinear(a,w,h,x+offset,y);
    }
  }
  const result=new Uint8ClampedArray(w*h*4);
  for(let i=0;i<out.length;i++){const v=p.invert?255-out[i]:out[i];result[i*4]=v;result[i*4+1]=v;result[i*4+2]=v;result[i*4+3]=255;}
  return result;
}
export function renderPipeline(rgba,w,h,layers){let result=rgba;for(const layer of layers)result=applyFilter(result,w,h,layer);return result;}
