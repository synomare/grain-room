import {defineConfig,loadEnv} from 'vite';
import {createReadStream,existsSync} from 'node:fs';

// Local-only font route. The provided commercial font is neither copied into
// public/ nor included in the build. Zen is bundled with its OFL license.
function localFonts(replica){
  function serve(server){
    server.middlewares.use((req,res,next)=>{
      if(req.url?.split('?')[0]!=='/local-fonts/replica')return next();
      if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;res.end();return;}
      if(!replica||!existsSync(replica)){res.statusCode=404;res.end();return;}
      res.setHeader('Content-Type','font/otf');res.setHeader('Cache-Control','private, max-age=3600');
      if(req.method==='HEAD'){res.end();return;}
      const stream=createReadStream(replica);stream.on('error',()=>{res.statusCode=500;res.end();});stream.pipe(res);
    });
  }
  return {name:'grain-local-fonts',apply:'serve',configureServer:serve,transformIndexHtml:{order:'post',handler:()=>replica?[{tag:'style',children:"@font-face{font-family:Replica;src:url('/local-fonts/replica') format('opentype');font-weight:300;font-display:swap}",injectTo:'head'}]:[]}};
}
export default defineConfig(({command,mode,isPreview})=>{
 const env=loadEnv(mode,process.cwd(),'GRAIN_');
 return {base:command==='build'||isPreview?'/grain-room/':'/',plugins:[localFonts(process.env.GRAIN_REPLICA_FONT||env.GRAIN_REPLICA_FONT)]};
});
