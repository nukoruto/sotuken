const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const NORMAL_FILE = path.join(LOG_DIR, 'normal_log.csv');
const ABNORMAL_FILE = path.join(LOG_DIR, 'abnormal_log.csv');
const OP_FILE = path.join(LOG_DIR, 'operation_log.csv');

function countLines(file) {
  if (!fs.existsSync(file)) return 0;
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  return lines.length > 1 ? lines.length - 1 : 0; // exclude header
}

function updateOperationLog() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);
  const normalCount = countLines(NORMAL_FILE);
  const abnormalCount = countLines(ABNORMAL_FILE);
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
