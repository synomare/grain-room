import {clamp,hash,sample} from './pixels.js';
import {quadraticThread,drawThread,clothShade,threadPalette} from './embroidery-yarn.js';
export const embroideryDefaults={size:100,density:100,width:2.1,relief:90,dye:96,tint:1,fill:80,cloth:60,open:24,loose:75,photo:90,light:315,seed:17};
const TAU=Math.PI*2;
export function embroideryColour(a,w,h,x,y,p,dye=p.dye){
 return threadPalette[p.tint].map((v,c)=>v+(sample(a,w,h,x,y,c)-v)*dye/100);
}
// The field stores only stitch ownership. Yarn colours always come from native source coordinates.
export function regions(a,w,h,p){
 const scale=Math.max(w,h)/1000,W=w/scale,H=h/scale,step=Math.max(1.8,1/scale),gw=Math.ceil(W/step),gh=Math.ceil(H/step),n=gw*gh,spacing=Math.max(p.size*.42,2/scale);
 const rgb=new Float32Array(n*3),labels=new Int32Array(n).fill(-1),distance=new Float32Array(n),sites=[];
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++)for(let c=0;c<3;c++)rgb[(y*gw+x)*3+c]=sample(a,w,h,(x+.5)*step*scale-.5,(y+.5)*step*scale-.5,c);
 for(let y=0;y<Math.ceil(H/spacing);y++)for(let x=0;x<Math.ceil(W/spacing);x++){
  const X=(x+.35+.3*hash(x,y,p.seed))*spacing,Y=(y+.35+.3*hash(x,y,p.seed+1))*spacing;
  sites.push({x:X,y:Y,c:[0,1,2].map(c=>sample(a,w,h,X*scale-.5,Y*scale-.5,c))});
 }
 for(let iter=0;iter<4;iter++){
  distance.fill(Infinity);
  for(let id=0;id<sites.length;id++){
   const s=sites[id],r=spacing*2.4;
   for(let y=Math.max(0,Math.floor((s.y-r)/step));y<Math.min(gh,Math.ceil((s.y+r)/step));y++)for(let x=Math.max(0,Math.floor((s.x-r)/step));x<Math.min(gw,Math.ceil((s.x+r)/step));x++){
    const i=y*gw+x,dx=(x+.5)*step-s.x,dy=(y+.5)*step-s.y,j=i*3;
    const d=(dx*dx+dy*dy)/(spacing*spacing)+((rgb[j]-s.c[0])**2+(rgb[j+1]-s.c[1])**2+(rgb[j+2]-s.c[2])**2)/1800;
    if(d<distance[i]){distance[i]=d;labels[i]=id;}
   }
  }
  const sums=sites.map(()=>[0,0,0,0,0,0]);
  for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){const i=y*gw+x,s=sums[labels[i]];if(!s)continue;s[0]+=(x+.5)*step;s[1]+=(y+.5)*step;s[2]+=rgb[i*3];s[3]+=rgb[i*3+1];s[4]+=rgb[i*3+2];s[5]++;}
  for(let id=0;id<sites.length;id++){const s=sums[id];if(s[5])sites[id]={x:s[0]/s[5],y:s[1]/s[5],c:[s[2]/s[5],s[3]/s[5],s[4]/s[5]]};}
 }
 const at=(x,y)=>x<0||y<0||x>=W||y>=H?-1:labels[Math.min(gh-1,Math.floor(y/step))*gw+Math.min(gw-1,Math.floor(x/step))];
 for(let id=0;id<sites.length;id++){
  const s=sites[id];let xx=0,xy=0,yy=0;
  for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++)for(let c=0;c<3;c++){
   const X=(s.x+ox*spacing*.17)*scale-.5,Y=(s.y+oy*spacing*.17)*scale-.5,d=3*scale;
   const gx=sample(a,w,h,X+d,Y,c)-sample(a,w,h,X-d,Y,c),gy=sample(a,w,h,X,Y+d,c)-sample(a,w,h,X,Y-d,c);xx+=gx*gx;xy+=gx*gy;yy+=gy*gy;
  }
  s.energy=Math.sqrt(xx+yy)/15;
  const coherence=Math.hypot(xx-yy,2*xy)/(xx+yy+1);
  s.angle=s.energy>7&&coherence>.15?.5*Math.atan2(2*xy,xx-yy)+Math.PI*.5:Math.PI*.15;
  s.angle+=(hash(id,11,p.seed)-.5)*.16;
  s.co=Math.cos(s.angle);s.si=Math.sin(s.angle);s.minU=Infinity;s.maxU=-Infinity;s.minV=Infinity;s.maxV=-Infinity;
 }
 for(let y=0;y<gh;y++)for(let x=0;x<gw;x++){const s=sites[labels[y*gw+x]];if(!s)continue;const dx=(x+.5)*step-s.x,dy=(y+.5)*step-s.y,U=dx*s.co+dy*s.si,V=-dx*s.si+dy*s.co;s.minU=Math.min(s.minU,U-step);s.maxU=Math.max(s.maxU,U+step);s.minV=Math.min(s.minV,V-step);s.maxV=Math.max(s.maxV,V+step);}
 return {scale,W,H,step,gw,gh,labels,sites,at};
}
export function rip(a,w,h,f,p){
 const {W,H,scale}=f,step=5,nx=Math.max(2,Math.ceil(W/step)),ny=Math.max(2,Math.ceil(H/step)),prev=new Int16Array(nx*ny),cost=new Float32Array(nx*ny),path=new Float32Array(ny);
 const center=.42+.16*hash(17,1,p.seed);
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  const X=(x+.5)*step*scale,Y=(y+.5)*step*scale;let edge=0;
  for(let c=0;c<3;c++)edge+=(sample(a,w,h,X+4*scale,Y,c)-sample(a,w,h,X-4*scale,Y,c))**2;
  const position=x/nx,weight=1.8*(position-center)**2-Math.min(1,Math.sqrt(edge)/170)*.22;
  let best=Infinity,bx=x;
  for(let dx=-2;dx<=2;dx++){const xx=x+dx;if(xx<0||xx>=nx)continue;const v=(y?cost[(y-1)*nx+xx]:0)+Math.abs(dx)*.035;if(v<best){best=v;bx=xx;}}
  cost[y*nx+x]=best+weight;prev[y*nx+x]=bx;
 }
 let end=0;for(let x=1;x<nx;x++)if(cost[(ny-1)*nx+x]<cost[(ny-1)*nx+end])end=x;
 for(let y=ny-1;y>=0;y--){path[y]=(end+.5)*step;end=prev[y*nx+end];}
 const smooth=path.map((v,y)=>{let sum=0,n=0;for(let j=-3;j<=3;j++){sum+=path[clamp(y+j,0,ny-1)];n++;}return sum/n;});
 const at=y=>{const t=clamp(y/step-.5,0,ny-1),iy=Math.floor(t);return smooth[iy]*(1-(t-iy))+smooth[Math.min(ny-1,iy+1)]*(t-iy);};
 const width=y=>p.open*.85*Math.sin(Math.PI*clamp(y/H,0,1))**1.2*(1+.28*Math.sin(y/83)+.14*Math.sin(y/27));
 const forward=(x,y)=>{const d=x-at(y);return [x+Math.sign(d||1)*width(y)*Math.exp(-Math.abs(d)/140),y];};
 const inverse=(x,y)=>{const d=x-at(y),r=width(y);if(Math.abs(d)<r)return null;let v=Math.abs(d)-r;for(let i=0;i<6;i++){const e=r*Math.exp(-v/140);v=Math.max(0,v-(v+e-Math.abs(d))/(1-e/140));}return [at(y)+Math.sign(d)*v,y];};
 return {at,width,forward,inverse};
}
export function embroideryScene(a,w,h,params={}){
 const p={...embroideryDefaults,...params},f=regions(a,w,h,p),threads=[],anchors=[];const {scale,W,H}=f;f.rip=rip(a,w,h,f,p);
 const pick=(x,y,dye=p.dye)=>embroideryColour(a,w,h,x*scale-.5,y*scale-.5,p,dye);
 for(let id=0;id<f.sites.length;id++){
  const s=f.sites[id],lum=s.c[0]*.21+s.c[1]*.72+s.c[2]*.07,chroma=Math.max(...s.c)-Math.min(...s.c);
  const coverage=.5+.25*Math.sin(s.x/81+Math.sin(s.y/137)+p.seed)+.25*Math.cos(s.y/113+s.x/239);
  s.active=coverage<=p.density/100 && (lum+chroma*.65+s.energy*2>p.open*2.2);
  s.stitched=coverage<=p.fill/100&&(s.energy>7||chroma>35||lum>165);
  if(!s.active||!s.stitched)continue;
  const pitch=p.width*1.05,rows=Math.ceil((s.maxV-s.minV)/pitch),point=(u,v)=>[s.x+u*s.co-v*s.si,s.y+u*s.si+v*s.co];
  for(let row=0;row<rows;row++){
   const v=s.minV+(row+.5)*pitch+(hash(id,row,p.seed)-.5)*pitch*.15;let run=null;
   for(let u=s.minU;u<=s.maxU+2;u+=1.4){
    const [x,y]=point(u,v),inside=f.at(x,y)===id;
    if(inside&&run===null)run=u;
    if(!inside&&run!==null){
     let start=run+.3,end=u-.8;run=null;if(end-start<2)continue;
     while(start<end-1){const len=Math.min(end-start,(13+hash(id,row+Math.round(start),p.seed+2)*25)*p.size/90),A=point(start,v),B=point(start+len-.35,v),C=point(start+len*.5,v),phase=hash(id,row,p.seed+3)*TAU,colour=pick(...C).map(c=>c*(.96+.08*hash(id,row,p.seed+5)));
      const native=pick(...C,100),luma=native[0]*.21+native[1]*.72+native[2]*.07,chroma=Math.max(...native)-Math.min(...native);let energy=0;
      if(chroma<35&&luma<165)for(let c=0;c<3;c++){const X=C[0]*scale-.5,Y=C[1]*scale-.5,d=3*scale;energy+=(sample(a,w,h,X+d,Y,c)-sample(a,w,h,X-d,Y,c))**2+(sample(a,w,h,X,Y+d,c)-sample(a,w,h,X,Y-d,c))**2;}
      const supported=chroma>=35||luma>=165||Math.sqrt(energy)/3>7,da=A[0]-f.rip.at(A[1]),db=B[0]-f.rip.at(B[1]);
      if(supported&&da*db>=0){threads.push({q:quadraticThread(...f.rip.forward(...A),...f.rip.forward(...B),(hash(id,row,p.seed+8)-.5)*p.width*.6),width:p.width*(.84+.2*hash(id,row,p.seed+6)),colour,phase,source:C,kind:'satin'});
       if(start+len>=end-1)anchors.push({A:B,dir:[s.co,s.si],colour,id,row});}
      start+=len;
     }
    }
   }
  }
 }
 if(p.loose)for(let i=0;i<anchors.length;i++){
  const t=anchors[i],s=f.sites[t.id],A=t.A;
  // Only yarn ends adjacent to an unstitched region can unravel.
  const other=f.at(A[0]+t.dir[0]*6,A[1]+t.dir[1]*6);
  if(other>=0&&f.sites[other].active)continue;
  if(hash(t.id,t.row,p.seed+21)>p.loose/100*.16)continue;
  const len=(18+hash(t.id,t.row,p.seed+22)*95)*p.loose/100;
  const B=[A[0]+t.dir[0]*len,A[1]+t.dir[1]*len+len*.42];
  threads.push({q:quadraticThread(...f.rip.forward(...A),...f.rip.forward(...B),len*(hash(t.id,t.row,p.seed+23)-.5)*.55),width:p.width*.46,colour:t.colour,phase:i,kind:'loose'});
 }
 if(p.open&&p.loose)for(let y=8,i=0;y<H-8;y+=2.9,i++){
  const x=f.rip.at(y),r=f.rip.width(y),id=f.at(x-3,y),s=f.sites[id],native=pick(x-3,y,100);if(!s?.active||(Math.max(...native)-Math.min(...native)<35&&native[0]*.21+native[1]*.72+native[2]*.07<165))continue;
  const colour=pick(x-3,y),A=[x-r-1,y],yb=clamp(y+(25*Math.sin(y/57)+55*Math.sin(y/113))*(p.loose/100)+(hash(i,66,p.seed)-.5)*16,1,H-1),B=[f.rip.at(yb)+f.rip.width(yb)+1,yb];
  const bunch=.2+.8*(.5+.5*Math.sin(y/29+Math.sin(y/76)))**2;
  if(hash(i,61,p.seed)<p.loose/100*bunch)threads.push({q:quadraticThread(...A,...B,(hash(i,62,p.seed)-.35)*r*.6),width:p.width*.55,colour,phase:i,kind:'bridge'});
  if(hash(i,67,p.seed)<p.loose/100*.35)threads.push({q:quadraticThread(...A,x-r+(hash(i,68,p.seed)-.2)*r*1.4,y+20+hash(i,69,p.seed)*90,r*.7),width:p.width*.44,colour,phase:i,kind:'loose'});
 }
 return {p,f,threads,anchors};
}
export function embroideredPhoto(a,w,h,params={}){
 const s=embroideryScene(a,w,h,params),{p,f}=s,{scale}=f,out=new Uint8ClampedArray(a.length),ivory=[238,235,223];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,X=(x+.5)/scale,Y=(y+.5)/scale,source=f.rip.inverse(X,Y),photo=source?p.photo/100:0;
  const sh=1+(clothShade(x+.5,y+.5,scale)-1)*p.cloth/100;
  for(let c=0;c<3;c++)out[i+c]=(ivory[c]+((source?sample(a,w,h,source[0]*scale-.5,source[1]*scale-.5,c):0)-ivory[c])*photo)*sh;out[i+3]=255;
 }
 for(const t of s.threads)drawThread(out,w,h,t.q,t.width,t.colour,p,scale,t.phase);
 return out;
}
