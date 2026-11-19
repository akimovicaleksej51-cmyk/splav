// Общие помощники для функций Vercel
export const clean = (s, n = 80) => String(s ?? '').slice(0, n);
export function slimTrack(t) {
  if (!t || typeof t !== 'object') return null;
  return {
    source: clean(t.source, 10), rawId: clean(t.rawId, 120), title: clean(t.title, 200), artist: clean(t.artist, 200),
    album: clean(t.album, 200), cover: /^https:\/\//.test(t.cover || '') ? clean(t.cover, 500) : null,
    duration: Math.max(0, Math.min(36000, Number(t.duration) || 0)), albumId: t.albumId ? clean(t.albumId, 40) : null,
    url: /^https:\/\//.test(t.url || '') ? clean(t.url, 500) : null,
  };
}
export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const ch of req) { raw += ch; if (raw.length > 20000) break; }
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
export function sender(res) {
  res.setHeader('Cache-Control', 'no-store');
  return (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
}
export const ipOf = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
