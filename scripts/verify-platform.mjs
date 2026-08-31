const API = process.env.API_URL || 'http://localhost:3000/api';
const WS_URL = process.env.WS_URL || 'http://localhost:3005';

const log = (step, msg) => console.log(`  ${step}  ${msg}`);
const ok = (msg) => log('✅', msg);
const fail = (msg) => { log('❌', msg); throw new Error(msg); };

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(options.timeout || 60000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) fail(`${options.method || 'GET'} ${path} → ${data.error || res.status}`);
  return data;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForExecution(token, executionId, maxWait = 90000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await api(`/executions/${executionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const status = res.data.status;
    process.stdout.write(`\r  ⏳  Execution status: ${status} (${res.data.progress || 0}%)   `);
    if (['passed', 'failed', 'cancelled'].includes(status)) {
      console.log('');
      return res.data;
    }
    await sleep(2000);
  }
  fail('Execution timeout — 90s se zyada wait ho gaya');
}

async function checkWebSocket() {
  try {
    const { io } = await import('socket.io-client');
    return new Promise((resolve, reject) => {
      const socket = io(WS_URL, { transports: ['websocket'], timeout: 5000 });
      const timer = setTimeout(() => { socket.disconnect(); reject(new Error('timeout')); }, 5000);
      socket.on('connect', () => { clearTimeout(timer); socket.disconnect(); resolve(true); });
      socket.on('connect_error', (err) => { clearTimeout(timer); reject(err); });
    });
  } catch {
    return false;
  }
}

console.log('\n🧪 Platform End-to-End Verification\n' + '='.repeat(45));

const suffix = Date.now();
const email = `testuser_${suffix}@test.com`;
const password = 'TestPass123!';
let token = '';

try {
  // 1. Health
  log('1/9', 'Health check...');
  const health = await fetch('http://localhost:3000/health', { signal: AbortSignal.timeout(5000) });
  if (!health.ok) fail('API Gateway down hai');
  ok('API Gateway healthy');

  // 2. Register
  log('2/9', 'User register...');
  const reg = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name: 'Test User' }),
  });
  token = reg.data.tokens.accessToken;
  ok(`Registered: ${email} (role: ${reg.data.user.role})`);

  // 3. Auth me
  log('3/9', 'Auth /me check...');
  const me = await api('/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  ok(`Logged in as: ${me.data.name}`);

  // 4. Project
  log('4/9', 'Project create...');
  const project = await api('/projects', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'E2E Test Project', description: 'Automated verification run' }),
  });
  const projectId = project.data._id;
  ok(`Project created: ${projectId}`);

  // 5. Website
  log('5/9', 'Website add...');
  const website = await api('/websites', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      projectId,
      name: 'Example.com',
      url: 'https://example.com',
      description: 'Test target',
    }),
  });
  const websiteId = website.data._id;
  ok(`Website added: https://example.com`);

  // 6. AI test generation
  log('6/9', 'AI test generate...');
  const generated = await api('/ai/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      projectId,
      websiteId,
      websiteUrl: 'https://example.com',
      prompt: 'Navigate to example.com, wait for page to load, verify the page body is visible, take a screenshot',
      title: 'E2E Smoke Test',
    }),
  });
  const testCaseId = generated.data.testCase._id;
  const steps = generated.data.testCase.steps?.length || 0;
  ok(`Test case created: ${testCaseId} (${steps} steps)`);

  // 7. Execute test
  log('7/9', 'Test execution start...');
  const exec = await api('/executions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ testCaseId, parallelWorkers: 1, maxRetries: 1 }),
  });
  const executionId = exec.data._id;
  ok(`Execution queued: ${executionId}`);

  // 8. Wait for result
  log('8/9', 'Playwright execution (wait)...');
  const result = await waitForExecution(token, executionId);
  if (result.status === 'passed') {
    ok(`Execution PASSED in ${((result.duration || 0) / 1000).toFixed(1)}s`);
  } else {
    fail(`Execution FAILED: status=${result.status}`);
  }

  // 9. Report + Analytics + WebSocket
  log('9/9', 'Report & analytics check...');
  const reports = await api(`/reports?projectId=${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!reports.data?.data?.length) fail('Koi report nahi mili');
  ok(`Report found: ${reports.data.data[0].title}`);

  const analytics = await api(`/analytics?projectId=${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  ok(`Analytics: ${analytics.data.totalExecutions} execution(s), ${analytics.data.successRate}% success`);

  const wsOk = await checkWebSocket();
  if (wsOk) ok('WebSocket (Socket.io) connected');
  else log('⚠️', 'WebSocket check skip (optional)');

  console.log('\n' + '='.repeat(45));
  console.log('\n🎉 SAB KUCH SAHI CHAL RAHA HAI!\n');
  console.log('Manual check ke liye kholo: http://localhost:5173');
  console.log(`Login: ${email} / ${password}\n`);

} catch (err) {
  console.log('\n' + '='.repeat(45));
  console.log(`\n❌ VERIFICATION FAILED: ${err.message}\n`);
  console.log('Fix steps:');
  console.log('  1. npm run dev:local     (platform start karo)');
  console.log('  2. npm run health        (services check karo)');
  console.log('  3. npm run verify        (dobara test karo)\n');
  process.exit(1);
}
