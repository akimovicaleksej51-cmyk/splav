// Локальная проверка без Vercel: node dev.js → http://localhost:8787
import http from 'node:http';
import room from './api/room.js';
import latest from './api/latest.js';
import social from './api/social.js';
import health from './api/health.js';
import join from './api/join.js';
const routes = { '/api/room': room, '/api/latest': latest, '/api/social': social, '/api/health': health, '/api/join': join };
http.createServer((req, res) => {
  const h = routes[new URL(req.url, 'http://x').pathname];
  if (h) return h(req, res);
  res.statusCode = 404; res.end('not found');
}).listen(process.env.PORT || 8787, () => console.log('dev server on', process.env.PORT || 8787));
