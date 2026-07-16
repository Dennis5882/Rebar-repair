const MIDAS_BASE = {
  gen:   'https://moa-engineers.midasit.com:443/gen',
  civil: 'https://moa-engineers.midasit.com:443/civil'
};

const ENDPOINTS = {
  BEAM:   '/DESIGN/RC/KDS-41-20-2022/REBB',
  COLUMN: '/DESIGN/RC/KDS-41-20-2022/REBC',
  WALL:   '/DESIGN/RC/KDS-41-20-2022/REBW',
  BRACE:  '/DESIGN/RC/KDS-41-20-2022/REBR'
};

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).end();

  const { product, apiKey, baseUrl, memberType, key, payload } = req.body || {};
  const base = (baseUrl || '').trim().replace(/\/$/, '') || MIDAS_BASE[product];
  const endpoint = ENDPOINTS[memberType];
  const itemKey = String(key || '').trim();

  if (!apiKey)   return res.status(400).json({ ok: false, error: 'MAPI Key를 입력하세요.' });
  if (!base)     return res.status(400).json({ ok: false, error: `알 수 없는 product: ${product}` });
  if (!endpoint) return res.status(400).json({ ok: false, error: `알 수 없는 부재 유형: ${memberType}` });
  if (!itemKey)  return res.status(400).json({ ok: false, error: 'Element/단면/Wall ID를 입력하세요.' });
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ ok: false, error: '배근 값이 비어 있습니다.' });
  }

  try {
    const r = await fetch(`${base}${endpoint}`, {
      method: 'PUT',
      headers: { 'MAPI-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ Assign: { [itemKey]: payload } })
    });
    let data = null;
    try { data = await r.json(); } catch (_) {}

    if (!r.ok || (data && data.error)) {
      const msg = (data && (data.error?.message || data.message)) || `HTTP ${r.status}`;
      return res.json({ ok: false, error: msg });
    }
    return res.json({ ok: true, data });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
};
