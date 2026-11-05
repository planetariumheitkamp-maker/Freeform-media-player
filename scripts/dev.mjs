import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const hasOption = (name) => args.some((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
const readOption = (name) => {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith('--') ? value : null;
};

const viteArgs = [...args];
if (!hasOption('host')) viteArgs.push('--host', '127.0.0.1');
if (!hasOption('port')) viteArgs.push('--port', '5173');
if (!hasOption('strictPort')) viteArgs.push('--strictPort');
const host = readOption('host') ?? '127.0.0.1';
const port = readOption('port') ?? '5173';
const localHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
const urlHost = localHost.includes(':') && !localHost.startsWith('[') ? `[${localHost}]` : localHost;
const rendererUrl = `http://${urlHost}:${port}`;
const viteEntry = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
let electron = null;
let shuttingDown = false;

const stop = (child) => {
  if (child && child.exitCode === null && !child.killed) child.kill('SIGTERM');
};
const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  stop(electron);
  stop(vite);
  setTimeout(() => process.exit(code), 150);
};
const vite = spawn(process.execPath, [viteEntry, ...viteArgs], { cwd: root, stdio: 'inherit' });
vite.on('error', () => shutdown(1));
vite.on('exit', (code) => {
  if (!shuttingDown) shutdown(code ?? 1);
});
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', () => {
  stop(electron);
  stop(vite);
});

const waitForServer = async () => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (vite.exitCode !== null) throw new Error('Vite stopped before Electron could start.');
    try {
      const response = await fetch(rendererUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // Vite may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Vite did not become ready at ${rendererUrl}.`);
};

try {
  await waitForServer();
  const electronEnv = { ...process.env, ELECTRON_RENDERER_URL: rendererUrl };
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  electron = spawn(require('electron'), ['.'], {
    cwd: root,
    stdio: 'inherit',
    env: electronEnv,
  });
  electron.on('error', () => shutdown(1));
  electron.on('exit', (code) => {
    if (!shuttingDown) shutdown(code ?? 0);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  shutdown(1);
}
