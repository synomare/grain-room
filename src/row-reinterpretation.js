export const rowDefaults={delta:-2,layout:0,axis:0,offset:0,reverse:0,amount:100};
// Decode a virtual RGB byte stream. Axis changes the serialization order too.
export function rowStreamRead(source,w,h,k,planar=false,axis=0){
 const count=w*h;k=((k%(count*3))+count*3)%(count*3);
 const j=planar?k%count:Math.floor(k/3),c=planar?Math.floor(k/count):k%3;
 const pixel=axis?(j%h)*w+Math.floor(j/h):j;
 return source[pixel*4+c];
}
export function rowFrameIndex(x,y,width,height,columns,count,offset=0,reverse=false){
 const rows=Math.ceil(count/columns);let q=(Math.floor(y*rows/height)*columns+Math.floor(x*columns/width))%count;
 if(reverse)q=count-1-q;return ((q+offset)%count+count)%count;
}
export function rowReinterpretation(source,w,h,p=rowDefaults){
 if(!p.amount)return source.slice();
 const count=w*h,sw=p.axis?h:w,sh=p.axis?w:h,columns=Math.max(1,sw+p.delta),offset=Math.round(p.offset/100*count),out=new Uint8ClampedArray(source.length);
 for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){
  const q=rowFrameIndex(x,y,sw,sh,columns,count,offset,!!p.reverse),j=p.axis?x*w+y:y*w+x;
  for(let c=0;c<3;c++){
   const k=p.layout===1?c*count+q:q*3+c,value=rowStreamRead(source,w,h,k,p.layout===2,p.axis);
   out[j*4+c]=source[j*4+c]+p.amount/100*(value-source[j*4+c]);
  }out[j*4+3]=255;
 }return out;
}
