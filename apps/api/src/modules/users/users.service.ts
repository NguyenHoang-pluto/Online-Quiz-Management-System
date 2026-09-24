import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import ExcelJS from 'exceljs';

import { PrismaService } from '../../infra/prisma/prisma.service';
import { PaginationDto, paginate } from '../../common/dto/pagination.dto';
import type { CreateUserDto, UpdateUserDto, ListUsersDto } from './dto/users.dto';

const DEFAULT_PASSWORD = 'EduExam@123';

/** Không bao giờ trả passwordHash ra API. */
const SAFE_USER = {
  id: true,
  code: true,
  email: true,
  fullName: true,
  role: true,
  status: true,
  avatarUrl: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/**
 * MODULE 1 — Quản lý tài khoản.
 * Phụ trách: Trương Gia Huy
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(pg: PaginationDto, filter: ListUsersDto) {
    const where: any = {};
    if (filter.role) where.role = filter.role;
    if (filter.status) where.status = filter.status;
    if (pg.q) {
      where.OR = [
        { code: { contains: pg.q } },
        { fullName: { contains: pg.q } },
        { email: { contains: pg.q } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: SAFE_USER,
        skip: pg.skip,
        take: pg.limit,
        orderBy: { code: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(items, total, pg);
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SAFE_USER });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    return user;
  }

  async create(dto: CreateUserDto) {
    const existed = await this.prisma.user.findFirst({
      where: { OR: [{ code: dto.code }, { email: dto.email }] },
    });
    if (existed) {
      throw new BadRequestException(
        existed.code === dto.code ? 'Mã đăng nhập đã tồn tại' : 'Email đã tồn tại',
      );
    }

    return this.prisma.user.create({
      data: {
        code: dto.code,
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        passwordHash: await argon2.hash(dto.password ?? DEFAULT_PASSWORD, {
          type: argon2.argon2id,
        }),
      },
      select: SAFE_USER,
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: dto, select: SAFE_USER });
  }

  /**
   * Chức năng 1.4 — khóa / mở khóa tài khoản.
   *
   * Cố ý KHÔNG có thao tác xóa cứng: quy tắc bảo toàn tính liêm chính dữ liệu
   * khảo thí trong mockup Module 1 yêu cầu giữ lại lịch sử thi của mọi thí sinh.
   */
  async setStatus(id: string, status: 'ACTIVE' | 'LOCKED') {
    await this.findOne(id);

    const [user] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status }, select: SAFE_USER }),
      // Khóa tài khoản thì thu hồi luôn mọi phiên đang đăng nhập
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: status === 'LOCKED' ? new Date() : undefined },
      }),
    ]);
    return user;
  }

  async resetPassword(id: string, newPassword: string) {
    await this.findOne(id);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash: await argon2.hash(newPassword, { type: argon2.argon2id }) },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: 'Đã đặt lại mật khẩu' };
  }

  /**
   * Chức năng 1.5 — Import danh sách sinh viên từ file Excel.
   *
   * Định dạng cột bắt buộc ở dòng 1: MSSV | Họ tên | Email
   * Dòng lỗi được ghi lại kèm số dòng để người dùng sửa file rồi nhập lại,
   * thay vì hủy toàn bộ lần nhập.
   */
  async importStudentsFromExcel(buffer: Buffer, actorId: string) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('File Excel không có sheet nào');

    const errors: { row: number; message: string }[] = [];
    const toCreate: { code: string; email: string; fullName: string }[] = [];
    const seen = new Set<string>();

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // bỏ dòng tiêu đề

      const code = String(row.getCell(1).value ?? '').trim();
      const fullName = String(row.getCell(2).value ?? '').trim();
      const rawEmail = row.getCell(3).value;
      // ExcelJS trả về object cho ô hyperlink
      const email = String(
        typeof rawEmail === 'object' && rawEmail !== null && 'text' in rawEmail
          ? (rawEmail as any).text
          : (rawEmail ?? ''),
      ).trim();

      if (!code && !fullName && !email) return; // dòng trống

      if (!code) return void errors.push({ row: rowNumber, message: 'Thiếu MSSV' });
      if (!fullName) return void errors.push({ row: rowNumber, message: 'Thiếu họ tên' });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return void errors.push({ row: rowNumber, message: `Email không hợp lệ: ${email}` });
      }
      if (seen.has(code)) {
        return void errors.push({ row: rowNumber, message: `MSSV trùng trong file: ${code}` });
      }

      seen.add(code);
      toCreate.push({ code, email, fullName });
    });

    // Loại những MSSV đã có trong hệ thống
    const existing = await this.prisma.user.findMany({
      where: { code: { in: toCreate.map((s) => s.code) } },
      select: { code: true },
    });
    const existingCodes = new Set(existing.map((e) => e.code));
    const fresh = toCreate.filter((s) => !existingCodes.has(s.code));

    const passwordHash = await argon2.hash(DEFAULT_PASSWORD, { type: argon2.argon2id });
    const created = await this.prisma.user.createMany({
      data: fresh.map((s) => ({ ...s, role: 'STUDENT' as const, passwordHash })),
      skipDuplicates: true,
    });

    await this.prisma.importJob.create({
      data: {
        source: 'EXCEL',
        status: errors.length > 0 ? 'SUCCEEDED' : 'SUCCEEDED',
        fileName: 'import-sinh-vien.xlsx',
        totalRows: toCreate.length + errors.length,
        successRows: created.count,
        failedRows: errors.length,
        errors: errors.length > 0 ? (errors as any) : undefined,
        createdById: actorId,
        finishedAt: new Date(),
      },
    });

    return {
      created: created.count,
      skippedExisting: existingCodes.size,
      failed: errors.length,
      errors,
      defaultPassword: DEFAULT_PASSWORD,
    };
  }

  /** Tạo file Excel mẫu để giảng viên tải về điền. */
  async buildStudentTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Danh sách sinh viên');
    ws.columns = [
      { header: 'MSSV', key: 'code', width: 16 },
      { header: 'Họ tên', key: 'fullName', width: 30 },
      { header: 'Email', key: 'email', width: 34 },
    ];
    ws.getRow(1).font = { bold: true };
    ws.addRow({ code: '3122410127', fullName: 'Nguyễn Huy Hoàng', email: 'hoang.nh@edu.vn' });
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
