// Локальная проверка без Vercel: node dev.js → http://localhost:8787
import http from 'node:http';
import room from './api/room.js';
import latest from './api/latest.js';
http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/api/room') return room(req, res);
  if (p === '/api/latest') return latest(req, res);
  res.statusCode = 404; res.end('not found');
}).listen(process.env.PORT || 8787, () => console.log('dev server on', process.env.PORT || 8787));
