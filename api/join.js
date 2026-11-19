// Ссылка-приглашение в комнату: https://…/api/join?c=123456 открывает Сплав сразу в комнате
export default function handler(req, res) {
  const u = new URL(req.url, 'http://x');
  const code = String(u.searchParams.get('c') || '').replace(/\D/g, '').slice(0, 6);
  const deep = `splavapp://room/${code}`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(`<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Комната ${code} в Сплаве</title>
<meta property="og:title" content="Слушаем вместе в Сплаве"><meta property="og:description" content="Комната ${code}. Нажмите, чтобы присоединиться">
<style>
*{box-sizing:border-box;margin:0}html,body{height:100%}body{display:grid;place-items:center;padding:28px;background:radial-gradient(circle at 70% 20%,#4a0b17 0,#0e0e12 55%,#060608 100%);color:#ecebee;font:500 16px/1.5 -apple-system,system-ui,sans-serif;text-align:center}
.box{max-width:380px}.logo{font-weight:900;letter-spacing:.06em;font-size:15px;opacity:.75}.code{display:flex;gap:8px;justify-content:center;margin:26px 0 14px}
.code span{width:46px;height:58px;display:grid;place-items:center;border-radius:12px;background:rgba(181,29,48,.18);border:1.5px solid rgba(181,29,48,.55);font-weight:900;font-size:28px}
h1{font-size:24px;line-height:1.2;margin-top:18px}p{color:#8a8894;margin-top:10px}
a.btn{display:block;margin-top:26px;padding:16px;border-radius:999px;background:#ecebee;color:#060608;font-weight:800;text-decoration:none}
small{display:block;color:#55545f;margin-top:18px;font-size:13px}
</style></head><body><div class="box"><div class="logo">● СПЛАВ</div><h1>Вас зовут слушать музыку вместе</h1>
<div class="code">${code.split('').map(d => `<span>${d}</span>`).join('')}</div>
<p>Нажмите кнопку, и Сплав откроется сразу в этой комнате.</p>
<a class="btn" href="${deep}">Открыть в Сплаве</a>
<small>Не открывается? Запустите Сплав, откройте «Комнату» и введите код вручную.</small></div>
<script>setTimeout(function(){location.href=${JSON.stringify(deep)}},350)</script></body></html>`);
}
