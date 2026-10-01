export function createRenderer({latestOnly=false}={}){
 let seq=0,worker=null,disposed=false;const jobs=new Map();
 function start(){
  worker=new Worker(new URL('./render.worker.js',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>{const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);clearTimeout(job.timer);data.error?job.reject(new Error(data.error)):job.resolve(new ImageData(new Uint8ClampedArray(data.pixels),data.width,data.height));};
  worker.onerror=()=>cancel('画像処理を開始できませんでした。ページを再読み込みしてください。');
 }
 function cancel(message){
  worker?.terminate();worker=null;for(const job of jobs.values()){clearTimeout(job.timer);job.reject(new Error(message));}jobs.clear();
 }
 return {
  render(image,layers,maxEdge){
   if(disposed)return Promise.reject(new Error('処理を終了しました'));
   if(latestOnly&&jobs.size)cancel('新しい設定で処理します');
   if(!worker)start();
   const scale=Math.min(1,maxEdge/Math.max(image.width,image.height));
   const width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
   const rgba=ctx.getImageData(0,0,width,height).data.buffer;
   return new Promise((resolve,reject)=>{
    const id=++seq,timer=setTimeout(()=>cancel('処理に時間がかかっています。加工の数か書き出しサイズを減らしてください。'),120000);
    jobs.set(id,{resolve,reject,timer});worker.postMessage({id,rgba,width,height,layers},[rgba]);
   });
  },
  dispose(){disposed=true;cancel('処理を終了しました');}
 };
}
export function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('画像を開けませんでした。JPEG・PNG・WebPをお試しください。'));image.src=url;});}
export function putImage(canvas,data){canvas.width=data.width;canvas.height=data.height;canvas.getContext('2d').putImageData(data,0,0);}
