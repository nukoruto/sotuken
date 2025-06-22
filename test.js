const { spawn, spawnSync } = require('child_process');
const path = require('path');

const server = spawn('node', [path.join('resource', 'server.js')], {
  stdio: 'inherit'
});

setTimeout(() => {
  console.log('\n-- normal_logger --');
  spawnSync('node', [path.join('resource', 'normal_logger.js')], { stdio: 'inherit' });

  console.log('\n-- abnormal_logger --');
  spawnSync('node', [path.join('resource', 'abnormal_logger.js')], { stdio: 'inherit' });

  server.kill();
  process.exit();
}, 1000);
