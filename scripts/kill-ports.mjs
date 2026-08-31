import { execSync } from 'child_process';

const PORTS = [3000, 3001, 3002, 3003, 3004, 3005, 5173, 5174];

function killPort(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr ":${port}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const pids = new Set();
      for (const line of output.split('\n')) {
        if (!line.includes('LISTENING')) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0') pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
          console.log(`  Freed port ${port} (PID ${pid})`);
        } catch { /* already gone */ }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: 'ignore', shell: true });
      console.log(`  Freed port ${port}`);
    }
  } catch {
    // Port not in use
  }
}

console.log('Checking for stale processes on platform ports...');
for (const port of PORTS) {
  killPort(port);
}
console.log('Port cleanup done.\n');
