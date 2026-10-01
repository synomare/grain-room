import {grid,at,tensor,expand,blur} from './research-math.js';
import {hash,clamp} from './pixels.js';

export function ribbons(a,w,h,p){
 const g=grid(a,w,h,1000),W=g.w,H=g.h,field=grid(a,w,h,240),t=tensor({...field,l:blur(field.l,field.w,field.h,2)},3),fw=field.w,fh=field.h,unit=Math.max(W,H)/1000,spacing=Math.max(2,p.spacing*unit),width=spacing*p.width/100;
 // Double-angle interpolation respects the sign ambiguity of a line field.
 const cc=Float32Array.from(t.angle,v=>Math.cos(2*v)),ss=Float32Array.from(t.angle,v=>Math.sin(2*v)),out=g.rgb.map(v=>Float32Array.from(v,x=>x*.07+p.paper/100*.88));
 const ow=Math.ceil(W/spacing),oh=Math.ceil(H/spacing),occupied=new Uint8Array(ow*oh),occupiedAt=(x,y)=>occupied[clamp(Math.floor(y/spacing),0,oh-1)*ow+clamp(Math.floor(x/spacing),0,ow-1)];
 function vector(x,y,previous){const fx=x/W*fw,fy=y/H*fh,angle=.5*Math.atan2(at(ss,fw,fh,fx,fy),at(cc,fw,fh,fx,fy)),follow=p.follow/100,v=[Math.cos(angle)*follow+(1-follow),Math.sin(angle)*follow];const norm=Math.hypot(...v)||1;v[0]/=norm;v[1]/=norm;if(previous&&v[0]*previous[0]+v[1]*previous[1]<0){v[0]*=-1;v[1]*=-1;}return v;}
 function segment(a,b,half,shade){
  const dx=b[0]-a[0],dy=b[1]-a[1],len2=dx*dx+dy*dy;
  for(let y=Math.max(0,Math.floor(Math.min(a[1],b[1])-half-1));y<=Math.min(H-1,Math.ceil(Math.max(a[1],b[1])+half+1));y++)for(let x=Math.max(0,Math.floor(Math.min(a[0],b[0])-half-1));x<=Math.min(W-1,Math.ceil(Math.max(a[0],b[0])+half+1));x++){
   const q=clamp(((x-a[0])*dx+(y-a[1])*dy)/(len2||1),0,1),sx=a[0]+q*dx,sy=a[1]+q*dy,d=Math.hypot(x-sx,y-sy),coverage=clamp(half+.6-d,0,1);if(!coverage)continue;
   const normal=(dx*(y-sy)-dy*(x-sx))/(Math.sqrt(len2)||1)/Math.max(.1,half),bulge=Math.sqrt(Math.max(0,1-normal*normal)),light=.38+.67*bulge+normal*.16,spec=Math.pow(Math.max(0,bulge*.86-normal*.25),16)*.27,i=y*W+x;
   for(let c=0;c<3;c++){const color=at(g.rgb[c],W,H,sx,sy)*light*shade+spec;out[c][i]=out[c][i]*(1-coverage)+coverage*color;}
  }
 }
 const seeds=[];for(let y=0;y<oh;y++)for(let x=0;x<ow;x++)seeds.push({x:(x+hash(x,y,p.seed)*.8)*spacing,y:(y+hash(x,y,p.seed+1)*.8)*spacing,order:hash(x,y,p.seed+2)});seeds.sort((a,b)=>a.order-b.order);
 for(const seed of seeds){if(occupiedAt(seed.x,seed.y))continue;const l=at(g.l,W,H,seed.x,seed.y);if(l<.035)continue;const fx=seed.x/W*fw,fy=seed.y/H*fh,edge=Math.hypot(at(field.l,fw,fh,fx+2,fy)-at(field.l,fw,fh,fx-2,fy),at(field.l,fw,fh,fx,fy+2)-at(field.l,fw,fh,fx,fy-2));if(edge<.012&&seed.order>.08)continue;const paths=[];
  for(const sign of [-1,1]){let pos=[seed.x,seed.y],v=vector(...pos);v=v.map(x=>x*sign);const path=[pos],steps=Math.round(p.length*unit/3);
   for(let k=0;k<steps;k++){const mid=[pos[0]+v[0]*1.5,pos[1]+v[1]*1.5],nextV=vector(...mid,v),next=[pos[0]+nextV[0]*3,pos[1]+nextV[1]*3];if(next[0]<0||next[1]<0||next[0]>=W||next[1]>=H||occupiedAt(...next))break;if(k>12&&Math.hypot(next[0]-seed.x,next[1]-seed.y)<spacing*.6)break;path.push(next);pos=next;v=nextV;}paths.push(path);
  }
  const path=[...paths[0].reverse(),...paths[1].slice(1)];if(path.length<Math.max(3,Math.round(10*unit)))continue;
  for(let k=1;k<path.length;k++){const taper=Math.min(1,k/4,(path.length-k)/4),half=width*.5*(.5+Math.sqrt(l))*(.25+.75*taper);segment(path[k-1],path[k],half,.86+seed.order*.25);}
  for(const [x,y] of path)occupied[clamp(Math.floor(y/spacing),0,oh-1)*ow+clamp(Math.floor(x/spacing),0,ow-1)]=1;
 }
 return expand(out,W,H,w,h);
}
