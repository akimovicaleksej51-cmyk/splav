// Хранилище: Upstash Redis на Vercel, обычная память при локальной проверке
import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

let store;
if (url && token) {
  const r = new Redis({ url, token });
  store = {
    get: k => r.get(k),
    set: (k, v, ttl) => r.set(k, v, { ex: ttl }),
    del: k => r.del(k),
    hset: (k, f, v, ttl) => r.pipeline().hset(k, { [f]: v }).expire(k, ttl).exec(),
    hgetall: k => r.hgetall(k),
    hdel: (k, f) => r.hdel(k, f),
  };
} else {
  const mem = new Map(), exp = new Map();
  const alive = k => { if (exp.has(k) && exp.get(k) < Date.now()) { mem.delete(k); exp.delete(k); } return mem.has(k); };
  store = {
    get: async k => alive(k) ? structuredClone(mem.get(k)) : null,
    set: async (k, v, ttl) => { mem.set(k, structuredClone(v)); exp.set(k, Date.now() + ttl * 1000); },
    del: async k => { mem.delete(k); exp.delete(k); },
    hset: async (k, f, v, ttl) => { const h = alive(k) ? mem.get(k) : {}; h[f] = v; mem.set(k, h); exp.set(k, Date.now() + ttl * 1000); },
    hgetall: async k => alive(k) ? { ...mem.get(k) } : null,
    hdel: async (k, f) => { if (alive(k)) delete mem.get(k)[f]; },
  };
}
export default store;
