/**
 * Kiểm thử giao diện bằng trình duyệt thật (Playwright + Chromium).
 *
 * Chạy:  npm run test:ui
 * Cần:   API ở localhost:3000 và web dev server ở localhost:5173 đang chạy.
 *
 * Dữ liệu nền được dựng qua API cho nhanh và ổn định; phần bấm chuột chỉ dành
 * cho những gì thực sự phải kiểm bằng mắt: đồng hồ đếm ngược, bảng điều hướng
 * câu hỏi, chỉ báo tự động lưu, biểu đồ phổ điểm.
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
  console.log(`\n━━ ${t} ${'━'.repeat(Math.max(0, 60 - t.length))}`);

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

/** Dựng sẵn một ca thi đang mở để phần giao diện có dữ liệu thật. */
async function seed() {
  const admin = await login('admin');

  const gv = (
    await api('POST', '/users', {
      token: admin,
      body: {
        code: `UIGV${tag}`,
        email: `uigv${tag.toLowerCase()}@edu.vn`,
        fullName: 'Giảng viên Giao Diện',
        role: 'LECTURER',
      },
    })
  ).data;

  const sv = (
    await api('POST', '/users', {
      token: admin,
      body: {
        code: `UISV${tag}`,
        email: `uisv${tag.toLowerCase()}@edu.vn`,
        fullName: 'Sinh viên Giao Diện',
        role: 'STUDENT',
      },
    })
  ).data;

  const subject = (
    await api('POST', '/catalog/subjects', {
      token: admin,
      body: { code: `UI${tag}`, name: 'Giải tích giao diện', credits: 3 },
    })
  ).data;

  const chapters = [];
  for (let i = 1; i <= 2; i++) {
    chapters.push(
      (
        await api('POST', `/catalog/subjects/${subject.id}/chapters`, {
          token: admin,
          body: { code: `UC${i}`, name: `Chương ${i}`, orderIndex: i },
        })
      ).data,
    );
  }

  const gvToken = await login(`UIGV${tag}`);

  for (const ch of chapters) {
    for (const d of ['EASY', 'MEDIUM']) {
      for (let k = 0; k < 3; k++) {
        await api('POST', '/questions', {
          token: gvToken,
          body: {
            chapterId: ch.id,
            type: 'SINGLE_CHOICE',
            difficulty: d,
            content: `Tính $\\int_0^1 x^{${k + 1}}\\,dx$ với chương ${ch.code}`,
            options: ['A', 'B', 'C', 'D'].map((label, i) => ({
              label,
              content: `$\\frac{1}{${i + 2}}$`,
              isCorrect: i === k % 4,
            })),
          },
        });
      }
    }
  }

  const cc = (
    await api('POST', '/catalog/course-classes', {
      token: admin,
      body: {
        code: `UILHP${tag}`,
        name: 'Lớp giao diện',
        subjectId: subject.id,
        lecturerId: gv.id,
        semester: 'HK1 2026-2027',
        capacity: 40,
      },
    })
  ).data;

  await api('POST', `/catalog/course-classes/${cc.id}/enrollments`, {
    token: admin,
    body: { studentCodes: [sv.code] },
  });

  const now = Date.now();
  const exam = (
    await api('POST', '/exams', {
      token: gvToken,
      body: {
        title: `Ca thi giao diện ${tag}`,
        courseClassId: cc.id,
        durationMinutes: 45,
        openAt: new Date(now - 60_000).toISOString(),
        closeAt: new Date(now + 3 * 3600_000).toISOString(),
        totalScore: 10,
        resultDisplay: 'WITH_ANSWERS',
        proctoringMode: 'REMOTE',
      },
    })
  ).data;

  await api('PUT', `/exams/${exam.id}/matrix`, {
    token: gvToken,
    body: {
      items: [
        { chapterId: chapters[0].id, difficulty: 'EASY', quantity: 2 },
        { chapterId: chapters[1].id, difficulty: 'MEDIUM', quantity: 2 },
      ],
    },
  });
  await api('PATCH', `/exams/${exam.id}/publish`, { token: gvToken });

  return { gvCode: `UIGV${tag}`, svCode: `UISV${tag}`, examId: exam.id };
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  console.log(`\nKIỂM THỬ GIAO DIỆN — mã phiên ${tag}`);
  console.log(`Web: ${WEB}   API: ${API}`);

  const fixture = await seed();
  console.log(`Đã dựng ca thi ${fixture.examId}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Lỗi JavaScript trên trang là lỗi thật, phải bắt được
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const signIn = async (code) => {
    await page.goto(`${WEB}/dang-nhap`, { waitUntil: 'networkidle' });
    await page.fill('input[autocomplete="username"]', code);
    await page.fill('input[autocomplete="current-password"]', 'EduExam@123');
    await page.click('button[type="submit"]');
  };

  // ============================================================
  section('1. Đăng nhập');
  // ============================================================

  await page.goto(`${WEB}/dang-nhap`, { waitUntil: 'networkidle' });
  ok('Trang đăng nhập hiển thị', await page.locator('text=EduExam Pro').isVisible());

  await page.fill('input[autocomplete="username"]', 'admin');
  await page.fill('input[autocomplete="current-password"]', 'SaiMatKhau1');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(800);
  ok(
    'Sai mật khẩu hiện thông báo lỗi',
    await page.locator('text=Mã đăng nhập hoặc mật khẩu không đúng').isVisible(),
  );
  await page.screenshot({ path: `${SHOTS}/01-dang-nhap.png` });

  // ============================================================
  section('2. Phân hệ sinh viên — làm bài thi');
  // ============================================================

  await signIn(fixture.svCode);
  await page.waitForURL('**/ca-thi', { timeout: 15000 });
  ok('Sinh viên được đưa tới danh sách ca thi', page.url().endsWith('/ca-thi'));

  await page.waitForSelector(`text=Ca thi giao diện ${tag}`, { timeout: 10000 });
  ok('Thấy ca thi vừa dựng', true);
  ok('Ca thi hiện trạng thái Đang mở', await page.locator('text=Đang mở').first().isVisible());
  ok(
    'KHÔNG có menu quản trị trên phân hệ sinh viên',
    (await page.locator('text=Ngân hàng câu hỏi').count()) === 0,
  );
  await page.screenshot({ path: `${SHOTS}/02-ca-thi-cua-toi.png`, fullPage: true });

  await page.click('text=Vào thi');
  await page.waitForURL('**/the-le', { timeout: 10000 });
  await page.waitForSelector('h2:has-text("Thể lệ thi")', { timeout: 10000 });
  ok('Mở được trang thể lệ', true);

  const startBtn = page.locator('button:has-text("Bắt đầu làm bài")');
  ok('Chưa tick cam kết thì nút bắt đầu bị khóa', await startBtn.isDisabled());

  const boxes = page.locator('input[type="checkbox"]');
  ok('Thi từ xa hiện 2 ô cam kết (thể lệ + sinh trắc)', (await boxes.count()) === 2);
  await page.screenshot({ path: `${SHOTS}/03-the-le-thi.png`, fullPage: true });

  await boxes.nth(0).check();
  ok('Mới tick 1 ô thì vẫn chưa vào được', await startBtn.isDisabled());
  await boxes.nth(1).check();
  ok('Tick đủ 2 ô thì mở khóa nút bắt đầu', await startBtn.isEnabled());

  await startBtn.click();
  await page.waitForURL('**/thi/lam-bai/**', { timeout: 15000 });
  ok('Vào được màn làm bài', true);

  await page.waitForSelector('text=Câu 1 / 4', { timeout: 10000 });
  ok('Đề có đúng 4 câu theo ma trận', true);

  const clock = await page.locator('p.tabular-nums').first().textContent();
  ok('Đồng hồ đếm ngược hiển thị', /^\d{2}:\d{2}$/.test(clock?.trim() ?? ''), clock ?? '');

  const before = clock;
  await page.waitForTimeout(2200);
  const after = await page.locator('p.tabular-nums').first().textContent();
  ok('Đồng hồ thực sự chạy', before !== after, `${before} → ${after}`);

  ok('Công thức toán được KaTeX dựng', (await page.locator('.katex').count()) > 0);
  ok('Bảng điều hướng có 4 ô câu hỏi', (await page.locator('.grid-cols-6 button').count()) === 4);
  ok(
    'Không có menu quản trị trong màn thi',
    (await page.locator('text=Đề thi & Ma trận').count()) === 0,
  );

  // Trả lời câu 1, kiểm tra tự động lưu
  await page.locator('button[style*="min-height"]').first().click();
  await page.waitForSelector('text=Đã tự động lưu', { timeout: 10000 });
  ok('Chọn đáp án là tự động lưu ngay', true);
  ok('Tiến độ cập nhật thành 1/4', await page.locator('text=đã làm 1/4 câu').isVisible());

  await page.screenshot({ path: `${SHOTS}/04-lam-bai.png`, fullPage: true });

  // Đánh dấu xem lại
  await page.click('text=Đánh dấu xem lại');
  await page.waitForTimeout(500);
  ok('Đánh dấu xem lại hoạt động', await page.locator('text=Đã đánh dấu').isVisible());

  // Trả lời 3 câu còn lại
  for (let i = 2; i <= 4; i++) {
    await page.click(`text=Câu tiếp →`);
    await page.waitForSelector(`text=Câu ${i} / 4`);
    await page.locator('button[style*="min-height"]').first().click();
    await page.waitForTimeout(400);
  }
  ok('Trả lời hết 4 câu', await page.locator('text=đã làm 4/4 câu').isVisible());

  // Khôi phục sau khi tải lại trang
  const examUrl = page.url();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=Câu 1 / 4', { timeout: 10000 });
  ok(
    'Tải lại trang vẫn giữ nguyên 4 đáp án đã chọn',
    await page.locator('text=đã làm 4/4 câu').isVisible(),
  );
  ok('Tải lại vẫn ở đúng lượt thi cũ', page.url() === examUrl);

  await page.click('button:has-text("Nộp bài")');
  await page.waitForSelector('text=Xác nhận nộp bài', { timeout: 5000 });
  ok('Hiện hộp xác nhận trước khi nộp', true);
  await page.screenshot({ path: `${SHOTS}/05-xac-nhan-nop.png` });

  await page.click('button:has-text("Xác nhận nộp bài")');
  await page.waitForURL('**/ket-qua-cua-toi/**', { timeout: 15000 });
  ok('Nộp xong chuyển sang trang kết quả', true);

  await page.waitForSelector('text=Điểm số', { timeout: 10000 });
  ok('Trang kết quả hiện điểm', await page.locator('text=trên thang 10 điểm').isVisible());
  ok('Cho xem lại bài làm', await page.locator('text=Xem lại bài làm').isVisible());
  ok('Đánh dấu đáp án đúng', (await page.locator('text=Đáp án đúng').count()) > 0);
  await page.screenshot({ path: `${SHOTS}/06-ket-qua-sinh-vien.png`, fullPage: true });

  // ============================================================
  section('3. Phân hệ giảng viên');
  // ============================================================

  await page.click('text=Đăng xuất').catch(() => undefined);
  await signIn(fixture.gvCode);
  await page.waitForURL('**/de-thi', { timeout: 15000 });
  ok('Giảng viên được đưa tới danh sách đề thi', page.url().endsWith('/de-thi'));
  // Route nap muon: phai cho chunk tai xong roi moi kiem tra noi dung
  await page.waitForSelector(`text=Ca thi giao diện ${tag}`, { timeout: 15000 });
  ok('Thấy đề vừa tạo', true);
  await page.waitForSelector('aside nav a', { timeout: 10000 });
  const navCount = await page.locator('aside nav a').count();
  ok('Sidebar hiện đủ 4 mục nghiệp vụ', navCount >= 4, `dem duoc ${navCount}`);
  await page.screenshot({ path: `${SHOTS}/07-danh-sach-de-thi.png`, fullPage: true });

  await page.goto(`${WEB}/de-thi/${fixture.examId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Ma trận đề thi', { timeout: 10000 });
  ok('Mở được trang ma trận đề', true);
  ok('Lưới ma trận có ô nhập số', (await page.locator('input[type="number"]').count()) > 0);
  ok('Hiện tổng số câu', await page.locator('text=Tổng số câu').isVisible());
  ok(
    'Đề đã phát hành thì ô ma trận bị khóa',
    await page.locator('input[type="number"]').first().isDisabled(),
  );
  await page.screenshot({ path: `${SHOTS}/08-ma-tran-de.png`, fullPage: true });

  await page.click('text=Xem trước đề mẫu');
  await page.waitForSelector('text=Đề mẫu sinh ngẫu nhiên', { timeout: 10000 });
  await page.waitForTimeout(1200);
  ok('Xem trước đề mẫu dựng được công thức', (await page.locator('.katex').count()) > 0);
  await page.screenshot({ path: `${SHOTS}/09-xem-truoc-de.png` });
  await page.keyboard.press('Escape').catch(() => undefined);
  await page.click('[aria-label="Đóng"]').catch(() => undefined);

  await page.goto(`${WEB}/giam-sat/${fixture.examId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Giám sát hành vi thi', { timeout: 10000 });
  ok('Mở được màn giám sát', true);
  ok('Hiện thống kê sĩ số', await page.locator('text=Sĩ số ca thi').isVisible());
  ok('Thấy thí sinh trong bảng', await page.locator(`text=Sinh viên Giao Diện`).isVisible());
  await page.screenshot({ path: `${SHOTS}/10-giam-sat.png`, fullPage: true });

  await page.goto(`${WEB}/ket-qua/${fixture.examId}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Kết quả & Báo cáo', { timeout: 10000 });
  await page.waitForTimeout(1500);
  ok('Mở được trang kết quả', true);
  ok('Hiện điểm trung bình', await page.locator('text=Điểm trung bình').isVisible());

  const svg = page.locator('svg.recharts-surface');
  ok('Biểu đồ phổ điểm được dựng', (await svg.count()) > 0);
  ok('Biểu đồ có cột dữ liệu', (await page.locator('.recharts-bar-rectangle').count()) > 0);
  ok('Biểu đồ có chú giải màu', await page.locator('text=Dưới điểm đạt').isVisible());
  ok('Bảng điểm có dòng sinh viên', await page.locator(`text=${fixture.svCode}`).isVisible());
  await page.screenshot({ path: `${SHOTS}/11-ket-qua-bao-cao.png`, fullPage: true });

  await page.click('text=Phân tích câu hỏi');
  await page.waitForTimeout(1500);
  ok('Tab phân tích câu hỏi mở được', await page.locator('text=Độ khó').first().isVisible());
  await page.screenshot({ path: `${SHOTS}/12-phan-tich-cau-hoi.png`, fullPage: true });

  // ============================================================
  section('4. Giao diện trên điện thoại');
  // ============================================================

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mobile.newPage();
  await mp.goto(`${WEB}/dang-nhap`, { waitUntil: 'networkidle' });
  await mp.fill('input[autocomplete="username"]', fixture.svCode);
  await mp.fill('input[autocomplete="current-password"]', 'EduExam@123');
  await mp.click('button[type="submit"]');
  await mp.waitForURL('**/ca-thi', { timeout: 15000 });
  await mp.waitForTimeout(800);

  const overflowList = await mp.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  ok('Danh sách ca thi trên 390px không tràn ngang', !overflowList);
  await mp.screenshot({ path: `${SHOTS}/13-dien-thoai.png`, fullPage: true });

  // Man lam bai la trang quan trong nhat tren dien thoai
  await mp.goto(`${WEB}/lich-su`, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(1000);
  const overflowHistory = await mp.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  ok('Lịch sử thi trên 390px không tràn ngang', !overflowHistory);
  await mp.screenshot({ path: `${SHOTS}/14-dien-thoai-lich-su.png`, fullPage: true });
  await mobile.close();

  // ============================================================
  section('5. Lỗi JavaScript trên trang');
  // ============================================================

  const real = consoleErrors.filter(
    (e) =>
      !e.includes('favicon') &&
      !e.includes('Failed to load resource: the server responded with a status of 401') &&
      !e.includes('Failed to load resource: the server responded with a status of 400'),
  );
  ok('Không có lỗi JavaScript nào', real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();

  console.log(`\n${'━'.repeat(64)}`);
  console.log(`KẾT QUẢ: ${passed} đạt, ${failed} lỗi trên tổng ${passed + failed} phép thử`);
  if (failed > 0) {
    console.log('\nKhông đạt:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log(`\nẢnh chụp màn hình: ${SHOTS}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('\nLỖI KHÔNG BẮT ĐƯỢC:', e);
  process.exit(1);
});
