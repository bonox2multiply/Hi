import http from 'node:http';
import worker from '../../dist/server/index.js';
// Serve the actual build. Browser fixtures handle APIs; never call a live provider here.
http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/')){res.writeHead(503).end('{}');return;}
  try{
    const response=await worker.fetch(new Request(new URL(req.url,'http://127.0.0.1:4177'),{method:req.method}));
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500).end('Local test server error');}
}).listen(4177,'127.0.0.1');
