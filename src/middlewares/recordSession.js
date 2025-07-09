const crypto = require('crypto');
const csv = require('../utils/csvWriter');
const { v4: uuid } = require('uuid');

const jpOctets = new Set([43,49,58,59,60,61,101,103,106,110,111,112,113,114,
 115,116,118,119,120,121,122,123,124,125,126,133,150,153,175,180,182,183,202,
 203,210,211,219,220,221,222]);
function lookupRegion(ip) {
  if (!ip) return '-';
  const first = parseInt(ip.split('.')[0], 10);
  if (jpOctets.has(first)) return 'JP';
  if (first <= 126) return 'NA';
  if (first <= 191) return 'EU';
  if (first <= 223) return 'AP';
  return '-';
}

// セッションおよびトークン単位の状態保存
// last プロパティに最終アクセス時刻を保持する
const sessions = new Map(); // session_id -> {start,last,prev,repeat,lastBodyKeys}
const tokenMap = new Map(); // token -> {ip, ua, last}

// エントリ保持期間 (1時間)
const EXPIRE_MS = 60 * 60 * 1000;
const CLEAN_INTERVAL_MS = 10 * 60 * 1000; // 定期クリーンアップ間隔

function cleanupStale() {
  const cutoff = Date.now() - EXPIRE_MS;
  for (const [sid, info] of sessions) {
    const last = info.last || info.start;
    if (last < cutoff) sessions.delete(sid);
  }
  for (const [token, obj] of tokenMap) {
    if ((obj.last || 0) < cutoff) tokenMap.delete(token);
  }
}

setInterval(cleanupStale, CLEAN_INTERVAL_MS);

module.exports = function recordSession(req, res, next) {
  // セッションIDの取得・生成
  let sid = req.cookies && req.cookies.sid;
  if (!sid) {
    sid = uuid();
    res.cookie('sid', sid, { httpOnly: true });
  }

  // セッション情報の取得・初期化
  let info = sessions.get(sid);
  if (!info) {
    const now = Date.now();
    info = { start: now, last: now, prev: '-', repeat: 0, lastBodyKeys: {} };
    sessions.set(sid, info);
  }

  res.on('finish', () => {
    const now = Date.now();

    const ua  = req.get('user-agent') || '-';
    const ref = req.get('referer') || '-';
    const ip  = req.ip;
    const auth = req.get('authorization');

    csv.writeRecords([{
      ts: new Date(now).toISOString(),
      session_id: sid,
      ip,
      user_agent: ua,
      jwt: auth ? auth.split(' ')[1] : '-',
      method: req.method,
      url: req.originalUrl,
      referer: ref
    }]).catch(console.error);

    info.last = now;
  });

  next();
};

module.exports.sessions = sessions;
module.exports.tokenMap = tokenMap;
module.exports.cleanupStale = cleanupStale;
module.exports.EXPIRE_MS = EXPIRE_MS;
