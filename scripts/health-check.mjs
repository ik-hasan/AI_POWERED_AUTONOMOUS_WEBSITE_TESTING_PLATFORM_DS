// Frontend runs on port 80 (nginx, via `docker compose up`) or 5173 (Vite, via
// `npm run dev:local`). Try both so health works in either mode; override with
// FRONTEND_URL if needed.
const FRONTEND_URLS = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL]
  : ['http://localhost', 'http://localhost:5173'];

const SERVICES = [
  { name: 'API Gateway', url: 'http://localhost:3000/health' },
  { name: 'Auth Service', url: 'http://localhost:3001/health' },
  { name: 'AI Service', url: 'http://localhost:3002/health' },
  { name: 'Execution Service', url: 'http://localhost:3003/health' },
  { name: 'Report Service', url: 'http://localhost:3004/health' },
  { name: 'Notification Service', url: 'http://localhost:3005/health' },
  { name: 'Frontend', urls: FRONTEND_URLS },
];

async function check(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (url.includes('/health')) {
    const data = await res.json();
    if (data.status !== 'ok') throw new Error('unhealthy');
  }
  return true;
}

// Passes if ANY of the candidate URLs responds (Docker port 80 or Vite 5173).
async function checkAny(urls) {
  let lastErr;
  for (const url of urls) {
    try {
      await check(url);
      return true;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('no URL reachable');
}

console.log('\n🏥 Platform Health Check\n' + '='.repeat(40));

let passed = 0;
let failed = 0;

for (const svc of SERVICES) {
  try {
    await (svc.urls ? checkAny(svc.urls) : check(svc.url));
    console.log(`  ✅  ${svc.name.padEnd(22)} OK`);
    passed++;
  } catch (err) {
    console.log(`  ❌  ${svc.name.padEnd(22)} FAILED (${err.message})`);
    failed++;
  }
}

console.log('='.repeat(40));
console.log(`\nResult: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('💡 Pehle platform start karo:  npm run dev:local\n');
  process.exit(1);
}

console.log('✅ Sab services chal rahi hain!\n');
console.log('Ab full test chalao:  npm run verify\n');
