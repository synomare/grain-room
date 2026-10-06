import{sample,hash}from'./pixels.js';
import{availableGlyph,glyphCoverage}from'./glyph-contours.js';
export const entangledPhotoDefaults={density:90,shrink:60,distort:85,bands:70,writing:70,records:90,wires:40,frames:30,colour:45,source:15,paper:98,seed:17,ribbonVisible:1};
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)),TAU=Math.PI*2;
export function recordMap(u,v,W,H,p){const q=p.distort/100;return{x:W*(.37+(u-.5)*(.88-p.shrink*.004)+q*(.045*Math.sin(v*13+u*5)+.024*Math.sin(v*37))),y:H*(.035+v*.93+q*.022*Math.sin(u*16+v*7))};}
export function fragmentPlan(a,w,h,p){const W=w/Math.max(w,h)*1000,H=h/Math.max(w,h)*1000,nodes=[];let next=0;
 function split(x,y,rw,rh,depth){const id=next++,C=[];let energy=0;for(let j=0;j<3;j++)for(let i=0;i<3;i++){const c=[0,1,2].map(k=>sample(a,w,h,(x+rw*i/2)*w,(y+rh*j/2)*h,k));C.push(c);if(i||j)energy+=c.reduce((s,v,k)=>s+Math.abs(v-C[0][k]),0)/3;}energy/=8;
  const mid=C[4],chroma=Math.max(...mid)-Math.min(...mid),keep=energy>14||chroma>30;
  if(depth>=2&&keep&&!(depth>2&&Math.sin(y*13+x*7+1)>.65&&hash(id,42,p.seed)>.2)){const pos=recordMap(x+rw/2,y+rh/2,W,H,p),sh=p.shrink/100,dx=(hash(id,1,p.seed)-.5)*rw*W*.8*sh,dy=(hash(id,2,p.seed)-.5)*rh*H*.5;nodes.push({id,x,y,rw,rh,depth,energy,c:mid,X:pos.x+dx,Y:pos.y+dy,ww:rw*W*(.70+hash(id,51,p.seed)*.85),hh:rh*H*(.75+.6*hash(id,4,p.seed)),turn:(hash(id,5,p.seed)-.5)*.22,phase:hash(id,6,p.seed)*TAU});}
  if(depth>=5||depth>=2&&(!keep||hash(id,91,p.seed)>p.density/100+.05))return;
  const rx=.35+.30*hash(id,3,p.seed),ry=.35+.30*hash(id,93,p.seed);split(x,y,rw*rx,rh*ry,depth+1);split(x+rw*rx,y,rw*(1-rx),rh*ry,depth+1);split(x,y+rh*ry,rw*rx,rh*(1-ry),depth+1);split(x+rw*rx,y+rh*ry,rw*(1-rx),rh*(1-ry),depth+1);
 }
 // Several overlapping records use their own subdivisions, while each retains native source coordinates.
 for(let k=0;k<2;k++)split(k*.07,.025,.88,.95,0);
 const anchors=[.29,.70].map(v=>{const candidates=nodes.filter(n=>n.depth===3).sort((a,b)=>(b.energy/(1+Math.abs(b.y-v)*5))-(a.energy/(1+Math.abs(a.y-v)*5)));const n=candidates[0];return n?{x:n.X/W,y:n.Y/H,c:n.c}:{x:.35,y:v,c:[127,127,127]};});
 return {W,H,nodes,anchors};
}
export function line(out,w,h,ax,ay,bx,by,width,c,opacity=1){const dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy,r=Math.max(.16,width*.5),x0=Math.max(0,Math.floor(Math.min(ax,bx)-r-1)),x1=Math.min(w-1,Math.ceil(Math.max(ax,bx)+r+1)),y0=Math.max(0,Math.floor(Math.min(ay,by)-r-1)),y1=Math.min(h-1,Math.ceil(Math.max(ay,by)+r+1));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const t=den?clamp(((x+.5-ax)*dx+(y+.5-ay)*dy)/den):0,d=Math.hypot(x+.5-ax-t*dx,y+.5-ay-t*dy),q=clamp(r+.5-d)*opacity;if(q){const i=(y*w+x)*4;for(let k=0;k<3;k++)out[i+k]+=(c[k]-out[i+k])*q;}}}
function stroke(out,w,h,points,width,c,opacity=1){for(let i=1;i<points.length;i++)line(out,w,h,...points[i-1],...points[i],width,c,opacity);}
function panel(out,a,w,h,n,p,scale,bg){const X=n.X*scale,Y=n.Y*scale,ww=n.ww*scale,hh=n.hh*scale,co=Math.cos(n.turn),si=Math.sin(n.turn),R=Math.hypot(ww,hh)/2,opacity=n.depth<3?.55:.90;
 for(let y=Math.max(0,Math.floor(Y-R));y<=Math.min(h-1,Math.ceil(Y+R));y++)for(let x=Math.max(0,Math.floor(X-R));x<=Math.min(w-1,Math.ceil(X+R));x++){
  const dx=x+.5-X,dy=y+.5-Y,u=(dx*co+dy*si)/ww+.5,v=(-dx*si+dy*co)/hh+.5;if(u<0||u>1||v<0||v>1)continue;
  const ripple=u*11+v*5+2*Math.sin(v*8+n.phase),bend=p.distort/100*.15*Math.sin(ripple),U=n.x+(u+bend)*n.rw,V=n.y+(v+p.distort/100*.07*Math.sin(u*10+v*4+n.phase))*n.rh,zoom=n.depth>=4?(.25+hash(n.id,19,p.seed)*.6):1,su=zoom<1?n.x+(u-.5)*n.rw/zoom+n.rw*.5:U,sv=zoom<1?n.y+(v-.5)*n.rh/zoom+n.rh*.5:V,C=[0,1,2].map(c=>sample(a,w,h,su*w-.5,sv*h-.5,c)),l=C[0]*.2126+C[1]*.7152+C[2]*.0722,dist=Math.sqrt(C.reduce((s,c,k)=>s+(c-bg[k])**2,0)),coverage=clamp((dist-34)/65),j=(y*w+x)*4;
  const edge=hash(n.id,85,p.seed)>.22?clamp((1-((u-.5)*1.8)**2-((v-.5)*1.8)**2+Math.sin(ripple)*.12)*8):1;
  const nx=Math.sin(ripple),ny=Math.cos(v*8+n.phase)*.65,nz=.7,light=Math.max(0,(-nx*.45-ny*.3+nz*.84)/Math.hypot(nx,ny,nz)),shade=.65+light*.48,spec=Math.max(0,light-.68)**2*270;
  for(let c=0;c<3;c++){const grey=.57*l+100,material=(hash(n.id,92,p.seed)>.28?1:.25)*p.distort/100,target=(C[c]*(p.colour/100)+grey*(1-p.colour/100))*(1+(shade-1)*material)+spec*material;out[j+c]+=(target-out[j+c])*opacity*coverage*edge;}

 }
}

function recordPlates(out,a,w,h,nodes,p,scale,paper){
 if(!p.records)return;const chosen=[];
 for(const n of nodes.filter(n=>n.depth===2||n.depth===3).sort((a,b)=>b.energy*(.5+hash(b.id,102,p.seed))-a.energy*(.5+hash(a.id,102,p.seed)))){if(chosen.some(q=>Math.hypot(q.X-n.X,q.Y-n.Y)<140))continue;chosen.push(n);if(chosen.length>=Math.round(1+p.records/22))break;}
 const glyphs=Array.from('0123456789abcdef',c=>availableGlyph(c));
 for(const n of chosen){const ww=Math.max(24,n.ww*.65),hh=Math.max(70,n.hh*1.65),x0=n.X-ww/2,y0=n.Y-hh*.25,cw=2.45,ch=4.6,columns=Math.max(1,Math.floor(ww/cw)),rows=Math.max(1,Math.floor(hh/ch)),ids=Array.from({length:rows*columns},(_,i)=>{const v=sample(a,w,h,(n.x+(i%columns)/columns*n.rw)*w,(n.y+Math.floor(i/columns)/rows*n.rh)*h,i%3);return Math.floor(v/16);});
  for(let y=Math.max(0,Math.floor(y0*scale));y<Math.min(h,(y0+hh)*scale);y++)for(let x=Math.max(0,Math.floor(x0*scale));x<Math.min(w,(x0+ww)*scale);x++){const u=(x+.5)/scale-x0,v=(y+.5)/scale-y0,col=Math.floor(u/cw),row=Math.floor(v/ch);if(col<0||col>=columns||row<0||row>=rows)continue;if(col>columns*(.60+.4*hash(Math.floor(row/11),n.id,p.seed))||hash(col,Math.floor(row/7),p.seed+n.id)<.15)continue;const glyph=glyphs[ids[row*columns+col]],cov=glyphCoverage(glyph,u/cw-col,v/ch-row,105,24/(cw*scale)),j=(y*w+x)*4,alpha=p.records/100;for(let c=0;c<3;c++){const ground=paper[c]*.88+out[j+c]*.12,target=ground+(70-ground)*cov;out[j+c]+=(target-out[j+c])*alpha;}}
 }
}

export function bandPoint(t,j,W,H,p){
 const anchor=p.anchors?.[j],key=(anchor?.c?.[j]??128)/255,points=j===0?[[.35,.26],[.40,.40],[.61,.34],[.78,.20+key*.13],[.93,.13],[1.05,.29+key*.2]]:[[.26,.65],[.40,.80],[.62,.66],[.88,.48+key*.14],[.94,.86],[.48,.97]],anchors=points.map((q,i)=>[q[0]+(hash(i,j+123,p.seed)-.5)*.12,q[1]+(hash(i,j+124,p.seed)-.5)*.14]),q=clamp(t)*(anchors.length-1),k=Math.min(anchors.length-2,Math.floor(q)),f=q-k,A=anchors[Math.max(0,k-1)],B=anchors[k],C=anchors[k+1],D=anchors[Math.min(anchors.length-1,k+2)],cat=(a,b,c,d)=>.5*(2*b+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f);
 return{x:W*(cat(A[0],B[0],C[0],D[0])+(anchor?anchor.x-anchors[0][0]:0)*(1-t)**2),y:H*(cat(A[1],B[1],C[1],D[1])+(anchor?anchor.y-anchors[0][1]:0)*(1-t)**2)*p.bands/100+H*(anchors[0][1]*(1-t)+anchors.at(-1)[1]*t)*(1-p.bands/100)};
}
function ribbonRecords(out,a,w,h,j,W,H,p,scale){
 const glyphs=Array.from('0123456789abcdef',c=>availableGlyph(c)),rows=Math.round(2+p.writing/15),count=190;
 for(let row=0;row<rows;row++)for(let i=0;i<count;i++){
  if(hash(i,row,p.seed+44)<.045)continue;
  const t=(i+.5)/count,q=bandPoint(t,j,W,H,p),A=bandPoint(Math.max(0,t-.0007),j,W,H,p),B=bandPoint(Math.min(1,t+.0007),j,W,H,p),dx=B.x-A.x,dy=B.y-A.y,L=Math.hypot(dx,dy)||1,tx=dx/L,ty=dy/L,nx=-ty,ny=tx,value=sample(a,w,h,t*w,(j*.38+row*.018)*h,row%3),glyph=glyphs[Math.floor(value/16)],cw=Math.max(1.8,L/.0014/count*.9),ch=(5+hash(i,row,p.seed)*6)*(.45+p.writing/100),dis=(row-(rows-1)/2)*8*(.7+.3*Math.sin(t*11)**2),X=(q.x+nx*dis)*scale,Y=(q.y+ny*dis)*scale,ww=cw*scale,hh=ch*scale,R=Math.hypot(ww,hh)/2,ink=row===1&&j===1?[244,47,23]:row%3===2?[115,115,109]:[18,20,19];
  for(let y=Math.max(0,Math.floor(Y-R));y<=Math.min(h-1,Math.ceil(Y+R));y++)for(let x=Math.max(0,Math.floor(X-R));x<=Math.min(w-1,Math.ceil(X+R));x++){
   const U=((x+.5-X)*tx+(y+.5-Y)*ty)/ww+.5,V=((x+.5-X)*nx+(y+.5-Y)*ny)/hh+.5;if(U<0||U>1||V<0||V>1)continue;
   const cov=glyphCoverage(glyph,U,V,115,24/Math.max(.2,ww)),halo=glyphCoverage(glyph,U,V,155,24/Math.max(.2,ww)),at=(y*w+x)*4;for(let k=0;k<3;k++){out[at+k]+=(244-out[at+k])*halo*.6;out[at+k]+=(ink[k]-out[at+k])*cov*.94;}
  }
 }
}
export function entangledPhoto(a,w,h,params={}){const p={...entangledPhotoDefaults,...params},scale=Math.max(w,h)/1000,{W,H,nodes,anchors}=fragmentPlan(a,w,h,p),out=new Uint8ClampedArray(a.length),paper=[p.paper*2.55,p.paper*2.54,p.paper*2.48];
 p.anchors=anchors;
 const bg=[0,1,2].map(c=>(sample(a,w,h,0,0,c)+sample(a,w,h,w-1,0,c)+sample(a,w,h,0,h-1,c)+sample(a,w,h,w-1,h-1,c))/4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=(x+.5)/scale,Y=(y+.5)/scale,v=(Y/H-.035)/.93,u=(X/W-.37-p.distort/100*(.045*Math.sin(v*13+2.5)+.024*Math.sin(v*37)))/(.88-p.shrink*.004)+.5,C=[0,1,2].map(c=>sample(a,w,h,u*w-.5,v*h-.5,c)),dist=Math.sqrt(C.reduce((s,c,k)=>s+(c-bg[k])**2,0)),alpha=(u>=0&&u<=1&&v>=0&&v<=1?clamp((dist-34)/95):0)*p.source/100,j=(y*w+x)*4;for(let c=0;c<3;c++)out[j+c]=paper[c]*(1-alpha)+C[c]*alpha;out[j+3]=255;}
 // Records form a nested pile. Their routes and outlines share the same anchors.
 nodes.sort((a,b)=>a.depth-b.depth);for(const n of nodes)panel(out,a,w,h,n,p,scale,bg);
 recordPlates(out,a,w,h,nodes,p,scale,paper);
 const red=[255,59,31],violet=[128,105,242],black=[21,22,23];
 for(const n of nodes)if(n.depth>=3&&hash(n.id,31,p.seed)<p.frames/100*.28){const x=n.X-n.ww/2,y=n.Y-n.hh/2,c=hash(n.id,32,p.seed)<.78?red:violet;stroke(out,w,h,[[x,y],[x+n.ww,y],[x+n.ww,y+n.hh],[x,y+n.hh],[x,y]].map(q=>q.map(v=>v*scale)),(.4+hash(n.id,33,p.seed)*.9)*scale,c,.75);}
 for(let j=0;j<2;j++)if(p.ribbonVisible!==0&&p.bands&&p.writing)ribbonRecords(out,a,w,h,j,W,H,p,scale);
 for(let k=0;k<Math.round(p.wires*.65);k++){const n=nodes[Math.floor(hash(k,71,p.seed)*nodes.length)];if(!n)continue;const start={x:n.X,y:n.Y},j=k%2,end=bandPoint(.3+.67*hash(k,72,p.seed),j,W,H,p),points=[];for(let i=0;i<=90;i++){const t=i/90,dx=end.x-start.x,dy=end.y-start.y,q=Math.sin(t*Math.PI);points.push([(start.x+dx*t+q*(Math.sin(t*11+k)*2+Math.sin(k)*W*.04))*scale,(start.y+dy*t+q*(H*(.10+.08*hash(k,73,p.seed))+Math.sin(t*28+k)*2))*scale]);}stroke(out,w,h,points,(k%7===0?1:.35)*scale,k%9===0?red:black,.7);}
 return out;
}
