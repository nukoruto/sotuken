const fs = require('fs');
const path = require('path');

const readline = require('readline');

const LOG_DIR = path.join(__dirname, 'logs');
const NORMAL_FILE = path.join(LOG_DIR, 'normal_log.csv');
const ABNORMAL_FILE = path.join(LOG_DIR, 'abnormal_log.csv');
const OP_FILE = path.join(LOG_DIR, 'operation_log.csv');
async function countLines(file) {
  if (!fs.existsSync(file)) return 0;
  let count = -1; // exclude header
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity
  });
  for await (const _ of rl) count++;
  return Math.max(count, 0);
}

async function updateOperationLog() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
  const [normalCount, abnormalCount] = await Promise.all([
    countLines(NORMAL_FILE),
    countLines(ABNORMAL_FILE)
  ]);
  const total = normalCount + abnormalCount;

  const header = 'timestamp,normal_count,abnormal_count,total\n';
  if (!fs.existsSync(OP_FILE)) {
    fs.writeFileSync(OP_FILE, header);
  }

  const line = `${new Date().toISOString()},${normalCount},${abnormalCount},${total}\n`;
  fs.appendFileSync(OP_FILE, line);
}

if (require.main === module) {
  updateOperationLog();
}
module.exports = updateOperationLog;
