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

  let total = parseInt(process.argv[2] || '', 10);
  if (isNaN(total)) {
    total = parseInt(await question(`系列数 total? (default ${DEFAULT_TOTAL}): `), 10);
    if (isNaN(total)) total = DEFAULT_TOTAL;
  }

  let delay = parseInt(process.argv[3] || '', 10);
  if (isNaN(delay)) {
    delay = parseInt(await question(`delay (ms)? (default ${DEFAULT_DELAY}): `), 10);
    if (isNaN(delay)) delay = DEFAULT_DELAY;
  }
  rl.close();

  setTimeout(() => {
    console.log('\n-- normal_logger --');
    const normalArgs = [
      path.join('resource', 'normal_logger.js'),
      String(total),
      String(delay)
    ];
    spawnSync('node', normalArgs, { stdio: 'inherit' });

    console.log('\n-- abnormal_logger --');
    const abnormalArgs = [
      path.join('resource', 'abnormal_logger.js'),
      String(total),
      String(delay)
    ];
    spawnSync('node', abnormalArgs, { stdio: 'inherit' });

    server.kill();
    process.exit();
  }, 1000);
})();
