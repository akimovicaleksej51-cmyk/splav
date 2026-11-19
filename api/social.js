// Друзья и отправка треков. Профиль — это имя и секретный ключ, который хранит только приложение
import crypto from 'node:crypto';
import store from '../lib/store.js';
import { clean, slimTrack, readBody, sender, ipOf } from '../lib/http.js';

const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const NAME_RE = /^[a-z0-9_.]{3,20}$/;
const normName = s => String(s || '').trim().replace(/^@/, '').toLowerCase();
const pair = (a, b) => 'chat:' + [a, b].sort().join(':');
const MAX_FRIENDS = 300, MAX_REQS = 100, CHAT_KEEP = 300, INBOX_KEEP = 150;

async function users(ids) {
  const rows = await store.mget(ids.map(id => 'user:' + id));
  return rows.map((u, i) => u ? { id: u.id, name: u.name } : { id: ids[i], name: 'удалённый профиль' });
}
const keysOf = h => Object.keys(h || {});

export default async function handler(req, res) {
  const send = sender(res);
  const fail = (code, error) => send(code, { error });
  try {
    if (req.method !== 'POST') return fail(405, 'Метод не поддерживается');
    const b = await readBody(req);

    if (b.action === 'register') {
      if ((await store.incr('rl:reg:' + ipOf(req), 3600)) > 10) return fail(429, 'Слишком много попыток, подождите час');
      const name = normName(b.name);
      if (!NAME_RE.test(name)) return fail(400, 'Имя: от 3 до 20 латинских букв, цифр, точек или подчёркиваний');
      const id = crypto.randomBytes(9).toString('base64url');
      if (!(await store.setnx('uname:' + name, id))) return fail(409, `Имя @${name} уже занято`);
      const secret = crypto.randomBytes(24).toString('base64url');
      await store.set('user:' + id, { id, name, key: hash(secret), created: Date.now() });
      return send(200, { id, name, secret });
    }

    // дальше — только со своим ключом
    const me = await store.get('user:' + clean(b.uid, 20));
    if (!me || me.key !== hash(b.secret)) return fail(401, 'Профиль не найден. Создайте его заново на странице «Друзья»');
    if ((await store.incr('rl:u:' + me.id, 60)) > 120) return fail(429, 'Слишком часто, подождите минуту');
    const other = clean(b.id, 20);

    switch (b.action) {
      case 'sync': {
        const ver = await store.get('ver:' + me.id);
        if (b.ver && ver && String(ver) === String(b.ver)) return send(200, { same: true });
        const [fr, rin, rout, last, inbox] = await Promise.all([
          store.hgetall('friends:' + me.id), store.hgetall('reqin:' + me.id), store.hgetall('reqout:' + me.id),
          store.hgetall('last:' + me.id), store.lrange('inbox:' + me.id, 0, INBOX_KEEP - 1),
        ]);
        const [friends, incoming, outgoing] = await Promise.all([users(keysOf(fr)), users(keysOf(rin)), users(keysOf(rout))]);
        for (const f of friends) f.last = Number((last || {})[f.id]) || 0;
        friends.sort((a, b) => b.last - a.last || a.name.localeCompare(b.name));
        const since = Number(b.since) || 0;
        return send(200, { ver: ver || null, me: { id: me.id, name: me.name }, friends, incoming, outgoing, inbox: (inbox || []).filter(m => m.ts > since), now: Date.now() });
      }
      case 'request': {
        const name = normName(b.name);
        const tid = NAME_RE.test(name) && await store.get('uname:' + name);
        if (!tid) return fail(404, `Нет профиля @${name || '…'}. Проверьте имя`);
        if (tid === me.id) return fail(400, 'Это ваше имя');
        const mine = (await store.hgetall('friends:' + me.id)) || {};
        if (mine[tid]) return send(200, { status: 'friends' });
        if (Object.keys(mine).length >= MAX_FRIENDS) return fail(400, 'У вас слишком много друзей для Сплава');
        const theirOut = (await store.hgetall('reqin:' + me.id)) || {};
        if (theirOut[tid]) { await befriend(me.id, tid); return send(200, { status: 'friends' }); }
        if ((await store.hlen('reqin:' + tid)) >= MAX_REQS) return fail(400, 'У этого человека слишком много заявок');
        await Promise.all([store.hset('reqin:' + tid, me.id, Date.now()), store.hset('reqout:' + me.id, tid, Date.now()), bump(me.id, tid)]);
        return send(200, { status: 'sent' });
      }
      case 'accept': {
        const rin = (await store.hgetall('reqin:' + me.id)) || {};
        if (!rin[other]) return fail(404, 'Заявка уже не действует');
        await befriend(me.id, other);
        return send(200, { ok: true });
      }
      case 'decline':
        await Promise.all([store.hdel('reqin:' + me.id, other), store.hdel('reqout:' + other, me.id), bump(me.id, other)]);
        return send(200, { ok: true });
      case 'cancel':
        await Promise.all([store.hdel('reqout:' + me.id, other), store.hdel('reqin:' + other, me.id), bump(me.id, other)]);
        return send(200, { ok: true });
      case 'remove':
        await Promise.all([store.hdel('friends:' + me.id, other), store.hdel('friends:' + other, me.id), bump(me.id, other)]);
        return send(200, { ok: true });
      case 'send': {
        const fr = (await store.hgetall('friends:' + me.id)) || {};
        if (!fr[other]) return fail(403, 'Отправлять треки можно только друзьям');
        const track = slimTrack(b.track);
        if (!track || !track.title) return fail(400, 'Нет трека');
        const msg = { id: crypto.randomBytes(6).toString('base64url'), f: me.id, fn: me.name, to: other, t: track, ts: Date.now() };
        await Promise.all([
          store.lpush(pair(me.id, other), msg, CHAT_KEEP), store.lpush('inbox:' + other, msg, INBOX_KEEP),
          store.hset('last:' + me.id, other, msg.ts), store.hset('last:' + other, me.id, msg.ts), bump(me.id, other),
        ]);
        return send(200, { msg });
      }
      case 'chat': {
        const fr = (await store.hgetall('friends:' + me.id)) || {};
        if (!fr[other]) return fail(403, 'Этот человек больше не в друзьях');
        return send(200, { messages: (await store.lrange(pair(me.id, other), 0, 99)) || [] });
      }
      default: return fail(400, 'Неизвестное действие');
    }
  } catch (e) {
    return fail(500, 'Ошибка сервера: ' + e.message);
  }
}

async function befriend(a, b) {
  const now = Date.now();
  await Promise.all([
    store.hset('friends:' + a, b, now), store.hset('friends:' + b, a, now),
    store.hdel('reqin:' + a, b), store.hdel('reqout:' + b, a), store.hdel('reqin:' + b, a), store.hdel('reqout:' + a, b), bump(a, b),
  ]);
}
// метка «что-то изменилось»: пока она та же, опрос стоит одну короткую команду
const bump = (...ids) => Promise.all(ids.map(id => store.set('ver:' + id, Date.now() + '.' + crypto.randomInt(1000))));
