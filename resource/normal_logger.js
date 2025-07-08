/**
 * 正常操作系列を自動生成して normal_log.csv に保存
 *
 *  呼び出し: node normal_logger.js --n 50 --d 100
 *     --n 系列数   (default 100)
 *     --d delay_ms (ms, default 100)
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const updateOperationLog = require('./update_operation_log');
const LOG_FILE = path.join(__dirname, 'logs', 'normal_log.csv');

// ── マッピング（endpoint → use_case/type） ──────────────
const MAP = {
  '/login':  { use_case: 'Login',       type: 'AUTH'   },
  '/logout': { use_case: 'Logout',      type: 'AUTH'   },
  '/browse': { use_case: 'ViewPage',    type: 'READ'   },
  '/edit':   { use_case: 'EditContent', type: 'UPDATE' },
  '/profile': { use_case: 'Profile',    type: 'UPDATE' },
  '/search':  { use_case: 'Search',     type: 'READ' }
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
const jpOctets = [43,49,58,59,60,61,101,103,106,110,111,112,113,114,115,116,118,
 119,120,121,122,123,124,125,126,133,150,153,175,180,182,183,202,203,210,211,
 219,220,221,222];
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const randomIP = () => [rand(jpOctets), randInt(0,255), randInt(0,255), randInt(1,254)].join('.');
const USER_AGENT = 'normal-logger';
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

// ── 基本操作 ──────────────────────────────────
async function stepLogin(userId, ip) {
  const ts = new Date().toISOString();
  const { data } = await api.post('/login', { user_id: userId }, {
    headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT }
  });
  const token = data.token;
  logRow({ ts, userId, nowId: userId, endpoint: '/login', ip, token, label: 'normal' });
  return { token, auth: {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Forwarded-For': ip,
      'User-Agent': USER_AGENT
    }
  }};
}

async function stepBrowse(userId, ip, token, auth) {
  const ts = new Date().toISOString();
  await api.get('/browse', auth);
  logRow({ ts, userId, nowId: userId, endpoint: '/browse', ip, token, label: 'normal' });
}

async function stepEdit(userId, ip, token, auth) {
  const ts = new Date().toISOString();
  await api.post('/edit', {}, auth);
  logRow({ ts, userId, nowId: userId, endpoint: '/edit', ip, token, label: 'normal' });
}

async function stepLogout(userId, ip, token, auth) {
  const ts = new Date().toISOString();
  await api.post('/logout', {}, auth);
  logRow({ ts, userId, nowId: userId, endpoint: '/logout', ip, token, label: 'normal' });
}

async function stepProfileView(userId, ip, token, auth) {
  const ts = new Date().toISOString();
  await api.get('/profile', auth);
  logRow({ ts, userId, nowId: userId, endpoint: '/profile', ip, token, label: 'normal' });
}

async function stepProfileUpdate(userId, ip, token, auth) {
  const ts = new Date().toISOString();
  await api.post('/profile', { bio: 'hello' }, auth);
  logRow({ ts, userId, nowId: userId, endpoint: '/profile', ip, token, label: 'normal' });
}

async function stepSearch(userId, ip, token) {
  const ts = new Date().toISOString();
  await api.get('/search?q=test', { headers: { 'X-Forwarded-For': ip, 'User-Agent': USER_AGENT } });
  logRow({ ts, userId, nowId: userId, endpoint: '/search', ip, token, label: 'normal' });
}

// ── 各ユースケース定義 ──────────────────────────
async function ucA2(userId) {                 // Login → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepLogout(userId, ip, token, auth);
}

async function ucA1(userId) {                 // Login のみ
  const ip = randomIP();
  await stepLogin(userId, ip);
}

async function ucR4(userId) {                 // Login → Browse×n → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  const count = randInt(2, 4);
  for (let i = 0; i < count; i++) await stepBrowse(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucR3(userId) {                 // Login → Browse → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepBrowse(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucR1R2(userId) {               // Login → Browse(複数) → (no logout)
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  const count = randInt(1, 3);
  for (let i = 0; i < count; i++) await stepBrowse(userId, ip, token, auth);
}

async function ucU2(userId) {                 // Login → Edit → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepEdit(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucU5(userId) {                 // Login → Browse → Edit → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepBrowse(userId, ip, token, auth);
  await stepEdit(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucU1U3(userId) {               // Login → Edit(複数)
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  const count = randInt(1, 3);
  for (let i = 0; i < count; i++) await stepEdit(userId, ip, token, auth);
}

async function ucM1(userId) {                 // Login → Browse → Edit → Browse → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepBrowse(userId, ip, token, auth);
  await stepEdit(userId, ip, token, auth);
  await stepBrowse(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucM3(userId) {                 // Login → Browse → Edit → Edit → Browse → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepBrowse(userId, ip, token, auth);
  await stepEdit(userId, ip, token, auth);
  await stepEdit(userId, ip, token, auth);
  await stepBrowse(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucM2(userId) {                 // Login → Edit → Browse → Edit → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepEdit(userId, ip, token, auth);
  await stepBrowse(userId, ip, token, auth);
  await stepEdit(userId, ip, token, auth);
  await stepLogout(userId, ip, token, auth);
}

async function ucO1(userId) {                 // Login → Browse → Edit (no logout)
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepBrowse(userId, ip, token, auth);
  await stepEdit(userId, ip, token, auth);
}

async function ucO2O3(userId) {               // Login → Browse (no logout)
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  const count = randInt(1, 3);
  for (let i = 0; i < count; i++) await stepBrowse(userId, ip, token, auth);
}

async function ucP1(userId) {                 // Login → ProfileView → Update → Search → Logout
  const ip = randomIP();
  const { token, auth } = await stepLogin(userId, ip);
  await stepProfileView(userId, ip, token, auth);
  await stepProfileUpdate(userId, ip, token, auth);
  await stepSearch(userId, ip, token);
  await stepLogout(userId, ip, token, auth);
}

const scenarios = [
  { weight: 5, run: ucA2 },
  { weight: 3, run: ucA1 },
  { weight: 5, run: ucR4 },
  { weight: 4, run: ucR3 },
  { weight: 2, run: ucR1R2 },
  { weight: 4, run: ucU2 },
  { weight: 3, run: ucU5 },
  { weight: 2, run: ucU1U3 },
  { weight: 5, run: ucM1 },
  { weight: 3, run: ucM3 },
  { weight: 2, run: ucM2 },
  { weight: 3, run: ucO1 },
  { weight: 2, run: ucO2O3 },
  { weight: 3, run: ucP1 }
];

function pickScenario() {
  const total = scenarios.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const scen of scenarios) {
    if (r < scen.weight) return scen.run;
    r -= scen.weight;
  }
  return scenarios[0].run;
}

async function normalSequence(userId) {
  const run = pickScenario();
  await run(userId);
}

// ── メイン ───────────────────────────────────
(async () => {
  const { total, delay } = parseArgs();
  console.log(`▶ 正常系列 ${total} 本 生成開始`);

  for (let i = 0; i < total; i++) {
    const uid = `user${String(i + 1).padStart(3, '0')}`;
    await normalSequence(uid);
    await sleep(delay);
  }
  console.log(`完了：logs/normal_log.csv に保存済`);
  updateOperationLog();
})();
