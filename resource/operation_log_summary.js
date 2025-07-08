const fs = require('fs');
const path = require('path');
const readline = require('readline');

const LOG_FILE = path.join(__dirname, 'logs', 'operation_log.csv');
if (!fs.existsSync(LOG_FILE)) {
  console.error('operation_log.csv not found');
  process.exit(1);
}

async function readLines(file) {
  const arr = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity
  });
  for await (const line of rl) arr.push(line);
  return arr;
}

(async () => {
  const lines = await readLines(LOG_FILE);
  if (lines.length <= 1) {
    console.log('ログがありません');
    process.exit(0);
  }

  console.log('行,日時,正常累計,異常累計,総数');
  lines.slice(1).forEach((line, idx) => {
    console.log(`${idx + 1},${line}`);
  });

  const last = lines[lines.length - 1].split(',');
  console.log('\n--- 最新集計 ---');
  console.log(`正常: ${last[1]}`);
  console.log(`異常: ${last[2]}`);
  console.log(`総数: ${last[3]}`);
})();
