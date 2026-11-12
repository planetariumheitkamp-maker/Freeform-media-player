import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

assert.equal(process.platform, 'win32', 'Interactive native verification requires Windows.');
const root = process.cwd();
const directory = path.join(root, 'test-results', 'native-present-app');
const launcher = path.join(root, 'test-results', 'native-launcher.exe');
const pointerDrag = path.join(root, 'test-results', 'native-pointer-drag.exe');
const compiler = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
await rm(directory, { recursive: true, force: true });
await rm(path.join(root, 'artifacts', 'present-mode'), { recursive: true, force: true });
await mkdir(directory, { recursive: true });
await copyFile(path.join(root, 'scripts', 'native-present-harness.cjs'), path.join(directory, 'bootstrap.cjs'));
await copyFile(path.join(root, 'scripts', 'native-present-media.cjs'), path.join(directory, 'native-present-media.cjs'));
await writeFile(path.join(directory, 'package.json'), JSON.stringify({ name: 'freeform-present-native-test', version: '0.0.0', private: true, main: 'bootstrap.cjs' }, null, 2));
for (const [output, source] of [
  [launcher, 'native-launcher.cs'],
  [pointerDrag, 'native-pointer-drag.cs'],
  [path.join(root, 'test-results', 'native-window-style.exe'), 'native-window-style.cs'],
]) {
  execFileSync(compiler, [
    '-nologo', '-target:exe', `-out:${output}`, path.join(root, 'scripts', source),
  ], { cwd: root, stdio: 'inherit' });
}
if (process.argv.includes('--prepare-only')) {
  console.log(`Prepared ${directory}. Launch it through ${launcher} in the interactive Windows session.`);
  process.exit(0);
}
const exitCode = await new Promise((resolve, reject) => {
  const child = spawn(launcher, [directory], { cwd: root, stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', resolve);
});
// Electron's relaunch is detached from the first launcher; wait for its report instead of
// mistaking the intentionally saved `restart` checkpoint for a failed verification.
const reportPath = path.join(root, 'artifacts', 'present-mode', 'report.json');
const deadline = Date.now() + 235_000;
let report;
let readError;
while (Date.now() < deadline) {
  try {
    const candidate = JSON.parse(await readFile(reportPath, 'utf8'));
    if (candidate.status === 'passed' || candidate.status === 'failed') {
      report = candidate;
      break;
    }
  } catch (error) {
    readError = error;
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
assert(report, `Native Present verification did not finish after relaunch (exit code ${exitCode}). ${readError ?? ''}`);
console.log(JSON.stringify(report, null, 2));
assert.equal(report.status, 'passed', `Native Present verification failed with exit code ${exitCode}.`);
