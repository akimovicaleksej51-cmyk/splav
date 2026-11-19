// «Слушать вместе»: хозяин публикует состояние, гости забирают его опросом
import crypto from 'node:crypto';
import store from '../lib/store.js';
import { clean, slimTrack, readBody, sender } from '../lib/http.js';

const TTL = 6 * 3600;                 // комната живёт 6 часов после последнего изменения
const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const codeOf = s => String(s ?? '').replace(/\D/g, '').slice(0, 6);
const stateOf = s => ({ track: slimTrack(s && s.track), playing: !!(s && s.playing), position: Math.max(0, Number(s && s.position) || 0), ts: Date.now() });

export default async function handler(req, res) {
  const send = sender(res);
  try {
    if (req.method === 'GET') {
      const u = new URL(req.url, 'http://x');
      const code = codeOf(u.searchParams.get('code'));
      const room = code.length === 6 && await store.get('room:' + code);
      if (!room) return send(404, { error: 'Комнаты с таким кодом нет. Проверьте цифры' });
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
      const hostKey = crypto.randomBytes(18).toString('base64url');
      const room = { v: 1, hostName: clean(b.name || 'Хозяин', 40), hostKey: hash(hostKey), state: stateOf(b.state), created: Date.now() };
      for (let i = 0; i < 8; i++) {
        const code = String(crypto.randomInt(100000, 1000000));
        if (await store.setnx('room:' + code, room, TTL)) return send(200, { code, hostKey, v: 1 });
      }
      return send(503, { error: 'Не удалось подобрать код, попробуйте ещё раз' });
    }

    const code = codeOf(b.code);
    const room = code.length === 6 && await store.get('room:' + code);
    if (!room) return send(404, { error: 'Комнаты с таким кодом нет. Проверьте цифры' });

    if (action === 'update' || action === 'close') {
      if (hash(b.hostKey) !== room.hostKey) return send(403, { error: 'Управлять комнатой может только хозяин' });
      if (action === 'close') { room.closed = true; room.v++; await store.set('room:' + code, room, 600); return send(200, { ok: true }); }
      room.state = stateOf(b.state);
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
