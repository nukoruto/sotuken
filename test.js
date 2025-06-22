const { spawn, spawnSync } = require('child_process');
const path = require('path');
const readline = require('readline');

const server = spawn('node', [path.join('resource', 'server.js')], {
  stdio: 'inherit'
});

const DEFAULT_TOTAL = 100;
const DEFAULT_DELAY = 100;

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = q => new Promise(resolve => rl.question(q, resolve));

  const args = process.argv.slice(2).map(v => parseInt(v, 10));

  async function getNumber(val, text, def) {
    if (!isNaN(val)) return val;
    const input = parseInt(await question(text), 10);
    return isNaN(input) ? def : input;
  }

  const normalTotal = await getNumber(
    args[0],
    `正常系列数? (default ${DEFAULT_TOTAL}): `,
    DEFAULT_TOTAL
  );
  const normalDelay = await getNumber(
    args[1],
    `正常 delay (ms)? (default ${DEFAULT_DELAY}): `,
    DEFAULT_DELAY
  );
  const abnormalTotal = await getNumber(
    args[2],
    `異常系列数? (default ${DEFAULT_TOTAL}): `,
    DEFAULT_TOTAL
  );
  const abnormalDelay = await getNumber(
    args[3],
    `異常 delay (ms)? (default ${DEFAULT_DELAY}): `,
    DEFAULT_DELAY
  );
  rl.close();

  setTimeout(() => {
    console.log('\n-- normal_logger --');
    const normalArgs = [
      path.join('resource', 'normal_logger.js'),
      String(normalTotal),
      String(normalDelay)
    ];
    spawnSync('node', normalArgs, { stdio: 'inherit' });

    console.log('\n-- abnormal_logger --');
    const abnormalArgs = [
      path.join('resource', 'abnormal_logger.js'),
      String(abnormalTotal),
      String(abnormalDelay)
    ];
    spawnSync('node', abnormalArgs, { stdio: 'inherit' });

    server.kill();
    process.exit();
  }, 1000);
})();
