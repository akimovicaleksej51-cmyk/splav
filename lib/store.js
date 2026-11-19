// Хранилище: Upstash Redis на Vercel, обычная память при локальной проверке
import { Redis } from '@upstash/redis';

// База находится при любом префиксе переменных: KV_, SPLAV_, UPSTASH_REDIS_ и т.д.
const env = process.env;
const pick = suffixes => {
  for (const sfx of suffixes) { const k = Object.keys(env).find(n => n.endsWith(sfx) && !n.includes('READ_ONLY') && env[n]); if (k) return env[k]; }
  return undefined;
};
const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || pick(['_REST_API_URL', '_REDIS_REST_URL']);
const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || pick(['_REST_API_TOKEN', '_REDIS_REST_TOKEN']);

let store;
if (url && token) {
  const r = new Redis({ url, token });
  store = {
    kind: 'redis',
    get: k => r.get(k),
    mget: ks => ks.length ? r.mget(...ks) : Promise.resolve([]),
    set: (k, v, ttl) => ttl ? r.set(k, v, { ex: ttl }) : r.set(k, v),
    setnx: async (k, v, ttl) => (await r.set(k, v, ttl ? { nx: true, ex: ttl } : { nx: true })) === 'OK',
    del: k => r.del(k),
    hset: (k, f, v, ttl) => ttl ? r.pipeline().hset(k, { [f]: v }).expire(k, ttl).exec() : r.hset(k, { [f]: v }),
    hgetall: k => r.hgetall(k),
    hdel: (k, f) => r.hdel(k, f),
    hlen: k => r.hlen(k),
    lpush: (k, v, max) => r.pipeline().lpush(k, v).ltrim(k, 0, max - 1).exec(),
    lrange: (k, a, b) => r.lrange(k, a, b),
    incr: async (k, ttl) => { const [n] = await r.pipeline().incr(k).expire(k, ttl, 'NX').exec(); return n; },
  };
} else {
  const mem = new Map(), exp = new Map();
  const alive = k => { if (exp.has(k) && exp.get(k) < Date.now()) { mem.delete(k); exp.delete(k); } return mem.has(k); };
  const put = (k, v, ttl) => { mem.set(k, v); if (ttl) exp.set(k, Date.now() + ttl * 1000); else exp.delete(k); };
  store = {
    kind: 'memory',
    get: async k => alive(k) ? structuredClone(mem.get(k)) : null,
    mget: async ks => ks.map(k => alive(k) ? structuredClone(mem.get(k)) : null),
    set: async (k, v, ttl) => put(k, structuredClone(v), ttl),
    setnx: async (k, v, ttl) => { if (alive(k)) return false; put(k, structuredClone(v), ttl); return true; },
    del: async k => { mem.delete(k); exp.delete(k); },
    hset: async (k, f, v, ttl) => { const h = alive(k) ? mem.get(k) : {}; h[f] = v; put(k, h, ttl || (exp.has(k) ? (exp.get(k) - Date.now()) / 1000 : 0)); },
    hgetall: async k => alive(k) && Object.keys(mem.get(k)).length ? { ...mem.get(k) } : null,
    hdel: async (k, f) => { if (alive(k)) delete mem.get(k)[f]; },
    hlen: async k => alive(k) ? Object.keys(mem.get(k)).length : 0,
    lpush: async (k, v, max) => { const l = alive(k) ? mem.get(k) : []; l.unshift(structuredClone(v)); l.length = Math.min(l.length, max); mem.set(k, l); },
    lrange: async (k, a, b) => alive(k) ? structuredClone(mem.get(k).slice(a, b < 0 ? undefined : b + 1)) : [],
    incr: async (k, ttl) => { const n = (alive(k) ? mem.get(k) : 0) + 1; if (!alive(k)) put(k, n, ttl); else mem.set(k, n); return n; },
  };
}
export default store;
