/**
 * Dữ liệu khởi tạo. Chạy: npm run db:seed
 *
 * Tạo sẵn:
 *   - 2 hồ sơ chính sách giám sát chuẩn (LAB và REMOTE)
 *   - 1 tài khoản admin, 1 giảng viên, 1 sinh viên để test
 *   - 1 môn học + 3 chương mẫu
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { DEFAULT_LAB_POLICY, DEFAULT_REMOTE_POLICY } from '@eduexam/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('Bắt đầu seed dữ liệu...');

  // ---------- Hồ sơ chính sách giám sát ----------
  await prisma.proctoringPolicy.upsert({
    where: { id: 'policy-lab-default' },
    update: {},
    create: {
      id: 'policy-lab-default',
      name: 'Chuẩn phòng máy',
      mode: 'LAB',
      isSystem: true,
      signalsEnabled: DEFAULT_LAB_POLICY.signalsEnabled as any,
      thresholds: DEFAULT_LAB_POLICY.thresholds as any,
      actionOnExceed: DEFAULT_LAB_POLICY.actionOnExceed,
    },
  });

  await prisma.proctoringPolicy.upsert({
    where: { id: 'policy-remote-default' },
    update: {},
    create: {
      id: 'policy-remote-default',
      name: 'Chuẩn thi từ xa',
      mode: 'REMOTE',
      isSystem: true,
      signalsEnabled: DEFAULT_REMOTE_POLICY.signalsEnabled as any,
      thresholds: DEFAULT_REMOTE_POLICY.thresholds as any,
      actionOnExceed: DEFAULT_REMOTE_POLICY.actionOnExceed,
    },
  });

  // ---------- Tài khoản ----------
  const password = await argon2.hash('EduExam@123', { type: argon2.argon2id });

  const admin = await prisma.user.upsert({
    where: { code: 'admin' },
    update: {},
    create: {
      code: 'admin',
      email: 'admin@eduexam.local',
      passwordHash: password,
      fullName: 'Quản trị viên hệ thống',
      role: 'ADMIN',
    },
  });

  const lecturer = await prisma.user.upsert({
    where: { code: 'GV001' },
    update: {},
    create: {
      code: 'GV001',
      email: 'hung.nv@eduexam.local',
      passwordHash: password,
      fullName: 'Nguyễn Văn Hưng',
      role: 'LECTURER',
    },
  });

  // Nhóm 08 — dùng làm danh sách sinh viên mẫu cho lớp học phần
  const STUDENTS = [
    { code: '3123410013', fullName: 'Ma Lý Hoàng Ân' },
    { code: '3122410127', fullName: 'Nguyễn Huy Hoàng' },
    { code: '3123410048', fullName: 'Hứa Thế Dân' },
    { code: '3123410038', fullName: 'La Vĩ Cường' },
    { code: '3121410030', fullName: 'Trương Gia Huy' },
  ];

  const students = [];
  for (const s of STUDENTS) {
    students.push(
      await prisma.user.upsert({
        where: { code: s.code },
        update: {},
        create: {
          code: s.code,
          email: `${s.code}@eduexam.local`,
          passwordHash: password,
          fullName: s.fullName,
          role: 'STUDENT',
        },
      }),
    );
  }
  const student = students[1]; // 3122410127

  // ---------- Môn học + chương ----------
  const subject = await prisma.subject.upsert({
    where: { code: 'MATH102' },
    update: {},
    create: { code: 'MATH102', name: 'Giải tích 2', credits: 3 },
  });

  const chapters = [
    { code: 'CAL2-C01', name: 'Giới hạn và chuỗi', orderIndex: 1 },
    { code: 'CAL2-C02', name: 'Đạo hàm riêng', orderIndex: 2 },
    { code: 'CAL2-C03', name: 'Tích phân bội', orderIndex: 3 },
  ];
  for (const c of chapters) {
    await prisma.chapter.upsert({
      where: { subjectId_code: { subjectId: subject.id, code: c.code } },
      update: {},
      create: { ...c, subjectId: subject.id },
    });
  }

  // ---------- Phòng máy + dải IP ----------
  const room = await prisma.examRoom.upsert({
    where: { code: 'D9-301' },
    update: {},
    create: { code: 'D9-301', name: 'Phòng máy D9-301', building: 'D9', seatCount: 70 },
  });

  const existingRule = await prisma.roomIpRule.findFirst({ where: { roomId: room.id } });
  if (!existingRule) {
    await prisma.roomIpRule.create({
      data: { roomId: room.id, cidr: '10.20.30.0/24', note: 'Dải mạng phòng máy D9-301' },
    });
  }

  // ---------- Lớp học phần ----------
  const courseClass = await prisma.courseClass.upsert({
    where: { code: 'MATH102.N04' },
    update: {},
    create: {
      code: 'MATH102.N04',
      name: 'Giải tích 2 - Nhóm 04',
      subjectId: subject.id,
      lecturerId: lecturer.id,
      semester: 'HK2 2024-2025',
      capacity: 70,
    },
  });

  await prisma.enrollment.createMany({
    data: students.map((s) => ({ courseClassId: courseClass.id, studentId: s.id })),
    skipDuplicates: true,
  });

  // ---------- Ngân hàng câu hỏi ----------
  // Không có câu hỏi thì giảng viên đăng nhập vào chỉ thấy màn hình trống,
  // và cũng không dựng được ma trận đề để xem thử.
  const chapterRows = await prisma.chapter.findMany({
    where: { subjectId: subject.id },
    orderBy: { orderIndex: 'asc' },
  });

  const BANK: Record<string, { content: string; options: string[]; correct: number }[]> = {
    EASY: [
      { content: 'Tính $\\int_0^1 x\\,dx$', options: ['$\\frac{1}{2}$', '$1$', '$\\frac{1}{3}$', '$2$'], correct: 0 },
      { content: 'Tính $\\int_0^1 x^2\\,dx$', options: ['$\\frac{1}{2}$', '$\\frac{1}{3}$', '$\\frac{1}{4}$', '$1$'], correct: 1 },
      { content: 'Tính $\\lim_{x \\to 0} \\frac{\\sin x}{x}$', options: ['$0$', '$\\infty$', '$1$', 'Không tồn tại'], correct: 2 },
      { content: 'Đạo hàm của $f(x) = x^3$ là', options: ['$3x$', '$x^2$', '$3x^3$', '$3x^2$'], correct: 3 },
    ],
    MEDIUM: [
      { content: 'Tính $\\int_0^{+\\infty} x\\,e^{-2x}\\,dx$', options: ['$\\frac{1}{4}$', '$\\frac{1}{2}$', '$1$', '$2$'], correct: 0 },
      { content: 'Cho $z = x^2y$. Tính $\\frac{\\partial z}{\\partial x}$', options: ['$x^2$', '$2xy$', '$2x$', '$x^2y$'], correct: 1 },
      { content: 'Tính $\\sum_{n=1}^{\\infty} \\frac{1}{2^n}$', options: ['$\\frac{1}{2}$', '$2$', '$1$', 'Phân kỳ'], correct: 2 },
      { content: 'Chuỗi $\\sum_{n=1}^{\\infty} \\frac{1}{n}$ có tính chất', options: ['Hội tụ về $1$', 'Hội tụ về $e$', 'Hội tụ tuyệt đối', 'Phân kỳ'], correct: 3 },
    ],
    HARD: [
      { content: 'Tính tích phân kép $\\iint_D (x^2 + y)\\,dx\\,dy$ với $D$ giới hạn bởi $y = x^2$ và $y = 2x$', options: ['$\\frac{64}{15}$', '$\\frac{32}{15}$', '$\\frac{16}{5}$', '$\\frac{28}{15}$'], correct: 0 },
      { content: 'Tính thông lượng của trường $\\vec{F} = (x^3, y^3, z^3)$ qua mặt cầu $x^2+y^2+z^2 = R^2$', options: ['$4\\pi R^3$', '$\\frac{12\\pi}{5}R^5$', '$\\frac{4\\pi}{3}R^3$', '$0$'], correct: 1 },
      { content: 'Nghiệm tổng quát của $y\' + \\frac{2}{x}y = x^3$ (với $x > 0$) là', options: ['$y = \\frac{x^4}{4} + \\frac{C}{x}$', '$y = x^4 + Cx^2$', '$y = \\frac{x^4}{6} + \\frac{C}{x^2}$', '$y = \\frac{x^3}{6} + C$'], correct: 2 },
      { content: 'Tính $\\lim_{n \\to \\infty} \\sum_{k=1}^{n} \\frac{n}{n^2 + k^2}$', options: ['$0$', '$1$', '$\\frac{\\pi}{2}$', '$\\frac{\\pi}{4}$'], correct: 3 },
    ],
  };

  const existingQuestions = await prisma.question.count({ where: { subjectId: subject.id } });
  if (existingQuestions === 0) {
    for (const chapter of chapterRows) {
      for (const difficulty of ['EASY', 'MEDIUM', 'HARD'] as const) {
        for (const q of BANK[difficulty]) {
          await prisma.question.create({
            data: {
              subjectId: subject.id,
              chapterId: chapter.id,
              type: 'SINGLE_CHOICE',
              difficulty,
              content: q.content,
              createdById: lecturer.id,
              options: {
                create: q.options.map((content, i) => ({
                  label: String.fromCharCode(65 + i),
                  content,
                  isCorrect: i === q.correct,
                  orderIndex: i,
                })),
              },
            },
          });
        }
      }
    }
  }

  // ---------- Đề thi mẫu ----------
  const now = new Date();

  /**
   * Đề 1 — thi TỪ XA, đã phát hành, đang mở.
   * Cố ý chọn chế độ từ xa để sinh viên vào thi thử được ngay từ máy cá nhân.
   * Nếu để chế độ phòng máy, ràng buộc dải IP sẽ chặn mọi máy ngoài lab.
   */
  const remotePolicy = await prisma.proctoringPolicy.findFirst({
    where: { mode: 'REMOTE', isSystem: true },
  });

  let demoExam = await prisma.exam.findFirst({
    where: { courseClassId: courseClass.id, title: { startsWith: 'Thi giữa kỳ' } },
  });

  if (!demoExam) {
    demoExam = await prisma.exam.create({
      data: {
        title: 'Thi giữa kỳ Giải tích 2 — Nhóm 04',
        subjectId: subject.id,
        courseClassId: courseClass.id,
        durationMinutes: 60,
        openAt: new Date(now.getTime() - 60 * 60 * 1000),
        closeAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        resultDisplay: 'WITH_ANSWERS',
        totalScore: 10,
        proctoringMode: 'REMOTE',
        policyId: remotePolicy?.id,
        createdById: lecturer.id,
        status: 'PUBLISHED',
        matrixItems: {
          create: [
            { chapterId: chapterRows[0].id, difficulty: 'EASY', quantity: 3 },
            { chapterId: chapterRows[1].id, difficulty: 'MEDIUM', quantity: 3 },
            { chapterId: chapterRows[2].id, difficulty: 'HARD', quantity: 2 },
          ],
        },
      },
    });
  }

  // Đề 2 — thi TẠI PHÒNG MÁY, còn bản nháp, để xem giao diện cấu hình chế độ LAB
  const labPolicy = await prisma.proctoringPolicy.findFirst({
    where: { mode: 'LAB', isSystem: true },
  });
  const labExam = await prisma.exam.findFirst({
    where: { courseClassId: courseClass.id, title: { startsWith: 'Thi cuối kỳ' } },
  });
  if (!labExam) {
    await prisma.exam.create({
      data: {
        title: 'Thi cuối kỳ Giải tích 2 — Nhóm 04',
        subjectId: subject.id,
        courseClassId: courseClass.id,
        durationMinutes: 90,
        openAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        closeAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000),
        resultDisplay: 'SCORE_ONLY',
        totalScore: 10,
        proctoringMode: 'LAB',
        roomId: room.id,
        policyId: labPolicy?.id,
        createdById: lecturer.id,
        status: 'DRAFT',
        matrixItems: {
          create: [
            { chapterId: chapterRows[0].id, difficulty: 'MEDIUM', quantity: 4 },
            { chapterId: chapterRows[2].id, difficulty: 'HARD', quantity: 4 },
          ],
        },
      },
    });
  }

  const totalQuestions = await prisma.question.count({ where: { subjectId: subject.id } });

  console.log('\nSeed xong. Mật khẩu tất cả tài khoản: EduExam@123\n');
  console.log('  admin        — Quản trị viên');
  console.log('  GV001        — Giảng viên Nguyễn Văn Hưng');
  console.log('  3122410127   — Sinh viên Nguyễn Huy Hoàng (và 4 MSSV khác của Nhóm 08)\n');
  console.log(`  Môn học      : ${subject.code} với ${chapterRows.length} chương, ${totalQuestions} câu hỏi`);
  console.log(`  Lớp học phần : ${courseClass.code} với ${students.length} sinh viên`);
  console.log('  Đề thi       : 1 đề ĐANG MỞ (thi từ xa) + 1 đề bản nháp (thi tại phòng máy)');
  console.log('\n  Đăng nhập GV001 để xem đề thi, hoặc 3122410127 để vào thi thử.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
