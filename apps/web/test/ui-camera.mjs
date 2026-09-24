/**
 * Kiểm thử giám sát bằng camera (chức năng 5.9 – 5.11).
 *
 * Chạy:  npm run test:camera
 *
 * Chromium được khởi động với camera giả lập. Luồng giả không có khuôn mặt nào,
 * nên đây chính là kịch bản cần kiểm: hệ thống phải phát hiện "không thấy mặt",
 * ghi nhận vi phạm ở phía máy chủ, và gửi kèm ảnh bằng chứng.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const API = process.env.API_BASE ?? 'http://localhost:3000/api/v1';
const WEB = process.env.WEB_BASE ?? 'http://localhost:5173';
const SHOTS = process.env.SHOT_DIR ?? './test/screenshots';

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
const section = (t) =>
  console.log(`\n━━ ${t} ${'━'.repeat(Math.max(0, 58 - t.length))}`);

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, data: text ? JSON.parse(text) : null };
  } catch {
    return { status: res.status, data: text };
  }
}

const login = async (code, password = 'EduExam@123') => {
  const r = await api('POST', '/auth/login', { body: { code, password } });
  if (r.status !== 200) throw new Error(`Đăng nhập ${code} lỗi: ${JSON.stringify(r.data)}`);
  return r.data.accessToken;
};

const tag = Math.random().toString(36).slice(2, 7).toUpperCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed() {
  const admin = await login('admin');

  const gv = (await api('POST', '/users', {
    token: admin,
    body: { code: `CAMGV${tag}`, email: `camgv${tag.toLowerCase()}@edu.vn`, fullName: 'Giảng viên Camera', role: 'LECTURER' },
  })).data;

  const sv = (await api('POST', '/users', {
    token: admin,
    body: { code: `CAMSV${tag}`, email: `camsv${tag.toLowerCase()}@edu.vn`, fullName: 'Sinh viên Camera', role: 'STUDENT' },
  })).data;

  const subject = (await api('POST', '/catalog/subjects', {
    token: admin, body: { code: `CAM${tag}`, name: 'Môn kiểm thử camera', credits: 3 },
  })).data;

  const chapter = (await api('POST', `/catalog/subjects/${subject.id}/chapters`, {
    token: admin, body: { code: 'CC1', name: 'Chương 1', orderIndex: 1 },
  })).data;

  const gvToken = await login(`CAMGV${tag}`);

  for (let k = 0; k < 3; k++) {
    await api('POST', '/questions', {
      token: gvToken,
      body: {
        chapterId: chapter.id, type: 'SINGLE_CHOICE', difficulty: 'EASY',
        content: `Câu hỏi kiểm thử camera số ${k + 1}: $\\int_0^1 x\\,dx$`,
        options: ['A', 'B', 'C', 'D'].map((label, i) => ({
          label, content: `$\\frac{1}{${i + 2}}$`, isCorrect: i === 0,
        })),
      },
    });
  }

  const cc = (await api('POST', '/catalog/course-classes', {
    token: admin,
    body: { code: `CAMLHP${tag}`, name: 'Lớp camera', subjectId: subject.id, lecturerId: gv.id, semester: 'HK1 2026-2027', capacity: 10 },
  })).data;

  await api('POST', `/catalog/course-classes/${cc.id}/enrollments`, {
    token: admin, body: { studentCodes: [sv.code] },
  });

  const now = Date.now();
  const exam = (await api('POST', '/exams', {
    token: gvToken,
    body: {
      title: `Ca thi camera ${tag}`,
      courseClassId: cc.id, durationMinutes: 45,
      openAt: new Date(now - 60_000).toISOString(),
      closeAt: new Date(now + 3 * 3600_000).toISOString(),
      totalScore: 10, resultDisplay: 'WITH_ANSWERS',
      proctoringMode: 'REMOTE',
    },
  })).data;

  // Hạ ngưỡng vắng mặt xuống 2 giây để không phải chờ 10 giây mặc định,
  // và nâng ngưỡng huỷ bài để bài không bị tự nộp giữa chừng khi đang kiểm.
  await api('PATCH', `/exams/${exam.id}/policy`, {
    token: gvToken,
    body: {
      thresholds: { blurMs: 3000, heartbeatTimeoutS: 90, faceAbsentMs: 2000, maxViolations: 20 },
      actionOnExceed: 'FLAG',
    },
  });

  await api('PUT', `/exams/${exam.id}/matrix`, {
    token: gvToken,
    body: { items: [{ chapterId: chapter.id, difficulty: 'EASY', quantity: 3 }] },
  });
  await api('PATCH', `/exams/${exam.id}/publish`, { token: gvToken });

  return { gvCode: `CAMGV${tag}`, svCode: `CAMSV${tag}`, examId: exam.id };
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  console.log(`\nKIỂM THỬ GIÁM SÁT CAMERA — mã phiên ${tag}`);

  const fx = await seed();
  console.log(`Ca thi ${fx.examId}, ngưỡng vắng mặt hạ xuống 2 giây\n`);

  const browser = await chromium.launch({
    args: [
      // Tự cấp quyền camera, không hiện hộp thoại
      '--use-fake-ui-for-media-stream',
      // Luồng video tổng hợp — cố ý KHÔNG có khuôn mặt nào
      '--use-fake-device-for-media-stream',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['camera'],
  });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') errors.push(t);
    // In ra cảnh báo của lớp giám sát để gỡ lỗi khi nhận diện không chạy
    if (t.includes('[proctoring]')) console.log('    [trinh duyet]', t.slice(0, 200));
  });

  // ============================================================
  section('1. Kiểm tra thiết bị trước khi thi');
  // ============================================================

  await page.goto(`${WEB}/dang-nhap`, { waitUntil: 'networkidle' });
  await page.fill('input[autocomplete="username"]', fx.svCode);
  await page.fill('input[autocomplete="current-password"]', 'EduExam@123');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/ca-thi', { timeout: 15000 });

  await page.waitForSelector(`text=Ca thi camera ${tag}`, { timeout: 10000 });
  await page.click('text=Vào thi');
  await page.waitForSelector('h2:has-text("Thể lệ thi")', { timeout: 10000 });

  ok('Thể lệ nêu rõ video không rời khỏi máy', await page.locator('text=Video không rời khỏi máy của bạn').isVisible());
  ok('Có nút thử camera trước khi vào thi', await page.locator('button:has-text("Thử camera")').isVisible());

  await page.click('button:has-text("Thử camera")');
  await page.waitForSelector('text=Camera hoạt động bình thường', { timeout: 15000 });
  ok('Thử camera báo hoạt động bình thường', true);
  await page.screenshot({ path: `${SHOTS}/C1-kiem-tra-camera.png`, fullPage: true });

  // ============================================================
  section('2. Camera trong màn làm bài');
  // ============================================================

  const boxes = page.locator('input[type="checkbox"]');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  await page.click('button:has-text("Bắt đầu làm bài")');
  await page.waitForURL('**/thi/lam-bai/**', { timeout: 15000 });

  await page.waitForSelector('text=Giám sát camera', { timeout: 20000 });
  ok('Khung giám sát camera hiện trên giao diện', true);
  ok('Có thẻ video', (await page.locator('video').count()) === 1);

  // MediaPipe phải nạp 11 MB WASM lần đầu
  console.log('  ... đang chờ MediaPipe nạp và nhận diện');
  await page.waitForSelector('text=khuôn mặt', { timeout: 60000 });
  ok('Bộ nhận diện khởi động xong', true);

  const videoLive = await page.evaluate(() => {
    const v = document.querySelector('video');
    return !!v && v.readyState >= 2 && v.videoWidth > 0;
  });
  ok('Luồng camera thực sự phát', videoLive);

  await page.waitForSelector('text=Không phát hiện khuôn mặt', { timeout: 30000 });
  ok('Nhận đúng: luồng giả không có khuôn mặt nào', true);
  await page.screenshot({ path: `${SHOTS}/C2-camera-trong-ca-thi.png`, fullPage: true });

  // ============================================================
  section('3. Máy chủ ghi nhận vi phạm');
  // ============================================================

  // Ngưỡng 2 giây + chu kỳ gửi lô 5 giây, chờ vài chu kỳ cho chắc
  console.log('  ... chờ tín hiệu được gửi lên máy chủ');
  await sleep(16000);

  await page.waitForSelector('text=Vi phạm', { timeout: 20000 });
  ok('Giao diện hiện số vi phạm cho thí sinh thấy', true);
  await page.screenshot({ path: `${SHOTS}/C3-canh-bao-vi-pham.png`, fullPage: true });

  const gvToken = await login(fx.gvCode);
  const mon = await api('GET', `/proctoring/exams/${fx.examId}/monitor`, { token: gvToken });
  const row = mon.data?.rows?.[0];
  ok('Màn giám sát thấy thí sinh', !!row, JSON.stringify(mon.data?.stats));
  ok('Máy chủ đã ghi nhận vi phạm', (row?.violationCount ?? 0) > 0, `dem duoc ${row?.violationCount}`);

  const attemptId = row.attemptId;
  const tl = await api('GET', `/proctoring/attempts/${attemptId}/timeline`, { token: gvToken });
  const faceViolations = tl.data.violations.filter((v) => v.type === 'FACE_ABSENT');
  ok('Có vi phạm loại FACE_ABSENT', faceViolations.length > 0,
    `cac loai: ${[...new Set(tl.data.violations.map((v) => v.type))].join(', ')}`);

  const faceEvents = tl.data.events.filter((e) => String(e.type).startsWith('FACE'));
  ok('Sự kiện thô từ camera được lưu lại', faceEvents.length > 0, `${faceEvents.length} su kien`);

  // ============================================================
  section('4. Ảnh bằng chứng');
  // ============================================================

  const withEvidence = tl.data.violations.filter((v) => v.evidenceUrl);
  ok('Vi phạm có kèm ảnh bằng chứng', withEvidence.length > 0,
    `${withEvidence.length}/${tl.data.violations.length} vi pham co anh`);

  if (withEvidence.length > 0) {
    const url = withEvidence[0].evidenceUrl;
    const res = await fetch(`${API}${url}`, { headers: { Authorization: `Bearer ${gvToken}` } });
    const buf = Buffer.from(await res.arrayBuffer());
    ok('Giảng viên tải được ảnh', res.status === 200, `HTTP ${res.status}`);
    ok('Ảnh đúng định dạng JPEG', buf[0] === 0xff && buf[1] === 0xd8, `${buf.length} bytes`);
    ok('Ảnh đã được nén nhỏ lại', buf.length < 200_000, `${Math.round(buf.length / 1024)} KB`);

    const svToken = await login(fx.svCode);
    const denied = await fetch(`${API}${url}`, { headers: { Authorization: `Bearer ${svToken}` } });
    ok('Sinh viên KHÔNG xem được ảnh bằng chứng', denied.status === 403, `HTTP ${denied.status}`);

    const anon = await fetch(`${API}${url}`);
    ok('Không đăng nhập thì KHÔNG xem được', anon.status === 401, `HTTP ${anon.status}`);
  }

  // ============================================================
  section('5. Giảng viên xem nhật ký kèm ảnh');
  // ============================================================

  const gvPage = await context.newPage();
  await gvPage.goto(`${WEB}/dang-nhap`, { waitUntil: 'networkidle' });
  await gvPage.fill('input[autocomplete="username"]', fx.gvCode);
  await gvPage.fill('input[autocomplete="current-password"]', 'EduExam@123');
  await gvPage.click('button[type="submit"]');
  await gvPage.waitForURL('**/de-thi', { timeout: 15000 });

  await gvPage.goto(`${WEB}/giam-sat/${fx.examId}`, { waitUntil: 'networkidle' });
  await gvPage.waitForSelector('text=Sinh viên Camera', { timeout: 15000 });
  await gvPage.click('text=Dòng thời gian');
  await gvPage.waitForSelector('text=Các lần vi phạm', { timeout: 15000 });
  await gvPage.waitForTimeout(2500);

  const thumbs = await gvPage.locator('img[alt*="bằng chứng"]').count();
  ok('Nhật ký hiển thị ảnh bằng chứng', thumbs > 0, `${thumbs} anh`);
  await gvPage.screenshot({ path: `${SHOTS}/C4-nhat-ky-kem-anh.png`, fullPage: true });

  // ============================================================
  section('6. Lỗi JavaScript');
  // ============================================================

  const real = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('status of 401') && !e.includes('status of 400'),
  );
  ok('Không có lỗi JavaScript', real.length === 0, real.slice(0, 2).join(' | '));

  await browser.close();

  console.log(`\n${'━'.repeat(62)}`);
  console.log(`KẾT QUẢ: ${passed} đạt, ${failed} lỗi trên tổng ${passed + failed} phép thử`);
  if (failed > 0) {
    console.log('\nKhông đạt:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log(`\nẢnh chụp: ${SHOTS}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('\nLỖI KHÔNG BẮT ĐƯỢC:', e);
  process.exit(1);
});
