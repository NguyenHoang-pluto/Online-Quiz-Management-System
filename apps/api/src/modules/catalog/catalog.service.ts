import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import { isIpInCidr } from '../../common/utils/ip';
import type {
  CreateSubjectDto,
  UpdateSubjectDto,
  CreateChapterDto,
  UpdateChapterDto,
  CreateCourseClassDto,
  UpdateCourseClassDto,
  EnrollStudentsDto,
  CreateExamRoomDto,
  CreateRoomIpRuleDto,
} from './dto/catalog.dto';

/**
 * MODULE 1 — Danh mục môn học, chương, lớp học phần, phòng máy.
 * Phụ trách: Trương Gia Huy
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== MÔN HỌC ====================

  async listSubjects(dto: PaginationDto) {
    const where = dto.q
      ? { OR: [{ code: { contains: dto.q } }, { name: { contains: dto.q } }] }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.subject.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: { code: 'asc' },
        include: { _count: { select: { chapters: true, questions: true } } },
      }),
      this.prisma.subject.count({ where }),
    ]);
    return paginate(items, total, dto);
  }

  createSubject(dto: CreateSubjectDto) {
    return this.prisma.subject.create({ data: dto });
  }

  async updateSubject(id: string, dto: UpdateSubjectDto) {
    await this.mustFindSubject(id);
    return this.prisma.subject.update({ where: { id }, data: dto });
  }

  /**
   * Quy tắc bảo toàn dữ liệu khảo thí (nêu trong mockup Module 1):
   * không được xóa môn học khi đã có câu hỏi hoặc đề thi, để bảo đảm
   * truy hồi được điểm số cũ.
   */
  async removeSubject(id: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id },
      include: { _count: { select: { questions: true, exams: true } } },
    });
    if (!subject) throw new NotFoundException('Không tìm thấy môn học');

    if (subject._count.questions > 0 || subject._count.exams > 0) {
      throw new BadRequestException(
        `Không thể xóa môn học đã có ${subject._count.questions} câu hỏi và ` +
          `${subject._count.exams} đề thi. Dữ liệu khảo thí phải được bảo toàn.`,
      );
    }
    await this.prisma.subject.delete({ where: { id } });
    return { message: 'Đã xóa môn học' };
  }

  private async mustFindSubject(id: string) {
    const s = await this.prisma.subject.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Không tìm thấy môn học');
    return s;
  }

  // ==================== CHƯƠNG ====================

  async listChapters(subjectId: string) {
    await this.mustFindSubject(subjectId);
    return this.prisma.chapter.findMany({
      where: { subjectId },
      orderBy: { orderIndex: 'asc' },
      include: { _count: { select: { questions: true } } },
    });
  }

  async createChapter(subjectId: string, dto: CreateChapterDto) {
    await this.mustFindSubject(subjectId);
    return this.prisma.chapter.create({
      data: { ...dto, subjectId, orderIndex: dto.orderIndex ?? 0 },
    });
  }

  async updateChapter(id: string, dto: UpdateChapterDto) {
    const c = await this.prisma.chapter.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Không tìm thấy chương');
    return this.prisma.chapter.update({ where: { id }, data: dto });
  }

  /**
   * Thống kê số câu hỏi khả dụng theo chương và mức độ.
   * Module 3 gọi hàm này để cảnh báo "ngân hàng không đủ câu" trước khi
   * cho phép phát hành đề thi.
   */
  async getQuestionInventory(subjectId: string) {
    const rows = await this.prisma.question.groupBy({
      by: ['chapterId', 'difficulty'],
      where: { subjectId, status: 'ACTIVE' },
      _count: { _all: true },
    });

    const chapters = await this.prisma.chapter.findMany({
      where: { subjectId },
      orderBy: { orderIndex: 'asc' },
    });

    return chapters.map((ch) => {
      const pick = (d: string) =>
        rows.find((r) => r.chapterId === ch.id && r.difficulty === d)?._count._all ?? 0;
      const easy = pick('EASY');
      const medium = pick('MEDIUM');
      const hard = pick('HARD');
      return {
        chapterId: ch.id,
        code: ch.code,
        name: ch.name,
        available: { EASY: easy, MEDIUM: medium, HARD: hard },
        total: easy + medium + hard,
      };
    });
  }

  // ==================== LỚP HỌC PHẦN ====================

  async listCourseClasses(dto: PaginationDto, lecturerId?: string) {
    const where: any = {};
    if (lecturerId) where.lecturerId = lecturerId;
    if (dto.q) {
      where.OR = [{ code: { contains: dto.q } }, { name: { contains: dto.q } }];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.courseClass.findMany({
        where,
        skip: dto.skip,
        take: dto.limit,
        orderBy: { code: 'asc' },
        include: {
          subject: { select: { code: true, name: true, credits: true } },
          lecturer: { select: { id: true, code: true, fullName: true, email: true } },
          _count: { select: { enrollments: true, exams: true } },
        },
      }),
      this.prisma.courseClass.count({ where }),
    ]);
    return paginate(items, total, dto);
  }

  async createCourseClass(dto: CreateCourseClassDto) {
    const lecturer = await this.prisma.user.findUnique({ where: { id: dto.lecturerId } });
    if (!lecturer || lecturer.role !== 'LECTURER') {
      throw new BadRequestException('Giảng viên phụ trách không hợp lệ');
    }
    await this.mustFindSubject(dto.subjectId);
    return this.prisma.courseClass.create({ data: { ...dto, capacity: dto.capacity ?? 0 } });
  }

  async updateCourseClass(id: string, dto: UpdateCourseClassDto) {
    const cc = await this.prisma.courseClass.findUnique({ where: { id } });
    if (!cc) throw new NotFoundException('Không tìm thấy lớp học phần');
    return this.prisma.courseClass.update({ where: { id }, data: dto });
  }

  // ==================== GÁN SINH VIÊN ====================

  /** Chức năng 1.8 — gán sinh viên vào lớp học phần theo danh sách MSSV. */
  async enrollStudents(courseClassId: string, dto: EnrollStudentsDto) {
    const cc = await this.prisma.courseClass.findUnique({ where: { id: courseClassId } });
    if (!cc) throw new NotFoundException('Không tìm thấy lớp học phần');

    const students = await this.prisma.user.findMany({
      where: { code: { in: dto.studentCodes }, role: 'STUDENT' },
      select: { id: true, code: true },
    });

    const found = new Set(students.map((s) => s.code));
    const notFound = dto.studentCodes.filter((c) => !found.has(c));

    const result = await this.prisma.enrollment.createMany({
      data: students.map((s) => ({ courseClassId, studentId: s.id })),
      skipDuplicates: true,
    });

    return {
      enrolled: result.count,
      alreadyEnrolled: students.length - result.count,
      notFound,
    };
  }

  async listEnrollments(courseClassId: string) {
    return this.prisma.enrollment.findMany({
      where: { courseClassId },
      include: { student: { select: { id: true, code: true, fullName: true, email: true } } },
      orderBy: { student: { code: 'asc' } },
    });
  }

  async removeEnrollment(courseClassId: string, studentId: string) {
    await this.prisma.enrollment.deleteMany({ where: { courseClassId, studentId } });
    return { message: 'Đã gỡ sinh viên khỏi lớp học phần' };
  }

  // ==================== PHÒNG MÁY ====================

  listRooms() {
    return this.prisma.examRoom.findMany({
      orderBy: { code: 'asc' },
      include: { ipRules: true },
    });
  }

  createRoom(dto: CreateExamRoomDto) {
    return this.prisma.examRoom.create({ data: { ...dto, seatCount: dto.seatCount ?? 0 } });
  }

  async addIpRule(roomId: string, dto: CreateRoomIpRuleDto) {
    const room = await this.prisma.examRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Không tìm thấy phòng máy');

    // Kiểm tra CIDR hợp lệ ngay lúc nhập, tránh tới lúc thi mới phát hiện sai
    if (!isIpInCidr(dto.cidr.split('/')[0], dto.cidr)) {
      throw new BadRequestException(`Dải IP không hợp lệ: ${dto.cidr}`);
    }
    return this.prisma.roomIpRule.create({ data: { ...dto, roomId } });
  }

  async removeIpRule(id: string) {
    await this.prisma.roomIpRule.delete({ where: { id } });
    return { message: 'Đã xóa dải IP' };
  }
}
