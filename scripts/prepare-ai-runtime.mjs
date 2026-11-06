import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
const destination = path.join(root, 'public', 'ort');
const assets = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
];

await mkdir(destination, { recursive: true });
await Promise.all(assets.map((asset) => copyFile(
  path.join(source, asset),
  path.join(destination, asset),
)));
console.log(`Prepared ${assets.length} local ONNX Runtime assets.`);
