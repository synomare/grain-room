import {splats} from './research-splats.js';
import {kuwahara,lic,xdog} from './research-npr.js';
import {fluid} from './research-fluid.js';
import {physarum,turing} from './research-growth.js';
import {spectral} from './research-spectral.js';
import {thinfilm,caustic} from './research-optics.js';
const kernels={gaussian:splats,billboards:(a,w,h,p)=>splats(a,w,h,p,true),kuwahara,lic,xdog,fluid,physarum,turing,spectral,diffraction:(a,w,h,p)=>spectral(a,w,h,p,true),thinfilm,caustic};
export function researchTransform(a,w,h,id,p){if(!kernels[id])throw new Error('Unknown research operator');return kernels[id](a,w,h,p);}
