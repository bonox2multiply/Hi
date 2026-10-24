import http from 'node:http';
import worker from '../../dist/server/index.js';
// Serve the actual build. Browser fixtures handle APIs; never call a live provider here.
http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/')){res.writeHead(503).end('{}');return;}
  try{
    const response=await worker.fetch(new Request(new URL(req.url,'http://127.0.0.1:4177'),{method:req.method}));
    res.writeHead(response.status,Object.fromEntries(response.headers));
    if(req.url==='/sw.js?test-previous=1'){
      // Test-only previous cache identity; the production worker is unchanged.
      const source=await response.text();
      res.end(source.replace(/kia-diamond-shell-v\d+/, 'kia-diamond-shell-test-previous'));
    }else res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500).end('Local test server error');}
}).listen(4177,'127.0.0.1');
