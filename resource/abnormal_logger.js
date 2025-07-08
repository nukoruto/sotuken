/**
 * 異常操作系列を自動生成して abnormal_log.csv に保存
 *
 *  呼び出し: node abnormal_logger.js --n 50 --d 100
 *     --n 系列数   (default 100)
 *     --d delay_ms (ms, default 100)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const updateOperationLog = require('./update_operation_log');
const SECRET = 'change_this_to_env_secret';
const LOG_FILE = path.join(__dirname, 'logs', 'abnormal_log.csv');

const MAP = {
  '/login':  { use_case: 'Login',       type: 'AUTH'   },
  '/logout': { use_case: 'Logout',      type: 'AUTH'   },
  '/browse': { use_case: 'ViewPage',    type: 'READ'   },
  '/edit':   { use_case: 'EditContent', type: 'UPDATE' },
  '/profile': { use_case: 'Profile',    type: 'UPDATE' },
  '/search':  { use_case: 'Search',     type: 'READ' }
};

if (!fs.existsSync(path.dirname(LOG_FILE))) fs.mkdirSync(path.dirname(LOG_FILE));
  fs.writeFileSync(
    LOG_FILE,
    'timestamp,user_id,now_id,endpoint,use_case,type,ip,jwt_payload,label\n'
  );

const api = axios.create({ baseURL: 'http://localhost:3000', timeout: 5000 });
const sleep = ms => new Promise(res => setTimeout(res, ms));
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const jpOctets = [43,49,58,59,60,61,101,103,106,110,111,112,113,114,115,116,118,
 119,120,121,122,123,124,125,126,133,150,153,175,180,182,183,202,203,210,211,
 219,220,221,222];
const randomIP = () => [rand(jpOctets), randInt(0,255), randInt(0,255), randInt(1,254)].join('.');
const USER_AGENT = 'abnormal-logger';
function parseArgs() {
  const argv = process.argv.slice(2);
  let total = 100;
  let delay = 100;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--n') {
      total = parseInt(argv[i + 1], 10) || total;
      i++;
    } else if (argv[i] === '--d') {
      delay = parseInt(argv[i + 1], 10) || delay;
      i++;
    }
  }
  return { total, delay };
}
// token と発行者(user_id)の対応表
const tokenMap = new Map();

const registerToken = (token, userId) => tokenMap.set(token, userId);
const getIssuer = token => tokenMap.get(token) || 'unknown';
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
  fs.appendFileSync(
    LOG_FILE,
    [
      ts,
      userId,
      nowId,
      endpoint,
      use_case,
      type,
      ip,
      extractPayload(token),
      label
    ].join(',') + '\n'
  );
}

// ── 各異常シナリオ ───────────────────────────
// 1) 無効JWT
async function invalidTokenSequence(userId) {
  const ip = randomIP();
  const { data } = await api.post('/login', { user_id: userId }, {
    headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT }
  });
  // 発行された正規トークンを記録
  registerToken(data.token, userId);
  const badToken = data.token.slice(0, -1) + 'x';
  const auth = {
    headers: {
      Authorization: `Bearer ${badToken}`,
      'X-Forwarded-For': ip,
      'User-Agent': USER_AGENT
    }
  };
  const ts = new Date().toISOString();
  try { await api.get('/browse', auth); } catch (_) {}
  logRow({ ts, userId: getIssuer(badToken), nowId: userId, endpoint: '/browse', ip, token: badToken, label: 'invalid_token' });
}

// 2) JWTなしアクセス
async function noTokenSequence(userId = 'unknown') {
  const ip = randomIP();
  const ts = new Date().toISOString();
  try { await api.post('/edit', {}, { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } }); } catch (_) {}
  logRow({ ts, userId: 'unknown', nowId: userId, endpoint: '/edit', ip, token: 'none', label: 'no_token' });
}

// 2b) 認証なしでプロフィール閲覧
async function unauthorizedProfileSequence(userId = 'unknown') {
  const ip = randomIP();
  const ts = new Date().toISOString();
  try { await api.get('/profile', { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } }); } catch (_) {}
  logRow({ ts, userId: 'unknown', nowId: userId, endpoint: '/profile', ip, token: 'none', label: 'no_token' });
}

// 3) 順序異常 (edit → login → logout)
async function reversedSequence(userId) {
  const ip = randomIP();
  const ts1 = new Date().toISOString();
  try { await api.post('/edit', {}, { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } }); } catch (_) {}
  logRow({ ts: ts1, userId: 'unknown', nowId: userId, endpoint: '/edit', ip, token: 'none', label: 'no_token' });

  const { data } = await api.post('/login', { user_id: userId }, {
    headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT }
  });
  const token = data.token;
  registerToken(token, userId);
  const auth = {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Forwarded-For': ip,
      'User-Agent': USER_AGENT
    }
  };
  const ts2 = new Date().toISOString();
  await api.post('/logout', {}, auth);
  logRow({ ts: ts2, userId: getIssuer(token), nowId: userId, endpoint: '/logout', ip, token, label: 'out_of_order' });
}

// 3b) プロフィール更新を先に実行
async function profileBeforeLoginSequence(userId) {
  const ip = randomIP();
  const ts1 = new Date().toISOString();
  try { await api.post('/profile', { bio: 'x' }, { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } }); } catch (_) {}
  logRow({ ts: ts1, userId: 'unknown', nowId: userId, endpoint: '/profile', ip, token: 'none', label: 'no_token' });

  const { data } = await api.post('/login', { user_id: userId }, { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } });
  const token = data.token;
  registerToken(token, userId);
  const auth = { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } };
  const ts2 = new Date().toISOString();
  await api.post('/logout', {}, auth);
  logRow({ ts: ts2, userId: getIssuer(token), nowId: userId, endpoint: '/logout', ip, token, label: 'out_of_order' });
}

// 4) 発行者と利用者が異なるトークン流用
async function tokenReuseSequence(nowId) {
  // 既に取得済みのトークンから自分以外の発行分を選択
  let candidates = Array.from(tokenMap.entries()).filter(([, uid]) => uid !== nowId);
  let token, issuerId;

  if (candidates.length === 0) {
    // なければ新たに被害者用トークンを発行
    issuerId = `victim_for_${nowId}`;
    const ip = randomIP();
    const { data } = await api.post('/login', { user_id: issuerId }, {
      headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT }
    });
    token = data.token;
    registerToken(token, issuerId);
  } else {
    [token, issuerId] = rand(candidates);
  }

  const ip = randomIP();
  const t = new Date().toISOString();
  try {
    await api.get('/browse', {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Forwarded-For': ip,
        'User-Agent': USER_AGENT
      }
    });
  } catch (_) {}
  logRow({ ts: t, userId: issuerId, nowId, endpoint: '/browse', ip, token, label: 'token_reuse' });
}

// 5) ログアウト後に同一トークンを再利用
async function reuseAfterLogoutSequence(userId) {
  const ip = randomIP();
  const { data } = await api.post('/login', { user_id: userId }, {
    headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT }
  });
  const token = data.token;
  registerToken(token, userId);
  const auth = {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Forwarded-For': ip,
      'User-Agent': USER_AGENT
    }
  };
  const t1 = new Date().toISOString();
  await api.post('/logout', {}, auth);
  logRow({ ts: t1, userId: getIssuer(token), nowId: userId, endpoint: '/logout', ip, token, label: 'normal' });

  const t2 = new Date().toISOString();
  try { await api.get('/browse', auth); } catch (_) {}
  logRow({ ts: t2, userId: getIssuer(token), nowId: userId, endpoint: '/browse', ip, token, label: 'reuse_after_logout' });
}

// 6) 有効期限切れトークンの使用
async function expiredTokenSequence(userId) {
  const ip = randomIP();
  const token = jwt.sign({ user_id: userId }, SECRET, { expiresIn: '1s' });
  registerToken(token, userId);
  const auth = {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Forwarded-For': ip,
      'User-Agent': USER_AGENT
    }
  };
  await sleep(1500);
  const t = new Date().toISOString();
  try { await api.get('/browse', auth); } catch (_) {}
  logRow({ ts: t, userId: getIssuer(token), nowId: userId, endpoint: '/browse', ip, token, label: 'expired_token' });
}

// 7) user_id なしでのログイン試行
async function missingUserIdSequence(nowId = 'unknown') {
  const ip = randomIP();
  const ts = new Date().toISOString();
  try {
    await api.post('/login', {}, { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } });
  } catch (_) {}
  logRow({ ts, userId: 'unknown', nowId, endpoint: '/login', ip, token: 'none', label: 'missing_user_id' });
}

// 8) 存在しないエンドポイントへのアクセス
async function invalidEndpointSequence(userId) {
  const ip = randomIP();
  const { data } = await api.post('/login', { user_id: userId }, { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } });
  const token = data.token;
  registerToken(token, userId);
  const auth = { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } };
  const ts = new Date().toISOString();
  try { await api.get('/admin', auth); } catch (_) {}
  logRow({ ts, userId: getIssuer(token), nowId: userId, endpoint: '/admin', ip, token, label: 'invalid_endpoint' });
}

// 9) IP を切り替えて同一トークンを使用
async function ipSwitchSequence(userId) {
  const ip1 = randomIP();
  const { data } = await api.post('/login', { user_id: userId }, { headers: { 'X-Forwarded-For': ip1, 'User-Agent': USER_AGENT } });
  const token = data.token;
  registerToken(token, userId);
  const ip2 = randomIP();
  const auth = { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': ip2, 'User-Agent': USER_AGENT } };
  const ts = new Date().toISOString();
  try { await api.get('/browse', auth); } catch (_) {}
  logRow({ ts, userId: getIssuer(token), nowId: userId, endpoint: '/browse', ip: ip2, token, label: 'ip_switch' });
}

// 10) 過剰な連続ログイン
  async function rapidLoginSequence(userId) {
    const ip = randomIP();
    for (let i = 0; i < 5; i++) {
      const ts = new Date().toISOString();
      try {
        const { data } = await api.post('/login', { user_id: userId }, { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } });
        registerToken(data.token, userId);
        logRow({ ts, userId, nowId: userId, endpoint: '/login', ip, token: data.token, label: 'rapid_login' });
      } catch (_) {
        logRow({ ts, userId: 'unknown', nowId: userId, endpoint: '/login', ip, token: 'none', label: 'rapid_login' });
      }
      await sleep(50);
    }
  }

// 11) さまざまな操作を連結した複合異常
async function complexSequence(userId) {
  const ip = randomIP();
  // 正常ログイン
  const { data } = await api.post('/login', { user_id: userId }, { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } });
  const token = data.token;
  registerToken(token, userId);
  const auth = { headers: { Authorization: `Bearer ${token}`, 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } };
  const t1 = new Date().toISOString();
  await api.get('/browse', auth);
  logRow({ ts: t1, userId, nowId: userId, endpoint: '/browse', ip, token, label: 'normal' });

  // ログアウト
  const t2 = new Date().toISOString();
  await api.post('/logout', {}, auth);
  logRow({ ts: t2, userId, nowId: userId, endpoint: '/logout', ip, token, label: 'normal' });

  // ログアウト済みトークンで操作
  const t3 = new Date().toISOString();
  try { await api.post('/edit', {}, auth); } catch (_) {}
  logRow({ ts: t3, userId, nowId: userId, endpoint: '/edit', ip, token, label: 'reuse_after_logout' });

  // user_id を送らずログイン試行
  const t4 = new Date().toISOString();
  try { await api.post('/login', {}, { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } }); } catch (_) {}
  logRow({ ts: t4, userId: 'unknown', nowId: userId, endpoint: '/login', ip, token: 'none', label: 'missing_user_id' });

  // 存在しないページへアクセス
  const t5 = new Date().toISOString();
  try { await api.get('/admin', auth); } catch (_) {}
  logRow({ ts: t5, userId, nowId: userId, endpoint: '/admin', ip, token, label: 'invalid_endpoint' });
}


// 全異常パターンを配列で管理
const scenarios = [
  invalidTokenSequence,
  noTokenSequence,
  unauthorizedProfileSequence,
  reversedSequence,
  profileBeforeLoginSequence,
  tokenReuseSequence,
  reuseAfterLogoutSequence,
  expiredTokenSequence,
  missingUserIdSequence,
  invalidEndpointSequence,
  ipSwitchSequence,
  rapidLoginSequence,
  complexSequence
];

// ── メイン ───────────────────────────────────
(async () => {
  const { total, delay } = parseArgs();
  console.log(`▶ 異常系列 ${total} 本 生成開始`);

  for (let i = 0; i < total; i++) {
    const scen = rand(scenarios);
    await scen(`abuser${i + 1}`);
    await sleep(delay);
  }
  console.log(`完了：logs/abnormal_log.csv に保存済`);
  updateOperationLog();
})();
