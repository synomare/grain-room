import {quilt} from './reconstruction-quilt.js';
import {elastic} from './reconstruction-elastic.js';
import {massbloom} from './reconstruction-mass.js';
export function reconstructionTransform(a,w,h,id,p){return ({quilt,elastic,massbloom})[id](a,w,h,p);}
