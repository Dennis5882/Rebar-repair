const MIDAS_BASE = {
  gen:   'https://moa-engineers.midasit.com:443/gen',
  civil: 'https://moa-engineers.midasit.com:443/civil'
};

// KDS 41 20:2022 배근수정 엔드포인트 (부재 유형별). MIDAS-API 매뉴얼 기준으로
// 응답은 엔드포인트 자신의 키(REBB/REBC/REBW/REBR) 아래에 { "<key>": {...} }
// 형태로 중첩되어 온다 (실제 Gen NX로 라이브 검증은 아직 못 함 — 처음 호출 시
// 이 가정이 틀렸다면 여기 topKey 추출 로직을 조정해야 할 수 있음).
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

  const { product, apiKey, baseUrl, memberType } = req.body || {};
  const base = (baseUrl || '').trim().replace(/\/$/, '') || MIDAS_BASE[product];
  const endpoint = ENDPOINTS[memberType];
  if (!apiKey)   return res.status(400).json({ ok: false, error: 'MAPI Key를 입력하세요.' });
  if (!base)     return res.status(400).json({ ok: false, error: `알 수 없는 product: ${product}` });
  if (!endpoint) return res.status(400).json({ ok: false, error: `알 수 없는 부재 유형: ${memberType}` });

  try {
    const r = await fetch(`${base}${endpoint}`, { headers: { 'MAPI-Key': apiKey } });
    let data = null;
    try { data = await r.json(); } catch (_) {}

    if (!r.ok) {
      const msg = (data && (data.message || (data.error && data.error.message))) || `HTTP ${r.status}`;
      return res.json({ ok: false, error: msg });
    }
    const topKey = data ? Object.keys(data)[0] : null;
    const items = topKey ? (data[topKey] || {}) : {};
    return res.json({ ok: true, data: items });
  } catch (e) {
    return res.json({ ok: false, error: e.message });
  }
};
