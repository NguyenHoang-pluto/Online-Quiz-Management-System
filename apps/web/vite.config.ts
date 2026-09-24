import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

/**
 * Chế độ chia sẻ qua mạng LAN — bật bằng `npm run share`.
 *
 * Phải chạy HTTPS chứ không dùng được HTTP: trình duyệt chỉ cho phép
 * navigator.mediaDevices trên origin an toàn (https hoặc localhost). Máy bạn
 * học vào bằng http://192.168.x.x sẽ không mở được camera, mà ca thi TỪ XA lại
 * bắt buộc có camera — hệ thống sẽ ghi nhận CAMERA_BLOCKED và cộng dồn vi phạm.
 *
 * Chứng chỉ là loại tự ký nên lần đầu vào trình duyệt vẫn cảnh báo, bấm
 * "Nâng cao" rồi "Tiếp tục" là dùng được; sau đó origin vẫn được coi là an toàn.
 * Ngày thường không đặt EDUEXAM_SHARE thì vẫn chạy HTTP như cũ, khỏi vướng cảnh báo.
 */
const certDir = fileURLToPath(new URL('../../certs', import.meta.url));
const keyPath = `${certDir}/dev-key.pem`;
const certPath = `${certDir}/dev-cert.pem`;
const shareHttps =
  process.env.EDUEXAM_SHARE === '1' && existsSync(keyPath) && existsSync(certPath)
    ? { key: readFileSync(keyPath), cert: readFileSync(certPath) }
    : undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    https: shareHttps,
    proxy: {
      // Gọi API qua cùng origin để cookie httpOnly hoạt động khi dev
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
