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
fs.writeFileSync(
  LOG_FILE,
  'timestamp,user_id,now_id,endpoint,use_case,type,ip,jwt_payload,label\n'
);

// ── 共通ユーティリティ ────────────────────────
const api = axios.create({ baseURL: 'http://localhost:3000', timeout: 5000 });
const sleep = ms => new Promise(res => setTimeout(res, ms));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomIP = () =>
  Array.from({ length: 4 }, () => randInt(1, 254)).join('.');
const USER_AGENT = 'normal-logger';
function extractPayload(token) {
  try {
    const payloadPart = token.split('.')[1];
    const json = Buffer.from(payloadPart, 'base64url').toString();
    const obj  = JSON.parse(json);
    return Buffer.from(JSON.stringify(obj)).toString('base64url');
  } catch (_) {
    return 'invalid';
  }
}
function logRow({ ts, userId, nowId, endpoint, ip, token = 'none', label }) {
  const { use_case = 'unknown', type = 'unknown' } = MAP[endpoint] || {};
  const line = [
    ts,
    userId,
    nowId,
    endpoint,
    use_case,
    type,
    ip,
    extractPayload(token),
    label
  ].join(',') + '\n';
  fs.appendFileSync(LOG_FILE, line);
}

// ── 正常系列定義 ──────────────────────────────
async function normalSequence(userId) {
  const ip = randomIP();
  // 1. login
  const t0 = new Date().toISOString();
  const { data } = await api.post('/login', { user_id: userId }, {
    headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT }
  });
  const token = data.token;
  logRow({ ts: t0, userId, nowId: userId, endpoint: '/login', ip, token, label: 'normal' });
  const auth = {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Forwarded-For': ip,
      'User-Agent': USER_AGENT
    }
  };

  // 2. browse を 1~3 回ランダム実行
  const browseCount = randInt(1, 3);
  for (let i = 0; i < browseCount; i++) {
    const t = new Date().toISOString();
    await api.get('/browse', auth);
    logRow({ ts: t, userId, nowId: userId, endpoint: '/browse', ip, token, label: 'normal' });
  }

  // 3. edit を 0~2 回ランダム実行
  const editCount = randInt(0, 2);
  for (let i = 0; i < editCount; i++) {
    const t = new Date().toISOString();
    await api.post('/edit', {}, auth);
    logRow({ ts: t, userId, nowId: userId, endpoint: '/edit', ip, token, label: 'normal' });
  }

  // 4. logout
  const t3 = new Date().toISOString();
  await api.post('/logout', {}, auth);
  logRow({ ts: t3, userId, nowId: userId, endpoint: '/logout', ip, token, label: 'normal' });
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
