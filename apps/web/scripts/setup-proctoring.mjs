/**
 * Tải về bộ nhận diện khuôn mặt cho chế độ thi từ xa.
 *
 * Chạy:  npm run setup:proctoring
 *
 * WASM và model KHÔNG commit vào git (23 MB), nhưng cũng KHÔNG tải từ CDN lúc
 * thi — phòng thi mất mạng ra Internet vẫn phải thi được. Nên tải về một lần
 * rồi phục vụ từ chính máy chủ của hệ thống.
 */
import { mkdir, copyFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const wasmOut = join(root, 'public/mediapipe/wasm');
const modelOut = join(root, 'public/mediapipe/models');
const wasmSrc = join(root, '../../node_modules/@mediapipe/tasks-vision/wasm');

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

// Bỏ biến thể *_module_* — chỉ dùng cho ES module build, không cần ở đây
const KEEP = /^vision_wasm_(internal|nosimd_internal)\.(js|wasm)$/;

await mkdir(wasmOut, { recursive: true });
await mkdir(modelOut, { recursive: true });

if (!existsSync(wasmSrc)) {
  console.error('Chưa cài @mediapipe/tasks-vision. Chạy `npm install` trước.');
  process.exit(1);
}

let copied = 0;
for (const name of await readdir(wasmSrc)) {
  if (!KEEP.test(name)) continue;
  await copyFile(join(wasmSrc, name), join(wasmOut, name));
  copied++;
}
console.log(`Đã chép ${copied} tệp WASM.`);

const modelPath = join(modelOut, 'blaze_face_short_range.tflite');
if (existsSync(modelPath)) {
  const { size } = await stat(modelPath);
  console.log(`Model đã có sẵn (${Math.round(size / 1024)} KB), bỏ qua tải lại.`);
} else {
  console.log('Đang tải model nhận diện khuôn mặt...');
  const res = await fetch(MODEL_URL);
  if (!res.ok) {
    console.error(`Tải model thất bại: HTTP ${res.status}`);
    process.exit(1);
  }
  await writeFile(modelPath, Buffer.from(await res.arrayBuffer()));
  const { size } = await stat(modelPath);
  console.log(`Đã tải model (${Math.round(size / 1024)} KB).`);
}

console.log('Xong. Chế độ thi từ xa đã sẵn sàng.');
