// Проверка сервера: видит ли он базу
import store from '../lib/store.js';
import { sender } from '../lib/http.js';
export default async function handler(req, res) {
  const send = sender(res);
  let db = store.kind;
  if (db === 'redis') { try { await store.set('health', Date.now(), 60); } catch (e) { db = 'error: ' + e.message; } }
  send(200, { ok: db === 'redis', db, time: Date.now() });
}
