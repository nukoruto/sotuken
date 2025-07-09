const { spawn } = require('child_process');
const path = require('path');

function run(cmd, args = []) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('error', reject);
    p.on('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

(async () => {
  const server = spawn('node', [path.join('resource', 'server.js')], {
    stdio: 'inherit'
  });

  try {
    // サーバ起動待ち
    await new Promise(r => setTimeout(r, 1000));

    // 正常ログ生成
    await run('node', [path.join('resource', 'normal_logger.js'), '--n', '10', '--d', '50']);

    // 異常ログ生成
    await run('node', [path.join('resource', 'abnormal_logger.js'), '--n', '10', '--d', '50']);

    // ディープラーニング学習ステップは MATLAB へ移行したため削除
  } finally {
    server.kill();
  }
})();
