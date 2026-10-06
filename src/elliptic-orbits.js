import {clamp,sample} from './pixels.js';

export const ellipticOrbitDefaults={vertices:29,turns:8,aspect:65,families:3,phase:13,rotation:0,scale:95,centerX:50,centerY:50,width:4,surface:0,mode:0,paper:97,keep:0,ink:100};
const tau=2*Math.PI;
const gcd=(a,b)=>b?gcd(b,a%b):a;

// Choose the positively oriented tangent to the inner confocal ellipse,
// then intersect its continuation with the outer ellipse.
export function nextEllipticPoint(x,y,a,b,lambda){
 const ia=Math.sqrt(a*a-lambda),ib=Math.sqrt(b*b-lambda),u=x/ia,v=y/ib,d=u*u+v*v,k=Math.sqrt(Math.max(0,d-1));
 const qx=ia*(u-v*k)/d,qy=ib*(v+u*k)/d,dx=qx-x,dy=qy-y,t=-2*(x*dx/(a*a)+y*dy/(b*b))/(dx*dx/(a*a)+dy*dy/(b*b));
 return {x:x+t*dx,y:y+t*dy,qx,qy};
}
export function ellipticOrbit(a,b,lambda,N,phase=0){
 let x=a*Math.cos(phase),y=b*Math.sin(phase),advance=0;const points=[{x,y}];
 for(let k=0;k<N;k++){
  const q=nextEllipticPoint(x,y,a,b,lambda),delta=Math.atan2(x/a*q.y/b-y/b*q.x/a,x/a*q.x/a+y/b*q.y/b);advance+=delta>0?delta:delta+tau;points.push(q);x=q.x;y=q.y;
 }
 return {points,advance,error:Math.hypot(x-points[0].x,y-points[0].y)};
}
export function closedCaustic(a,b,N,turns){
 let low=b*b*1e-12,high=b*b*(1-1e-12);const target=tau*turns;
 if(ellipticOrbit(a,b,high,N).advance<target)throw Error('楕円の回路を閉じる条件を見つけられませんでした。');
 for(let k=0;k<70;k++){const mid=(low+high)/2;if(ellipticOrbit(a,b,mid,N).advance<target)low=mid;else high=mid;}
 return (low+high)/2;
}
export function ellipticScene(w,h,p){
 const a=1,b=p.aspect/100,lambda=closedCaustic(a,b,p.vertices,p.turns),period=p.vertices/gcd(p.vertices,p.turns),theta=(p.rotation+(h>w?90:0))*Math.PI/180,co=Math.cos(theta),si=Math.sin(theta),s=.45*Math.min(w/Math.hypot(co,b*si),h/Math.hypot(si,b*co))*p.scale/100,cx=w*p.centerX/100,cy=h*p.centerY/100,lines=[],orbits=[];
 for(let f=0;f<p.families;f++){
  const path=ellipticOrbit(a,b,lambda,p.vertices,(p.phase+f*360/(period*p.families))*Math.PI/180),points=path.points.map(q=>({x:cx+s*(q.x*co-q.y*si),y:cy+s*(q.x*si+q.y*co)}));orbits.push(path);
  for(let k=0;k<period;k++)lines.push({x0:points[k].x,y0:points[k].y,x1:points[k+1].x,y1:points[k+1].y,f,k});
 }
 return {a,b,lambda,period,lines,orbits,s,cx,cy,co,si};
}
export function orbitCoordinates(x,y,g){
 const X=x-g.cx,Y=y-g.cy;return [(X*g.co+Y*g.si)/g.s,(-X*g.si+Y*g.co)/g.s];
}
export function orbitPhotoCoordinates(x,y,w,h,g){
 const [u,v]=orbitCoordinates(x,y,g),angle=Math.atan2(v/g.b,u),co=Math.cos(angle),si=Math.sin(angle),inner=1/Math.sqrt(co*co/(1-g.lambda)+g.b*g.b*si*si/(g.b*g.b-g.lambda)),r=Math.hypot(u,v/g.b);
 return [((angle/tau+1)%1)*(w-1),clamp((r-inner)/(1-inner),0,1)*(h-1)];
}
function colour(source,i,x,y,w,h,p,g){
 if(p.mode===1){const [sx,sy]=orbitPhotoCoordinates(x,y,w,h,g);return [0,1,2].map(c=>sample(source,w,h,sx,sy,c)*.78);}
 return [0,1,2].map(c=>p.mode===2?255-source[i+c]*.78:source[i+c]*.78);
}
export function orbitBackground(a,p){
 const out=new Uint8ClampedArray(a.length),paper=p.paper*2.55;
 for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++)out[i+c]=paper*(1-p.keep/100)+a[i+c]*p.keep/100;out[i+3]=255;}return out;
}
export function capsuleCoverage(x,y,l,radius){
 const dx=l.x1-l.x0,dy=l.y1-l.y0,L=dx*dx+dy*dy,t=L?clamp(((x-l.x0)*dx+(y-l.y0)*dy)/L,0,1):0,d=Math.hypot(x-l.x0-t*dx,y-l.y0-t*dy);return clamp(radius+.5-d,0,1);
}

// A pixel inside a capsule must lie in its expanded bounding box and its
// infinite parallel strip. Row intersections prune work, never resolution.
export function renderOrbitLines(a,w,h,p,g){
 const out=orbitBackground(a,p),radius=Math.max(w,h)*p.width/2000,R=radius+.5;
 if(!p.width||!p.ink)return out;
 for(const l of g.lines){
  const dx=l.x1-l.x0,dy=l.y1-l.y0,length=Math.hypot(dx,dy),bx0=Math.max(0,Math.ceil(Math.min(l.x0,l.x1)-R-.5)),bx1=Math.min(w-1,Math.floor(Math.max(l.x0,l.x1)+R-.5)),y0=Math.max(0,Math.ceil(Math.min(l.y0,l.y1)-R-.5)),y1=Math.min(h-1,Math.floor(Math.max(l.y0,l.y1)+R-.5));
  for(let y=y0;y<=y1;y++){
   let x0=bx0,x1=bx1;
   if(Math.abs(dy)>1e-12){const mid=l.x0+(y+.5-l.y0)*dx/dy,half=R*length/Math.abs(dy);x0=Math.max(x0,Math.ceil(mid-half-.5));x1=Math.min(x1,Math.floor(mid+half-.5));}
   for(let x=x0;x<=x1;x++){
    const coverage=capsuleCoverage(x+.5,y+.5,l,radius)*p.ink/100;if(!coverage)continue;
    const i=(y*w+x)*4,rgb=colour(a,i,x+.5,y+.5,w,h,p,g);for(let c=0;c<3;c++)out[i+c]+=coverage*(rgb[c]-out[i+c]);
   }
  }
 }
 return out;
}
export function faceCrossings(lines,y){return lines.filter(l=>(l.y0>y)!==(l.y1>y)).map(l=>l.x0+(y-l.y0)*(l.x1-l.x0)/(l.y1-l.y0)).sort((x,y)=>x-y);}

// Four subpixel membership samples per native pixel; scanline intervals share
// the same even-odd rule as direct ray tests. The inner caustic stays open.
export function renderOrbitFaces(a,w,h,p,g){
 const out=orbitBackground(a,p);if(!p.ink)return out;
 const coverage=new Float64Array(w),sum=Array.from({length:3},()=>new Float64Array(w));
 for(let y=0;y<h;y++){
  coverage.fill(0);sum.forEach(c=>c.fill(0));
  for(const oy of [.25,.75]){
   const yy=y+oy,hits=faceCrossings(g.lines,yy);
   for(let j=0;j+1<hits.length;j+=2)for(let x=Math.max(0,Math.floor(hits[j]));x<=Math.min(w-1,Math.floor(hits[j+1]));x++)for(const ox of [.25,.75]){
    const xx=x+ox;if(xx<hits[j]||xx>=hits[j+1])continue;
    const [u,v]=orbitCoordinates(xx,yy,g);if(u*u/(1-g.lambda)+v*v/(g.b*g.b-g.lambda)<1)continue;
    const i=(y*w+x)*4,rgb=colour(a,i,xx,yy,w,h,p,g);coverage[x]+=.25;for(let c=0;c<3;c++)sum[c][x]+=.25*rgb[c];
   }
  }
  for(let x=0;x<w;x++)if(coverage[x]){const i=(y*w+x)*4;for(let c=0;c<3;c++)out[i+c]+=p.ink/100*(sum[c][x]-coverage[x]*out[i+c]);}
 }
 return out;
}
export function ellipticOrbits(a,w,h,p){
 if(!p.ink||!p.width&&p.surface===0)return orbitBackground(a,p);
 const g=ellipticScene(w,h,p);return p.surface===1?renderOrbitFaces(a,w,h,p,g):renderOrbitLines(a,w,h,p,g);
}
