/**
 * Kiểm thử end-to-end trọn vòng đời một kỳ thi.
 *
 * Chạy:  npm run test:e2e:flow   (API phải đang chạy ở localhost:3000)
 *
 * Kịch bản:
 *   Admin    tạo môn học, chương, giảng viên, sinh viên, lớp học phần
 *   Giảng viên soạn ngân hàng câu hỏi, dựng ma trận đề, phát hành
 *   3 sinh viên làm bài với 3 mức độ đúng khác nhau
 *   Kiểm tra chấm điểm, giám sát hành vi, báo cáo và phân tích câu hỏi
 *   Kèm các phép thử bảo mật: rò rỉ đáp án, vượt quyền, khóa dải IP
 */

const BASE = process.env.API_BASE ?? 'http://localhost:3000/api/v1';

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n━━ ${title} ${'━'.repeat(Math.max(0, 62 - title.length))}`);
}

async function api(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (raw) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()) };

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

const login = async (code, password = 'EduExam@123') => {
  const r = await api('POST', '/auth/login', { body: { code, password } });
  if (r.status !== 200) throw new Error(`Đăng nhập ${code} thất bại: ${JSON.stringify(r.data)}`);
  return r.data.accessToken;
};

/** Quét đệ quy tìm một khóa trong JSON — dùng để chứng minh không rò rỉ đáp án. */
function findKeyDeep(obj, key, path = '$') {
  if (obj === null || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const hit = findKeyDeep(obj[i], key, `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === key) return `${path}.${k}`;
    const hit = findKeyDeep(v, key, `${path}.${k}`);
    if (hit) return hit;
  }
  return null;
}

const uniq = () => Math.random().toString(36).slice(2, 8).toUpperCase();

async function main() {
  const tag = uniq();
  console.log(`\nKIỂM THỬ END-TO-END — mã phiên ${tag}`);
  console.log(`API: ${BASE}`);

  // ============================================================
  section('1. Xác thực và phân quyền');
  // ============================================================

  const admin = await login('admin');
  ok('Admin đăng nhập', !!admin);

  const bad = await api('POST', '/auth/login', {
    body: { code: 'admin', password: 'SaiMatKhau1' },
  });
  ok('Sai mật khẩu bị từ chối', bad.status === 401);

  const noToken = await api('GET', '/catalog/subjects');
  ok('Không token bị chặn', noToken.status === 401);

  // ============================================================
  section('2. Module 1 — Danh mục và tài khoản');
  // ============================================================

  const lecturer = await api('POST', '/users', {
    token: admin,
    body: {
      code: `GV-${tag}`,
      email: `gv.${tag.toLowerCase()}@edu.vn`,
      fullName: 'Giảng viên Kiểm Thử',
      role: 'LECTURER',
    },
  });
  ok('Tạo giảng viên', lecturer.status === 201, JSON.stringify(lecturer.data));
  ok('Không trả passwordHash', !findKeyDeep(lecturer.data, 'passwordHash'));

  const students = [];
  for (let i = 1; i <= 3; i++) {
    const r = await api('POST', '/users', {
      token: admin,
      body: {
        code: `SV-${tag}-${i}`,
        email: `sv${i}.${tag.toLowerCase()}@edu.vn`,
        fullName: `Sinh viên ${i}`,
        role: 'STUDENT',
      },
    });
    students.push(r.data);
  }
  ok('Tạo 3 sinh viên', students.every((s) => s?.id));

  const dupe = await api('POST', '/users', {
    token: admin,
    body: {
      code: `GV-${tag}`,
      email: `khac.${tag.toLowerCase()}@edu.vn`,
      fullName: 'Trùng mã',
      role: 'LECTURER',
    },
  });
  ok('Trùng mã đăng nhập bị chặn', dupe.status === 400);

  const subject = await api('POST', '/catalog/subjects', {
    token: admin,
    body: { code: `SUB${tag}`, name: 'Môn Kiểm Thử', credits: 3 },
  });
  ok('Tạo môn học', subject.status === 201);

  const chapters = [];
  for (let i = 1; i <= 3; i++) {
    const r = await api('POST', `/catalog/subjects/${subject.data.id}/chapters`, {
      token: admin,
      body: { code: `C${i}`, name: `Chương ${i}`, orderIndex: i },
    });
    chapters.push(r.data);
  }
  ok('Tạo 3 chương', chapters.every((c) => c?.id));

  const courseClass = await api('POST', '/catalog/course-classes', {
    token: admin,
    body: {
      code: `LHP-${tag}`,
      name: 'Lớp Kiểm Thử',
      subjectId: subject.data.id,
      lecturerId: lecturer.data.id,
      semester: 'HK1 2026-2027',
      capacity: 50,
    },
  });
  ok('Tạo lớp học phần', courseClass.status === 201);

  const enroll = await api('POST', `/catalog/course-classes/${courseClass.data.id}/enrollments`, {
    token: admin,
    body: { studentCodes: [...students.map((s) => s.code), 'MSSV-KHONG-TON-TAI'] },
  });
  ok('Gán 3 sinh viên vào lớp', enroll.data?.enrolled === 3, JSON.stringify(enroll.data));
  ok('Báo đúng MSSV không tồn tại', enroll.data?.notFound?.length === 1);

  const gvToken = await login(`GV-${tag}`);
  ok('Giảng viên đăng nhập', !!gvToken);

  // ============================================================
  section('3. Module 2 — Ngân hàng câu hỏi');
  // ============================================================

  const DIFFS = ['EASY', 'MEDIUM', 'HARD'];
  let createdQuestions = 0;
  for (const ch of chapters) {
    for (const d of DIFFS) {
      for (let k = 0; k < 4; k++) {
        const correct = k % 4;
        const r = await api('POST', '/questions', {
          token: gvToken,
          body: {
            chapterId: ch.id,
            type: 'SINGLE_CHOICE',
            difficulty: d,
            content: `[${ch.code}/${d}/${k}] Tính $\\int_0^1 x^{${k}}\\,dx$`,
            options: ['A', 'B', 'C', 'D'].map((label, i) => ({
              label,
              content: `$\\frac{1}{${i + 1}}$`,
              isCorrect: i === correct,
            })),
          },
        });
        if (r.status === 201) createdQuestions++;
      }
    }
  }
  ok('Soạn 36 câu hỏi (3 chương × 3 mức × 4 câu)', createdQuestions === 36, `được ${createdQuestions}`);

  const badQ = await api('POST', '/questions', {
    token: gvToken,
    body: {
      chapterId: chapters[0].id,
      type: 'SINGLE_CHOICE',
      difficulty: 'EASY',
      content: 'Câu có 2 đáp án đúng',
      options: [
        { label: 'A', content: 'x', isCorrect: true },
        { label: 'B', content: 'y', isCorrect: true },
      ],
    },
  });
  ok('Câu 1-đáp-án có 2 đáp án đúng bị từ chối', badQ.status === 400);

  const noCorrect = await api('POST', '/questions', {
    token: gvToken,
    body: {
      chapterId: chapters[0].id,
      type: 'SINGLE_CHOICE',
      difficulty: 'EASY',
      content: 'Câu không có đáp án đúng',
      options: [
        { label: 'A', content: 'x', isCorrect: false },
        { label: 'B', content: 'y', isCorrect: false },
      ],
    },
  });
  ok('Câu không có đáp án đúng bị từ chối', noCorrect.status === 400);

  const xss = await api('POST', '/questions', {
    token: gvToken,
    body: {
      chapterId: chapters[0].id,
      type: 'SINGLE_CHOICE',
      difficulty: 'EASY',
      content: 'Nội dung <script>alert(1)</script> nguy hiểm',
      options: [
        { label: 'A', content: 'x', isCorrect: true },
        { label: 'B', content: 'y', isCorrect: false },
      ],
    },
  });
  ok(
    'Thẻ script trong câu hỏi bị vô hiệu hóa',
    xss.status === 201 && !xss.data.content.includes('<script>'),
    xss.data?.content,
  );

  const inventory = await api('GET', `/catalog/subjects/${subject.data.id}/inventory`, {
    token: gvToken,
  });
  ok(
    'Thống kê kho câu hỏi đúng',
    inventory.data?.[0]?.available?.EASY >= 4,
    JSON.stringify(inventory.data?.[0]),
  );

  // Bản đồ đáp án đúng — giảng viên được xem, dùng để tính điểm kỳ vọng
  const allQ = await api('GET', `/questions?subjectId=${subject.data.id}&limit=100`, {
    token: gvToken,
  });
  ok('Giảng viên xem được cờ isCorrect', !!findKeyDeep(allQ.data.items, 'isCorrect'));
  const correctMap = new Map(
    allQ.data.items.map((q) => [q.id, q.options.filter((o) => o.isCorrect).map((o) => o.id)]),
  );

  // ============================================================
  section('4. Module 3 — Đề thi và ma trận');
  // ============================================================

  const now = Date.now();
  const examBody = {
    title: `Thi thử ${tag}`,
    courseClassId: courseClass.data.id,
    durationMinutes: 60,
    openAt: new Date(now - 60_000).toISOString(),
    closeAt: new Date(now + 3 * 3600_000).toISOString(),
    resultDisplay: 'WITH_ANSWERS',
    totalScore: 10,
    proctoringMode: 'REMOTE',
  };

  const badWindow = await api('POST', '/exams', {
    token: gvToken,
    body: { ...examBody, closeAt: new Date(now + 10 * 60_000).toISOString() },
  });
  ok('Khung giờ ngắn hơn thời lượng bị từ chối', badWindow.status === 400);

  const exam = await api('POST', '/exams', { token: gvToken, body: examBody });
  ok('Tạo đề thi', exam.status === 201, JSON.stringify(exam.data));
  ok('Tự gán hồ sơ giám sát chế độ từ xa', exam.data?.policy?.mode === 'REMOTE');
  ok(
    'Ngưỡng thi từ xa rộng hơn phòng máy',
    exam.data?.policy?.thresholds?.heartbeatTimeoutS === 90,
    JSON.stringify(exam.data?.policy?.thresholds),
  );

  const examId = exam.data.id;

  const tooMany = await api('PUT', `/exams/${examId}/matrix`, {
    token: gvToken,
    body: { items: [{ chapterId: chapters[0].id, difficulty: 'EASY', quantity: 99 }] },
  });
  ok('Ma trận vượt kho báo THIEU', tooMany.data?.missing?.length === 1);
  ok('Không cho phát hành khi thiếu câu', tooMany.data?.canPublish === false);

  const publishFail = await api('PATCH', `/exams/${examId}/publish`, { token: gvToken });
  ok('Phát hành bị chặn khi kho không đủ', publishFail.status === 400);

  const matrix = await api('PUT', `/exams/${examId}/matrix`, {
    token: gvToken,
    body: {
      items: [
        { chapterId: chapters[0].id, difficulty: 'EASY', quantity: 2 },
        { chapterId: chapters[1].id, difficulty: 'MEDIUM', quantity: 2 },
        { chapterId: chapters[2].id, difficulty: 'HARD', quantity: 2 },
      ],
    },
  });
  ok('Ma trận hợp lệ, tổng 6 câu', matrix.data?.totalQuestions === 6);
  ok('Cho phép phát hành', matrix.data?.canPublish === true);
  ok(
    'Tính đúng điểm mỗi câu',
    Math.abs(matrix.data.scorePerQuestion - 10 / 6) < 0.001,
    String(matrix.data?.scorePerQuestion),
  );

  const preview = await api('GET', `/exams/${examId}/preview`, { token: gvToken });
  ok('Xem trước đề mẫu ra 6 câu', preview.data?.length === 6);
  ok('Xem trước có nhãn A-D gán lại', preview.data?.[0]?.options?.[0]?.label === 'A');

  const published = await api('PATCH', `/exams/${examId}/publish`, { token: gvToken });
  ok('Phát hành đề thi', published.data?.status === 'PUBLISHED');

  const editAfterPublish = await api('PATCH', `/exams/${examId}`, {
    token: gvToken,
    body: { durationMinutes: 30 },
  });
  ok('Không sửa được đề đã phát hành', editAfterPublish.status === 400);

  // ============================================================
  section('5. Module 4 — Làm bài thi');
  // ============================================================

  const svTokens = [];
  for (const s of students) svTokens.push(await login(s.code));

  const myExams = await api('GET', '/attempts/my-exams', { token: svTokens[0] });
  const target = myExams.data?.find((e) => e.examId === examId);
  ok('Sinh viên thấy ca thi', !!target);
  ok('Trạng thái ca thi là ĐANG MỞ', target?.state === 'DANG_MO', target?.state);

  const rules = await api('GET', `/attempts/exams/${examId}/rules`, { token: svTokens[0] });
  ok('Lấy được thể lệ thi', rules.data?.rules?.length > 0);
  ok('Thi từ xa yêu cầu đồng ý sinh trắc', rules.data?.requiresBiometricConsent === true);

  const noConsent = await api('POST', `/attempts/exams/${examId}/start`, {
    token: svTokens[0],
    body: { acceptRules: true, acceptBiometric: false },
  });
  ok('Không đồng ý sinh trắc thì không vào thi được', noConsent.status === 400);

  const noRules = await api('POST', `/attempts/exams/${examId}/start`, {
    token: svTokens[0],
    body: { acceptRules: false, acceptBiometric: true },
  });
  ok('Không xác nhận thể lệ thì không vào thi được', noRules.status === 400);

  const start1 = await api('POST', `/attempts/exams/${examId}/start`, {
    token: svTokens[0],
    body: { acceptRules: true, acceptBiometric: true },
  });
  ok('Sinh viên 1 bắt đầu làm bài', start1.status === 201 || start1.status === 200);
  ok('Đề có đúng 6 câu', start1.data?.questions?.length === 6);

  const leak = findKeyDeep(start1.data, 'isCorrect');
  ok('KHÔNG rò rỉ isCorrect trong đề của sinh viên', leak === null, `tìm thấy tại ${leak}`);
  const leakExp = findKeyDeep(start1.data, 'explanation');
  ok('KHÔNG rò rỉ lời giải trong đề', leakExp === null, `tìm thấy tại ${leakExp}`);

  ok('Có thời gian máy chủ', !!start1.data?.serverTime);
  ok(
    'Đồng hồ còn lại khớp thời lượng',
    Math.abs(start1.data.remainingSeconds - 3600) < 30,
    String(start1.data?.remainingSeconds),
  );
  ok('Trả về cấu hình giám sát cho client', !!start1.data?.proctoring?.thresholds);

  const attempt1 = start1.data.attemptId;

  // Gọi lại phải ra đúng đề cũ, không sinh đề mới
  const restart = await api('POST', `/attempts/exams/${examId}/start`, {
    token: svTokens[0],
    body: { acceptRules: true, acceptBiometric: true },
  });
  ok('Vào lại trả đúng lượt thi cũ', restart.data?.attemptId === attempt1);
  ok(
    'Đề giữ nguyên thứ tự câu hỏi',
    JSON.stringify(restart.data.questions.map((q) => q.questionId)) ===
      JSON.stringify(start1.data.questions.map((q) => q.questionId)),
  );
  ok(
    'Thứ tự phương án cũng giữ nguyên',
    JSON.stringify(restart.data.questions[0].options.map((o) => o.id)) ===
      JSON.stringify(start1.data.questions[0].options.map((o) => o.id)),
  );

  const otherAttempt = await api('GET', `/attempts/${attempt1}`, { token: svTokens[1] });
  ok('Sinh viên khác không xem được bài này', otherAttempt.status === 403);

  const fakeOption = await api('POST', `/attempts/${attempt1}/answers`, {
    token: svTokens[0],
    body: { questionId: start1.data.questions[0].questionId, selectedOptionIds: ['id-bia-dat'] },
  });
  ok('Chọn phương án không thuộc câu hỏi bị chặn', fakeOption.status === 400);

  // Sinh viên 1 làm đúng hết
  for (const q of start1.data.questions) {
    await api('POST', `/attempts/${attempt1}/answers`, {
      token: svTokens[0],
      body: { questionId: q.questionId, selectedOptionIds: correctMap.get(q.questionId) },
    });
  }
  const saved = await api('GET', `/attempts/${attempt1}`, { token: svTokens[0] });
  ok('Khôi phục đủ 6 đáp án đã lưu', saved.data.questions.every((q) => q.answered));

  // ============================================================
  section('5b. Thoát ra rồi vào lại làm tiếp');
  // ============================================================

  // Đăng nhập lại sinh ra sessionId MỚI. Trước đây điều này khoá sinh viên
  // khỏi chính bài thi của mình cho tới hết ca thi.
  //
  // Cố ý KHÔNG đăng xuất trước: đây đúng là kịch bản hai thiết bị cùng mở một
  // bài. Token cũ vẫn còn hiệu lực, nên nếu nó vẫn lưu được đáp án thì hai máy
  // làm song song được — điều mà khoá phiên sinh ra để ngăn.
  const reToken = await login(students[0].code);

  const resume = await api('POST', `/attempts/exams/${examId}/start`, {
    token: reToken,
    body: { acceptRules: true, acceptBiometric: true },
  });
  ok('Đăng nhập lại vẫn vào tiếp được bài thi', resume.status === 200 || resume.status === 201,
    `HTTP ${resume.status}: ${JSON.stringify(resume.data?.message)}`);
  ok('Vào lại đúng lượt thi cũ', resume.data?.attemptId === attempt1);
  ok('Đáp án đã lưu vẫn còn nguyên',
    resume.data?.questions?.every((q) => q.answered) === true);

  const q0 = resume.data.questions[0];
  const saveNew = await api('POST', `/attempts/${attempt1}/answers`, {
    token: reToken,
    body: { questionId: q0.questionId, selectedOptionIds: correctMap.get(q0.questionId) },
  });
  ok('Phiên mới lưu được đáp án', saveNew.status === 200 || saveNew.status === 201);

  // Thiết bị cũ phải mất quyền — nếu không thì hai máy làm song song được
  const saveOld = await api('POST', `/attempts/${attempt1}/answers`, {
    token: svTokens[0],
    body: { questionId: q0.questionId, selectedOptionIds: [] },
  });
  ok('Thiết bị cũ mất quyền lưu đáp án', saveOld.status === 403,
    `HTTP ${saveOld.status}`);

  const monAfter = await api('GET', `/proctoring/exams/${examId}/monitor`, { token: gvToken });
  const meRow = monAfter.data?.rows?.find((r) => r.attemptId === attempt1);
  ok('Màn giám sát đếm số lần chuyển thiết bị',
    (meRow?.sessionTakeoverCount ?? 0) >= 1, `dem duoc ${meRow?.sessionTakeoverCount}`);

  svTokens[0] = reToken; // các bước sau dùng phiên còn hiệu lực

  // ============================================================
  section('6. Module 5 — Giám sát hành vi');
  // ============================================================

  const below = await api('POST', `/proctoring/attempts/${attempt1}/events`, {
    token: svTokens[0],
    body: {
      events: [
        { type: 'TAB_BLUR', occurredAt: new Date().toISOString(), durationMs: 1200 },
        { type: 'WINDOW_BLUR', occurredAt: new Date().toISOString(), durationMs: 800 },
      ],
    },
  });
  ok('Rời màn hình dưới ngưỡng: ghi nhận nhưng không tính vi phạm',
    below.data?.accepted === 2 && below.data?.violations === 0,
    JSON.stringify(below.data));

  const above = await api('POST', `/proctoring/attempts/${attempt1}/events`, {
    token: svTokens[0],
    body: {
      events: [{ type: 'TAB_BLUR', occurredAt: new Date().toISOString(), durationMs: 9000 }],
    },
  });
  ok('Rời màn hình quá ngưỡng bị tính vi phạm', above.data?.violations === 1);

  const paste = await api('POST', `/proctoring/attempts/${attempt1}/events`, {
    token: svTokens[0],
    body: { events: [{ type: 'PASTE', occurredAt: new Date().toISOString() }] },
  });
  ok('Dán nội dung bị tính vi phạm ngay lần đầu', paste.data?.violations === 1);
  ok('Đếm dồn số vi phạm', paste.data?.violationCount === 2, String(paste.data?.violationCount));

  const wrongSignal = await api('POST', `/proctoring/attempts/${attempt1}/events`, {
    token: svTokens[0],
    body: {
      events: [{ type: 'IP_OUT_OF_RANGE', occurredAt: new Date().toISOString() }],
    },
  });
  ok('Tín hiệu không thuộc chế độ thi bị loại bỏ', wrongSignal.data?.accepted === 0);

  const invalidType = await api('POST', `/proctoring/attempts/${attempt1}/events`, {
    token: svTokens[0],
    body: { events: [{ type: 'KHONG_CO_THAT', occurredAt: new Date().toISOString() }] },
  });
  ok('Loại tín hiệu bịa đặt bị từ chối', invalidType.status === 400);

  const monitor = await api('GET', `/proctoring/exams/${examId}/monitor`, { token: gvToken });
  ok('Giảng viên mở được màn giám sát', monitor.status === 200);
  ok('Màn giám sát thấy 1 thí sinh đang thi', monitor.data?.rows?.length === 1);
  ok('Hiển thị đúng số vi phạm', monitor.data?.rows?.[0]?.violationCount === 2);
  ok('Trạng thái là NHẮC NHỞ', monitor.data?.rows?.[0]?.state === 'NHAC_NHO',
    monitor.data?.rows?.[0]?.state);

  const svMonitor = await api('GET', `/proctoring/exams/${examId}/monitor`, {
    token: svTokens[0],
  });
  ok('Sinh viên KHÔNG mở được màn giám sát', svMonitor.status === 403);

  // ============================================================
  section('7. Module 6 — Chấm điểm và báo cáo');
  // ============================================================

  const submit1 = await api('POST', `/attempts/${attempt1}/submit`, {
    token: svTokens[0],
    body: { idempotencyKey: `key-${tag}-1` },
  });
  ok('Nộp bài thành công', submit1.status === 201 || submit1.status === 200);
  ok('Làm đúng hết được 10 điểm', submit1.data?.score === 10, String(submit1.data?.score));
  ok('Đếm đúng 6 câu đúng', submit1.data?.correctCount === 6);

  const resubmit = await api('POST', `/attempts/${attempt1}/submit`, {
    token: svTokens[0],
    body: { idempotencyKey: `key-${tag}-1` },
  });
  ok('Nộp lại lần hai không gây lỗi', resubmit.status === 200 || resubmit.status === 201);
  ok('Nộp lại trả đúng điểm cũ', resubmit.data?.score === 10);

  ok('Được xem lại đáp án đúng sau khi nộp',
    Array.isArray(submit1.data?.questions) &&
      submit1.data.questions[0].options.some((o) => o.isCorrect === true));

  // Sinh viên 2 — sai hết
  const start2 = await api('POST', `/attempts/exams/${examId}/start`, {
    token: svTokens[1],
    body: { acceptRules: true, acceptBiometric: true },
  });
  for (const q of start2.data.questions) {
    const correct = new Set(correctMap.get(q.questionId));
    const wrong = q.options.find((o) => !correct.has(o.id));
    await api('POST', `/attempts/${start2.data.attemptId}/answers`, {
      token: svTokens[1],
      body: { questionId: q.questionId, selectedOptionIds: [wrong.id] },
    });
  }
  const submit2 = await api('POST', `/attempts/${start2.data.attemptId}/submit`, {
    token: svTokens[1],
    body: {},
  });
  ok('Sinh viên 2 sai hết được 0 điểm', submit2.data?.score === 0, String(submit2.data?.score));

  // Sinh viên 3 — đúng 3 câu đầu
  const start3 = await api('POST', `/attempts/exams/${examId}/start`, {
    token: svTokens[2],
    body: { acceptRules: true, acceptBiometric: true },
  });
  start3.data.questions.forEach(() => {});
  for (const [i, q] of start3.data.questions.entries()) {
    const correct = correctMap.get(q.questionId);
    const pick =
      i < 3 ? correct : [q.options.find((o) => !new Set(correct).has(o.id)).id];
    await api('POST', `/attempts/${start3.data.attemptId}/answers`, {
      token: svTokens[2],
      body: { questionId: q.questionId, selectedOptionIds: pick },
    });
  }
  const submit3 = await api('POST', `/attempts/${start3.data.attemptId}/submit`, {
    token: svTokens[2],
    body: {},
  });
  ok('Sinh viên 3 đúng 3/6 được 5 điểm', submit3.data?.score === 5, String(submit3.data?.score));

  const history = await api('GET', '/results/my-history', { token: svTokens[0] });
  ok('Sinh viên xem được lịch sử thi', history.data?.length >= 1);

  const gradebook = await api('GET', `/results/exams/${examId}/gradebook`, { token: gvToken });
  ok('Bảng điểm có đủ 3 sinh viên', gradebook.data?.rows?.length === 3);
  ok('Điểm trung bình đúng', gradebook.data?.summary?.average === 5,
    String(gradebook.data?.summary?.average));
  ok('Điểm cao nhất 10, thấp nhất 0',
    gradebook.data?.summary?.max === 10 && gradebook.data?.summary?.min === 0);
  ok('Tỉ lệ đạt 66.7%', gradebook.data?.summary?.passRate === 66.7,
    String(gradebook.data?.summary?.passRate));

  const dist = await api('GET', `/results/exams/${examId}/distribution`, { token: gvToken });
  ok('Phổ điểm chia đủ 5 khoảng', dist.data?.buckets?.length === 5);
  ok('Tổng số bài trong phổ điểm bằng 3',
    dist.data?.buckets?.reduce((s, b) => s + b.count, 0) === 3);

  const item = await api('GET', `/results/exams/${examId}/item-analysis`, { token: gvToken });
  ok('Phân tích câu hỏi chạy được', item.status === 200);
  ok('Có chỉ số độ khó và độ phân biệt',
    typeof item.data?.items?.[0]?.pValue === 'number' &&
      typeof item.data?.items?.[0]?.discriminationIndex === 'number');

  const xlsx = await api('GET', `/results/exams/${examId}/export.xlsx`, {
    token: gvToken,
    raw: true,
  });
  const isZip = xlsx.buffer[0] === 0x50 && xlsx.buffer[1] === 0x4b;
  ok('Xuất Excel trả về file hợp lệ', xlsx.status === 200 && isZip,
    `${xlsx.buffer.length} bytes`);

  const svGradebook = await api('GET', `/results/exams/${examId}/gradebook`, {
    token: svTokens[0],
  });
  ok('Sinh viên KHÔNG xem được bảng điểm lớp', svGradebook.status === 403);

  // ============================================================
  section('8. Khóa dải IP ở chế độ thi tại phòng máy');
  // ============================================================

  const rooms = await api('GET', '/catalog/rooms', { token: admin });
  const room = rooms.data?.find((r) => r.ipRules?.length > 0);
  ok('Có phòng máy khai báo dải IP', !!room);

  if (room) {
    const labExam = await api('POST', '/exams', {
      token: gvToken,
      body: {
        ...examBody,
        title: `Thi phòng máy ${tag}`,
        proctoringMode: 'LAB',
        roomId: room.id,
      },
    });
    ok('Tạo đề thi chế độ phòng máy', labExam.status === 201, JSON.stringify(labExam.data));
    ok('Ngưỡng phòng máy chặt hơn (30s)',
      labExam.data?.policy?.thresholds?.heartbeatTimeoutS === 30);

    await api('PUT', `/exams/${labExam.data.id}/matrix`, {
      token: gvToken,
      body: {
        items: [
          { chapterId: chapters[0].id, difficulty: 'EASY', quantity: 2 },
          { chapterId: chapters[1].id, difficulty: 'MEDIUM', quantity: 2 },
        ],
      },
    });
    await api('PATCH', `/exams/${labExam.data.id}/publish`, { token: gvToken });

    const blocked = await api('POST', `/attempts/exams/${labExam.data.id}/start`, {
      token: svTokens[0],
      body: { acceptRules: true, machineCode: 'D9-04' },
    });
    ok('Thi từ ngoài dải mạng phòng máy bị chặn', blocked.status === 403,
      `nhận ${blocked.status}: ${JSON.stringify(blocked.data?.message)}`);
  }

  const labNoRoom = await api('POST', '/exams', {
    token: gvToken,
    body: { ...examBody, title: `Thiếu phòng ${tag}`, proctoringMode: 'LAB' },
  });
  ok('Chế độ phòng máy mà không chọn phòng bị từ chối', labNoRoom.status === 400);

  // ============================================================
  section('9. Đóng ca thi');
  // ============================================================

  const closed = await api('PATCH', `/exams/${examId}/close`, { token: gvToken });
  ok('Đóng ca thi', closed.data?.status === 'CLOSED');

  const afterClose = await api('POST', `/attempts/exams/${examId}/start`, {
    token: svTokens[0],
    body: { acceptRules: true, acceptBiometric: true },
  });
  ok('Ca thi đã đóng không vào được nữa', afterClose.status === 400);

  // ============================================================
  console.log(`\n${'━'.repeat(66)}`);
  console.log(`KẾT QUẢ: ${passed} đạt, ${failed} lỗi trên tổng ${passed + failed} phép thử`);
  if (failed > 0) {
    console.log('\nCác phép thử không đạt:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('\nLỖI KHÔNG BẮT ĐƯỢC:', e);
  process.exit(1);
});
