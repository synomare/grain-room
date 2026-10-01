import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {ENGINE_VERSION} from '../src/recipes.js';
const files=[];
async function scan(dir='dist',prefix=''){
 for(const e of await readdir(dir,{withFileTypes:true})){
  const path=prefix+e.name;
  if(e.isDirectory())await scan(dir+'/'+e.name,path+'/');
  else if(e.name!=='build-info.json'){
   const data=await readFile(dir+'/'+e.name);
   files.push({path,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
  }
 }
}
let commit=process.env.GITHUB_SHA||null;
if(!commit)try{commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{}
await scan();files.sort((a,b)=>a.path.localeCompare(b.path));
const info={app:'grain-room',engine:ENGINE_VERSION,commit,files};
await writeFile('dist/build-info.json',JSON.stringify(info,null,2)+'\n');
console.log(`Build manifest: engine ${ENGINE_VERSION}, ${files.length} files, ${commit||'local'}`);
