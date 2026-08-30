import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { RedisMemoryServer } from 'redis-memory-server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Free ports if a previous dev:local run is still holding them
await import('./kill-ports.mjs');

const mongo = await MongoMemoryServer.create();
const redis = new RedisMemoryServer();

const mongoUri = mongo.getUri('testing_platform');
const redisHost = await redis.getHost();
const redisPort = await redis.getPort();

const env = {
  ...process.env,
  MONGODB_URI: mongoUri,
  REDIS_URL: `redis://${redisHost}:${redisPort}`,
  DEV_SKIP_RABBITMQ: 'true',
  SKIP_REDIS_RATE_LIMIT: 'true',
  JWT_SECRET: 'dev-jwt-secret',
  JWT_REFRESH_SECRET: 'dev-refresh-secret',
  AUTH_SERVICE_URL: 'http://localhost:3001',
  AI_SERVICE_URL: 'http://localhost:3002',
  EXECUTION_SERVICE_URL: 'http://localhost:3003',
  REPORT_SERVICE_URL: 'http://localhost:3004',
  NOTIFICATION_SERVICE_URL: 'http://localhost:3005',
  SCREENSHOT_DIR: path.join(root, 'screenshots'),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  ALLOW_AI_FALLBACK: 'true',
  PLAYWRIGHT_HEADLESS: process.env.PLAYWRIGHT_HEADLESS ?? 'false',
  PLAYWRIGHT_SLOW_MO: process.env.PLAYWRIGHT_SLOW_MO ?? '300',
};

const services = [
  { name: 'auth', cwd: 'services/auth-service', port: 3001 },
  { name: 'ai', cwd: 'services/ai-service', port: 3002 },
  { name: 'report', cwd: 'services/report-service', port: 3004 },
  { name: 'notification', cwd: 'services/notification-service', port: 3005 },
  { name: 'execution', cwd: 'services/execution-service', port: 3003 },
  { name: 'gateway', cwd: 'services/api-gateway', port: 3000 },
  { name: 'frontend', cwd: 'frontend', port: 5173, cmd: 'npm', args: ['run', 'dev'] },
];

const children = [];

function startService({ name, cwd, port, cmd = 'npm', args = ['run', 'dev'] }) {
  const child = spawn(cmd, args, {
    cwd: path.join(root, cwd),
    env: { ...env, PORT: String(port) },
    shell: true,
    stdio: 'inherit',
  });
  child.on('error', (err) => console.error(`[${name}] failed:`, err.message));
  children.push(child);
  console.log(`\n✓ Starting ${name} on port ${port}\n`);
}

console.log('Starting local dev infrastructure...');
console.log(`MongoDB: ${mongoUri}`);
console.log(`Redis:   redis://${redisHost}:${redisPort}`);
console.log('RabbitMQ: skipped (inline execution mode)\n');

for (const svc of services) {
  startService(svc);
  await new Promise((r) => setTimeout(r, 2000));
}

console.log('\n========================================');
console.log('  Platform is starting!');
console.log('  Frontend:  http://localhost:5173');
console.log('  API:       http://localhost:3000/api');
console.log('========================================\n');

const shutdown = async () => {
  console.log('\nShutting down...');
  children.forEach((c) => c.kill());
  await mongo.stop();
  await redis.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
