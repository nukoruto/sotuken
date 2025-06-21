/**
 * 正常操作系列を自動生成して normal_log.csv に保存
 *
 *  呼び出し: node normal_logger.js [系列数] [delay_ms]
 *     系列数   : デフォルト 100
 *     delay_ms : 各系列間ウェイト (ms) デフォルト 100
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const LOG_FILE = path.join(__dirname, 'logs', 'normal_log.csv');

// ── マッピング（endpoint → use_case/type） ──────────────
const MAP = {
  '/login':  { use_case: 'Login',       type: 'AUTH'   },
  '/logout': { use_case: 'Logout',      type: 'AUTH'   },
  '/browse': { use_case: 'ViewPage',    type: 'READ'   },
  '/edit':   { use_case: 'EditContent', type: 'UPDATE' }
};

// ── CSV 初期化 ────────────────────────────────
if (!fs.existsSync(path.dirname(LOG_FILE))) fs.mkdirSync(path.dirname(LOG_FILE));
fs.writeFileSync(LOG_FILE, 'timestamp,user_id,endpoint,use_case,type,jwt,label\n');

// ── 共通ユーティリティ ────────────────────────
const api = axios.create({ baseURL: 'http://localhost:3000', timeout: 5000 });
const sleep = ms => new Promise(res => setTimeout(res, ms));
function logRow({ ts, userId, endpoint, token = 'none', label }) {
  const { use_case = 'unknown', type = 'unknown' } = MAP[endpoint] || {};
  const line = [
    ts, userId, endpoint, use_case, type, token, label
  ].join(',') + '\n';
  fs.appendFileSync(LOG_FILE, line);
}

// ── 正常系列定義 ──────────────────────────────
async function normalSequence(userId) {
  // 1. login
  const t0 = new Date().toISOString();
  const { data } = await api.post('/login', { user_id: userId });
  const token = data.token;
  logRow({ ts: t0, userId, endpoint: '/login', token, label: 'normal' });
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  // 2. browse
  const t1 = new Date().toISOString();
  await api.get('/browse', auth);
  logRow({ ts: t1, userId, endpoint: '/browse', token, label: 'normal' });

  // 3. edit
  const t2 = new Date().toISOString();
  await api.post('/edit', {}, auth);
  logRow({ ts: t2, userId, endpoint: '/edit', token, label: 'normal' });

  // 4. logout
  const t3 = new Date().toISOString();
  await api.post('/logout', {}, auth);
  logRow({ ts: t3, userId, endpoint: '/logout', token, label: 'normal' });
}

// ── メイン ───────────────────────────────────
(async () => {
  const total = parseInt(process.argv[2] || '100', 10);
  const delay = parseInt(process.argv[3] || '100', 10);
  console.log(`▶ 正常系列 ${total} 本 生成開始`);

  for (let i = 0; i < total; i++) {
    const uid = `user${String(i + 1).padStart(3, '0')}`;
    await normalSequence(uid);
    await sleep(delay);
  }
  console.log(`完了：logs/normal_log.csv に保存済`);
})();
