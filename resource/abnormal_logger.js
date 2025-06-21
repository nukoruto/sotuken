/**
 * 異常操作系列を自動生成して abnormal_log.csv に保存
 *
 *  呼び出し: node abnormal_logger.js [系列数] [delay_ms]
 *     系列数   : デフォルト 100
 *     delay_ms : 各系列間ウェイト (ms) デフォルト 100
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(__dirname, 'logs', 'abnormal_log.csv');

const MAP = {
  '/login':  { use_case: 'Login',       type: 'AUTH'   },
  '/logout': { use_case: 'Logout',      type: 'AUTH'   },
  '/browse': { use_case: 'ViewPage',    type: 'READ'   },
  '/edit':   { use_case: 'EditContent', type: 'UPDATE' }
};

if (!fs.existsSync(path.dirname(LOG_FILE))) fs.mkdirSync(path.dirname(LOG_FILE));
fs.writeFileSync(LOG_FILE, 'timestamp,user_id,endpoint,use_case,type,jwt,label\n');

const api = axios.create({ baseURL: 'http://localhost:3000', timeout: 5000 });
const sleep = ms => new Promise(res => setTimeout(res, ms));
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
function extractPayload(token) {
  try {
    const payloadPart = token.split('.')[1];
    const json = Buffer.from(payloadPart, 'base64url').toString();
    return JSON.stringify(JSON.parse(json));
  } catch (_) {
    return 'invalid';
  }
}
function logRow({ ts, userId, endpoint, token = 'none', label }) {
  const { use_case = 'unknown', type = 'unknown' } = MAP[endpoint] || {};
  fs.appendFileSync(
    LOG_FILE,
    [
      ts,
      userId,
      endpoint,
      use_case,
      type,
      extractPayload(token),
      label
    ].join(',') + '\n'
  );
}

// ── 各異常シナリオ ───────────────────────────
// 1) 無効JWT
async function invalidTokenSequence(userId) {
  const { data } = await api.post('/login', { user_id: userId });
  const badToken = data.token.slice(0, -1) + 'x';
  const auth = { headers: { Authorization: `Bearer ${badToken}` } };
  const ts = new Date().toISOString();
  try { await api.get('/browse', auth); } catch (_) {}
  logRow({ ts, userId: 'unknown', endpoint: '/browse', token: badToken, label: 'invalid_token' });
}

// 2) JWTなしアクセス
async function noTokenSequence() {
  const ts = new Date().toISOString();
  try { await api.post('/edit'); } catch (_) {}
  logRow({ ts, userId: 'unknown', endpoint: '/edit', token: 'none', label: 'no_token' });
}

// 3) 順序異常 (edit → login → logout)
async function reversedSequence(userId) {
  const ts1 = new Date().toISOString();
  try { await api.post('/edit'); } catch (_) {}
  logRow({ ts: ts1, userId: 'unknown', endpoint: '/edit', token: 'none', label: 'no_token' });

  const { data } = await api.post('/login', { user_id: userId });
  const token = data.token;
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const ts2 = new Date().toISOString();
  await api.post('/logout', {}, auth);
  logRow({ ts: ts2, userId, endpoint: '/logout', token, label: 'out_of_order' });
}

// 全異常パターンを配列で管理
const scenarios = [invalidTokenSequence, noTokenSequence, reversedSequence];

// ── メイン ───────────────────────────────────
(async () => {
  const total = parseInt(process.argv[2] || '100', 10);
  const delay = parseInt(process.argv[3] || '100', 10);
  console.log(`▶ 異常系列 ${total} 本 生成開始`);

  for (let i = 0; i < total; i++) {
    const scen = rand(scenarios);
    await scen(`abuser${i + 1}`);
    await sleep(delay);
  }
  console.log(`完了：logs/abnormal_log.csv に保存済`);
})();
