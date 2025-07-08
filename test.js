const { spawn, spawnSync } = require('child_process');
const path = require('path');
const readline = require('readline');

function parseArgs() {
  const argv = process.argv.slice(2);
  const o = { n: DEFAULT_TOTAL, d: DEFAULT_DELAY, an: DEFAULT_TOTAL, ad: DEFAULT_DELAY };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--n') { o.n = parseInt(argv[i + 1], 10) || o.n; i++; }
    else if (argv[i] === '--d') { o.d = parseInt(argv[i + 1], 10) || o.d; i++; }
    else if (argv[i] === '--an') { o.an = parseInt(argv[i + 1], 10) || o.an; i++; }
    else if (argv[i] === '--ad') { o.ad = parseInt(argv[i + 1], 10) || o.ad; i++; }
  }
  return o;
}

const server = spawn('node', [path.join('resource', 'server.js')], {
  stdio: 'inherit'
});

const DEFAULT_TOTAL = 100;
const DEFAULT_DELAY = 100;

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = q => new Promise(resolve => rl.question(q, resolve));

  const opts = parseArgs();

  async function getNumber(val, text, def) {
    if (!isNaN(val)) return val;
    const input = parseInt(await question(text), 10);
    return isNaN(input) ? def : input;
  }

  const normalTotal = await getNumber(
    opts.n,
    `正常系列数? (default ${DEFAULT_TOTAL}): `,
    DEFAULT_TOTAL
  );
  const normalDelay = await getNumber(
    opts.d,
    `正常 delay (ms)? (default ${DEFAULT_DELAY}): `,
    DEFAULT_DELAY
  );
  const abnormalTotal = await getNumber(
    opts.an,
    `異常系列数? (default ${DEFAULT_TOTAL}): `,
    DEFAULT_TOTAL
  );
  const abnormalDelay = await getNumber(
    opts.ad,
    `異常 delay (ms)? (default ${DEFAULT_DELAY}): `,
    DEFAULT_DELAY
  );

  rl.close();

  setTimeout(() => {
    console.log('\n-- normal_logger --');
    const normalArgs = [
      path.join('resource', 'normal_logger.js'),
      '--n', String(normalTotal),
      '--d', String(normalDelay)

    ];
    spawnSync('node', normalArgs, { stdio: 'inherit' });

    console.log('\n-- abnormal_logger --');
    const abnormalArgs = [
      path.join('resource', 'abnormal_logger.js'),
      '--n', String(abnormalTotal),
      '--d', String(abnormalDelay)

    ];
    spawnSync('node', abnormalArgs, { stdio: 'inherit' });

    server.kill();
    process.exit();
  }, 1000);
})();
