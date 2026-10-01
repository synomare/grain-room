import {fault} from './structure-voronoi.js';
import {gradientcast} from './structure-poisson.js';
import {ribbons} from './structure-ribbons.js';
export function structureTransform(a,w,h,id,p){return ({fault,gradientcast,ribbons})[id](a,w,h,p);}
