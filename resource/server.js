/**
 * プレ版 Web セッションロガー
 * -----------------------------------------
 * - Node.js v20.x 推奨
 * - express / jsonwebtoken / body-parser
 * - CSV ログ: 多数のフィールドを含む拡張形式
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { extractPayload } = require('./jwt_helper');

const SECRET   = 'change_this_to_env_secret'; // 本運用では環境変数へ
const PORT     = 3000;
const LOG_DIR  = process.env.LOG_DIR || path.join(__dirname, 'logs');
// 各リクエストの詳細ログは request_log.csv に保存
const REQUEST_LOG = path.join(LOG_DIR, 'request_log.csv');

const SESSIONS = new Map();           // token -> {loginTime, actionCount, last}
const REVOKED  = new Set();           // logout したトークン
const API_VERSION = 'v1';

// IPアドレスは保管しないので、地域判定関連の処理を削除

function getUserRole(user_id) {
  if (!user_id) return 'guest';
  if (user_id.startsWith('admin')) return 'admin';
  if (user_id.startsWith('mod')) return 'moderator';
  return 'member';
}

const FIELDS = [
  ['timestamp',  'timestamp'],
  ['session_id', 'session_id'],
  ['user_agent', 'user_agent'],
  ['jwt',        'jwt'],
  ['method',     'method'],
  ['endpoint',   'endpoint'],
  ['referrer',   'referrer']
];

// ── 1. 抽象化マッピングテーブル ─────────────────────────
//   endpoint        → use_case (レイヤ2) → type (レイヤ3)
const MAP = {
  '/login':  { use_case: 'Login',       type: 'AUTH'   },
  '/logout': { use_case: 'Logout',      type: 'AUTH'   },
  '/browse': { use_case: 'ViewPage',    type: 'READ'   },
  '/edit':   { use_case: 'EditContent', type: 'UPDATE' },
  '/profile': { use_case: 'Profile',    type: 'UPDATE' },
  '/search':  { use_case: 'Search',     type: 'READ' },
  '/api/shop/products': { use_case: 'ProductList', type: 'READ' },
  'POST /api/shop/cart': { use_case: 'CartOp', type: 'UPDATE' },
  'DELETE /api/shop/cart/:id': { use_case: 'CartOp', type: 'UPDATE' },
  '/api/shop/orders': { use_case: 'OrderList', type: 'READ' },
  '/api/shop/orders/:id': { use_case: 'OrderDetail', type: 'READ' },
  '/api/shop/pay/:id': { use_case: 'PayStatus', type: 'READ' },
  'GET /api/forum/posts': { use_case: 'Forum', type: 'READ' },
  'POST /api/forum/posts': { use_case: 'Forum', type: 'UPDATE' },
  '/api/shop/checkout': { use_case: 'Checkout', type: 'COMMIT' },
  '/api/shop/pay': { use_case: 'Payment', type: 'COMMIT' }
};
// ──────────────────────────────────────────────────────

const app = express();
// JSON および URL エンコード形式のボディをパース
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
// IPは記録しないので取得ロジックを継続するだけ
const getClientIP = req => (req.headers['x-forwarded-for'] || req.ip)
  .split(',')[0].trim();

// ── ロギングミドルウェア ─────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const now = Date.now();
    const ua = req.get('user-agent') || '-';
    const ip = getClientIP(req); // 取得のみ
    const token = req.token || (req.headers['authorization'] || '').split(' ')[1];
    const log = {
      timestamp: new Date(start).toISOString(),
      session_id: token ? token.slice(-8) : 'guest',
      user_agent: ua,
      jwt: token || '',
      method: req.method,
      endpoint: req.path,
      referrer: req.get('referer') || ''
    };
    writeLog(log);
  });
  next();
});

// ── 2. ログファイル準備 ───────────────────────────────
if (!fs.existsSync(LOG_DIR))  fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(REQUEST_LOG)) {
  const header = FIELDS.map(f => f[0]).join(',') + '\n';
  fs.writeFileSync(REQUEST_LOG, header, 'utf8');
}

function writeLog(obj) {
  const line = FIELDS.map(([_, key]) =>
    obj[key] !== undefined ? String(obj[key]) : ''
  ).join(',') + '\n';
  fs.appendFile(REQUEST_LOG, line, err => {
    if (err) console.error('Log write error:', err);
  });
}

// ── 3. JWT 認証ミドルウェア ───────────────────────────
function auth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    req.logLabel = 'no_token';
    return res.status(401).json({ error: 'No token supplied' });
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      req.logLabel = 'invalid_token';
      req.invalidPayload = extractPayload(token) || 'invalid';
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user  = decoded;  // { user_id }
    req.token = token;
    if (REVOKED.has(token)) req.tokenReuse = true;
    next();
  });
}

// ── 4. エンドポイント実装 ─────────────────────────────
// POST /login : JWT 発行
app.post('/login', (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });
  const role = getUserRole(user_id);
  const payload = { user_id, role, iat: Date.now() };
  const token   = jwt.sign(payload, SECRET, { expiresIn: '1h' });
  SESSIONS.set(token, { loginTime: Date.now(), actionCount: 0, lastAction: 'LOGIN' });
  // ログミドルウェアで正しい値を記録するために設定
  req.user  = payload;
  req.token = token;
  req.logLabel = 'normal';
  res.json({ token });
});

// GET /browse : 認証必須
app.get('/browse', auth, (req, res) => {
  req.logLabel = 'normal';
  res.json({ message: `Welcome, ${req.user.user_id}!` });
});

// POST /edit : 認証必須
app.post('/edit', auth, (req, res) => {
  req.logLabel = 'normal';
  res.json({ message: 'Edit completed (dummy).' });
});

// GET /profile : 認証必須
app.get('/profile', auth, (req, res) => {
  req.logLabel = 'normal';
  res.json({ profile: { user_id: req.user.user_id } });
});

// POST /profile : 認証必須
app.post('/profile', auth, (req, res) => {
  req.logLabel = 'normal';
  res.json({ message: 'Profile updated.' });
});

// GET /search : 認証不要
app.get('/search', (req, res) => {
  req.logLabel = 'normal';
  res.json({ results: [] });
});

// POST /logout : 認証必須
app.post('/logout', auth, (req, res) => {
  req.logLabel = 'normal';
  if (req.token) REVOKED.add(req.token);
  res.json({ message: 'Logged out.' });
});

// ── ログ取得API ─────────────────────────────
async function readChunk(start, end) {
  return new Promise((resolve, reject) => {
    let data = '';
    const s = fs.createReadStream(REQUEST_LOG, { start, end, encoding: 'utf8' });
    s.on('data', c => (data += c));
    s.on('end', () => resolve(data));
    s.on('error', reject);
  });
}

async function tailFile(lines) {
  const { size } = await fs.promises.stat(REQUEST_LOG);
  const chunk = 64 * 1024;
  const ranges = [];
  for (let pos = size; pos > 0 && ranges.length < 100; pos -= chunk) {
    ranges.push({ start: Math.max(0, pos - chunk), end: pos - 1 });
  }
  const parts = await Promise.all(ranges.map(r => readChunk(r.start, r.end)));
  const data = parts.reverse().join('');
  const arr = data.trim().split('\n');
  return arr.slice(-lines);
}

app.get('/logs', async (req, res) => {
  const n = parseInt(req.query.lines || '20', 10);
  try {
    const lines = await tailFile(n);
    res.json({ lines });
  } catch (err) {
    res.status(500).json({ error: 'log_read_failed' });
  }
});

// ── 5. サーバ起動 ────────────────────────────────────
app.listen(PORT, () =>
  console.log(`プレ版サーバ起動 → http://localhost:${PORT}`)
);
