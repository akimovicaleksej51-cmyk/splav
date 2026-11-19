// Последняя версия Сплава для Mac. Берётся из релизов GitHub (mac-vX.Y.Z) автоматически;
// переменные SPLAV_LATEST_* в Vercel по-прежнему работают и побеждают, если их версия новее.
const REPO = process.env.SPLAV_GITHUB_REPO || 'akimovicaleksej51-cmyk/splav-app';
let cache = { at: 0, data: null };
const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

async function fromGitHub() {
  if (cache.data && Date.now() - cache.at < 10 * 60 * 1000) return cache.data;
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, { headers: { 'User-Agent': 'splav-server', Accept: 'application/vnd.github+json' } });
  if (!r.ok) return cache.data;
  const list = await r.json();
  const rel = list.filter(x => !x.draft && /^mac-v\d/.test(x.tag_name)).sort((a, b) => cmp(b.tag_name.slice(5), a.tag_name.slice(5)))[0];
  const asset = rel && (rel.assets || []).find(a => a.name === 'Splav-mac.zip');
  const sha = rel && /sha256:\s*([a-f0-9]{64})/i.exec(rel.body || '');
  const data = asset ? { version: rel.tag_name.slice(5), url: asset.browser_download_url, sha256: sha ? sha[1].toLowerCase() : null, notes: '' } : null;
  cache = { at: Date.now(), data };
  return data;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  const env = process.env.SPLAV_LATEST_VERSION ? { version: process.env.SPLAV_LATEST_VERSION, url: process.env.SPLAV_LATEST_URL, sha256: process.env.SPLAV_LATEST_SHA256 || null, notes: process.env.SPLAV_LATEST_NOTES || '' } : null;
  let gh = null;
  try { gh = await fromGitHub(); } catch {}
  const best = [env, gh].filter(Boolean).sort((a, b) => cmp(b.version, a.version))[0];
  if (!best) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Версия не опубликована' })); }
  res.end(JSON.stringify(best));
}
