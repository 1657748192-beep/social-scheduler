const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
function endpoint(value, kind) {
  const url = new URL(value);
  const host = url.hostname === 'localhost' ? '127.0.0.1' : url.hostname;
  return `${host}:${url.port || (kind === 'database' ? '5432' : '6379')}/${decodeURIComponent(url.pathname.slice(1)) || (kind === 'redis' ? '0' : '')}`;
}
function validateService(value, kind, application, key) {
    if (!value) throw Error(`${key} is required`);
    let url;
    try { url = new URL(value); } catch { throw Error(`${key} must be a valid local test URL`); }
    if (!localHosts.has(url.hostname) || !(kind === 'database' ? /^postgres(ql)?:$/ : /^rediss?:$/).test(url.protocol)) {
      throw Error(`${key} must point to a local test service`);
    }
    if (kind === 'database' && !/^\/[a-zA-Z0-9_]+_test$/.test(decodeURIComponent(url.pathname))) throw Error('Test database name must end in _test');
    if (application && endpoint(value, kind) === endpoint(application, kind)) throw Error(`${key} must not use the application service`);
}
function validateTestDatabaseUrl(value, application) { validateService(value, 'database', application, 'Integration test database URL'); }
function validateLocalUploadTestEnvironment(env) {
  validateService(env.LOCAL_UPLOAD_TEST_DATABASE_URL, 'database', env.DATABASE_URL, 'LOCAL_UPLOAD_TEST_DATABASE_URL');
  validateService(env.LOCAL_UPLOAD_TEST_REDIS_URL, 'redis', env.REDIS_URL, 'LOCAL_UPLOAD_TEST_REDIS_URL');
  return { databaseUrl: env.LOCAL_UPLOAD_TEST_DATABASE_URL, redisUrl: env.LOCAL_UPLOAD_TEST_REDIS_URL };
}
module.exports = { validateLocalUploadTestEnvironment, validateTestDatabaseUrl };
