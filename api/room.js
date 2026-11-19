// «Слушать вместе»: хозяин публикует состояние, гости забирают его опросом
import crypto from 'node:crypto';
import store from '../lib/store.js';

const TTL = 6 * 3600;                 // комната живёт 6 часов после последнего изменения
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code6 = () => Array.from(crypto.randomBytes(6), b => ALPHA[b % ALPHA.length]).join('');
const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const clean = (s, n = 80) => String(s ?? '').slice(0, n);

function slimTrack(t) {
  if (!t || typeof t !== 'object') return null;
  return {
    source: clean(t.source, 10), rawId: clean(t.rawId, 120), title: clean(t.title, 200), artist: clean(t.artist, 200),
    album: clean(t.album, 200), cover: /^https:\/\//.test(t.cover || '') ? clean(t.cover, 500) : null,
    duration: Math.max(0, Math.min(36000, Number(t.duration) || 0)), albumId: t.albumId ? clean(t.albumId, 40) : null,
  };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const ch of req) { raw += ch; if (raw.length > 20000) break; }
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
  try {
    if (req.method === 'GET') {
      const u = new URL(req.url, 'http://x');
      const code = clean(u.searchParams.get('code'), 6).toUpperCase();
      const room = await store.get('room:' + code);
      if (!room) return send(404, { error: 'Комната не найдена или закрыта' });
      const since = Number(u.searchParams.get('v') || 0);
      const out = { v: room.v, now: Date.now(), host: room.hostName, closed: !!room.closed };
      if (room.v !== since) out.state = room.state;
      if (u.searchParams.get('members')) {
        const m = (await store.hgetall('members:' + code)) || {};
        const fresh = Date.now() - 45000;
        out.members = Object.entries(m).filter(([, ts]) => Number(ts) > fresh).map(([name]) => name);
      }
      return send(200, out);
    }
    if (req.method !== 'POST') return send(405, { error: 'Метод не поддерживается' });
    const b = await readBody(req);
    const action = b.action;

    if (action === 'create') {
      let code; for (let i = 0; i < 5; i++) { code = code6(); if (!(await store.get('room:' + code))) break; }
      const hostKey = crypto.randomBytes(18).toString('base64url');
      const room = { v: 1, hostName: clean(b.name || 'Хозяин', 40), hostKey: hash(hostKey), state: { track: null, playing: false, position: 0, ts: Date.now() }, created: Date.now() };
      await store.set('room:' + code, room, TTL);
      return send(200, { code, hostKey });
    }

    const code = clean(b.code, 6).toUpperCase();
    const room = await store.get('room:' + code);
    if (!room) return send(404, { error: 'Комната не найдена или закрыта' });

    if (action === 'update' || action === 'close') {
      if (hash(b.hostKey) !== room.hostKey) return send(403, { error: 'Управлять комнатой может только хозяин' });
      if (action === 'close') { room.closed = true; room.v++; await store.set('room:' + code, room, 600); return send(200, { ok: true }); }
      const s = b.state || {};
      room.state = { track: slimTrack(s.track), playing: !!s.playing, position: Math.max(0, Number(s.position) || 0), ts: Date.now() };
      room.v++;
      await store.set('room:' + code, room, TTL);
      return send(200, { v: room.v, now: Date.now() });
    }
    if (action === 'ping') {                 // присутствие гостя, раз в 15 секунд
      await store.hset('members:' + code, clean(b.name || 'Гость', 40), Date.now(), TTL);
      return send(200, { ok: true });
    }
    if (action === 'leave') { await store.hdel('members:' + code, clean(b.name || 'Гость', 40)); return send(200, { ok: true }); }
    return send(400, { error: 'Неизвестное действие' });
  } catch (e) {
    return send(500, { error: 'Ошибка сервера: ' + e.message });
  }
}
