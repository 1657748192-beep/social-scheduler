const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
function discoverTests() {
  return ['apps/api/tests', 'apps/web/tests'].flatMap(dir => fs.readdirSync(path.join(root, dir)).filter(name => /\.test\.tsx?$/.test(name)).sort().map(name => `${dir}/${name}`));
}
function environment(needsDatabase, needsLocalUploads, inherited = process.env) {
  const env = { ...inherited,
    DATABASE_URL: inherited.DATABASE_URL || 'postgresql://unused:unused@127.0.0.1:1/unused',
    REDIS_URL: inherited.REDIS_URL || 'redis://127.0.0.1:1',
    JWT_SECRET: inherited.JWT_SECRET || 'test-secret-long-enough-for-testing-only',
    TOKEN_ENCRYPTION_KEY: inherited.TOKEN_ENCRYPTION_KEY || '0'.repeat(64)
  };
  delete env.NODE_TEST_CONTEXT;
  if (needsDatabase) {
    if (!env.LOCAL_UPLOAD_TEST_DATABASE_URL) {
      const inspect = JSON.parse(cp.execFileSync('docker', ['inspect', 'codex-instagram-reception-test'], { encoding: 'utf8', timeout: 5000 }))[0];
      const bindings = inspect.NetworkSettings?.Ports?.['5432/tcp'];
      const binding = bindings?.find(b => ['127.0.0.1', '0.0.0.0'].includes(b.HostIp));
      if (inspect.Name !== '/codex-instagram-reception-test' || !inspect.State.Running || !binding) throw Error('Named local test database is unavailable');
      const values = Object.fromEntries(inspect.Config.Env.map(v => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)]; }));
      if (!values.POSTGRES_PASSWORD || !/^[0-9]+$/.test(binding.HostPort)) throw Error('Invalid local test database configuration');
      env.LOCAL_UPLOAD_TEST_DATABASE_URL = `postgresql://${encodeURIComponent(values.POSTGRES_USER || 'postgres')}:${encodeURIComponent(values.POSTGRES_PASSWORD)}@127.0.0.1:${binding.HostPort}/facebook_engagement_test?schema=public&connect_timeout=5`;
    }
    for (const key of ['SANDBOX_TEST_DATABASE_URL', 'FACEBOOK_TEST_DATABASE_URL', 'INSTAGRAM_TEST_DATABASE_URL']) env[key] ||= env.LOCAL_UPLOAD_TEST_DATABASE_URL;
    for (const key of ['LOCAL_UPLOAD_TEST_DATABASE_URL', 'SANDBOX_TEST_DATABASE_URL', 'FACEBOOK_TEST_DATABASE_URL', 'INSTAGRAM_TEST_DATABASE_URL']) {
      require('./local-upload-test-environment.cjs').validateTestDatabaseUrl(env[key], env.DATABASE_URL);
    }
  }
  if (needsLocalUploads) {
    env.LOCAL_UPLOAD_TEST_REDIS_URL ||= 'redis://127.0.0.1:55437/0';
    require('./local-upload-test-environment.cjs').validateLocalUploadTestEnvironment(env);
  }
  return env;
}
function main(args) {
  if (args[0] === '--migrate-local-upload-test-db') {
    const env = environment(true, true);
    env.DATABASE_URL = env.LOCAL_UPLOAD_TEST_DATABASE_URL;
    for (const command of ['db:deploy', 'db:generate']) {
      const result = cp.spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', command, '-w', 'apps/api'], {
        cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32'
      });
      if (result.status !== 0) return result.status || 1;
    }
    return 0;
  }
  const files = args.length ? args : discoverTests();
  for (const file of files) {
    const resolved = fs.realpathSync(path.resolve(root, file));
    if (!['apps/api/tests', 'apps/web/tests'].some(dir => resolved.startsWith(path.join(root, dir) + path.sep))) throw Error('Tests must be inside API or Web test directories');
  }
  const integration = files.some(file => file.includes('.integration.test.'));
  const local = files.some(file => /localUpload.*\.integration\.test\./.test(file));
  const result = cp.spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-concurrency=1', ...files], {
    cwd: root, env: environment(integration, local), stdio: 'inherit'
  });
  return result.status ?? 1;
}
module.exports = { discoverTests, environment };
if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch { console.error('Test configuration or process startup failed. No production fallback is allowed.'); process.exitCode = 1; }
}
