// Описание последней версии для автообновления. Заполняется переменными окружения в Vercel.
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  const v = process.env.SPLAV_LATEST_VERSION;
  if (!v) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'Версия не опубликована' })); }
  res.end(JSON.stringify({
    version: v,
    url: process.env.SPLAV_LATEST_URL,                 // прямая ссылка на Splav-mac.zip (например, GitHub Releases)
    sha256: process.env.SPLAV_LATEST_SHA256 || null,
    notes: process.env.SPLAV_LATEST_NOTES || '',
  }));
}
