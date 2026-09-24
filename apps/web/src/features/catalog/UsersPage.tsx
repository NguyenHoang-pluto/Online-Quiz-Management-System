import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import {
  Badge, Button, Card, Cell, Empty, ErrorBox, Input, Loading, Modal, PageHeader,
  Pager, Row, Select, Table, formatDateTime,
} from '@/shared/components/ui';
import type { Paginated, User } from '@/shared/types/api';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Quản trị viên',
  LECTURER: 'Giảng viên',
  STUDENT: 'Sinh viên',
};

/** Module 1 — Quản lý tài khoản và import sinh viên từ Excel. */
export function UsersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [openCreate, setOpenCreate] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const users = useQuery({
    queryKey: ['users', page, role, q],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (role) params.set('role', role);
      if (q) params.set('q', q);
      return (await api.get<Paginated<User>>(`/users?${params}`)).data;
    },
  });

  const createUser = useMutation({
    mutationFn: (body: unknown) => api.post('/users', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setOpenCreate(false);
    },
  });

  const toggleLock = useMutation({
    mutationFn: (u: User) =>
      api.patch(`/users/${u.id}/${u.status === 'ACTIVE' ? 'lock' : 'unlock'}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const importExcel = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/users/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data as {
        created: number;
        skippedExisting: number;
        failed: number;
        errors: { row: number; message: string }[];
        defaultPassword: string;
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const downloadTemplate = async () => {
    const res = await api.get('/users/student-template.xlsx', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mau-danh-sach-sinh-vien.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="Quản lý tài khoản"
        subtitle="Tài khoản không bị xóa cứng — chỉ khóa hoặc mở khóa, để bảo toàn lịch sử thi"
        actions={
          <>
            <Button variant="ghost" onClick={downloadTemplate}>
              Tải file mẫu
            </Button>
            <Button variant="ghost" onClick={() => setOpenImport(true)}>
              Import Excel
            </Button>
            <Button onClick={() => setOpenCreate(true)}>+ Thêm tài khoản</Button>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Input
            placeholder="Tìm theo MSSV, họ tên hoặc email..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tất cả vai trò</option>
            <option value="ADMIN">Quản trị viên</option>
            <option value="LECTURER">Giảng viên</option>
            <option value="STUDENT">Sinh viên</option>
          </Select>
        </div>
      </Card>

      <Card>
        {users.isLoading ? (
          <Loading />
        ) : users.data?.items.length === 0 ? (
          <Empty message="Không tìm thấy tài khoản nào" />
        ) : (
          <>
            <Table
              head={['Mã', 'Họ và tên', 'Email', 'Vai trò', 'Trạng thái', 'Đăng nhập gần nhất', '']}
            >
              {users.data?.items.map((u) => (
                <Row key={u.id}>
                  <Cell className="font-mono text-xs font-semibold">{u.code}</Cell>
                  <Cell>{u.fullName}</Cell>
                  <Cell className="text-xs text-text-secondary">{u.email}</Cell>
                  <Cell>
                    <Badge tone={u.role === 'ADMIN' ? 'danger' : u.role === 'LECTURER' ? 'info' : 'neutral'}>
                      {ROLE_LABEL[u.role]}
                    </Badge>
                  </Cell>
                  <Cell>
                    <Badge tone={u.status === 'ACTIVE' ? 'success' : 'danger'}>
                      {u.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}
                    </Badge>
                  </Cell>
                  <Cell className="font-mono text-xs">{formatDateTime(u.lastLoginAt)}</Cell>
                  <Cell>
                    <Button
                      variant={u.status === 'ACTIVE' ? 'ghost' : 'success'}
                      disabled={toggleLock.isPending}
                      onClick={() => toggleLock.mutate(u)}
                    >
                      {u.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'}
                    </Button>
                  </Cell>
                </Row>
              ))}
            </Table>
            <Pager page={page} totalPages={users.data?.totalPages ?? 1} onChange={setPage} />
          </>
        )}
      </Card>

      <Modal open={openCreate} title="Thêm tài khoản" onClose={() => setOpenCreate(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            createUser.mutate({
              code: f.get('code'),
              email: f.get('email'),
              fullName: f.get('fullName'),
              role: f.get('role'),
            });
          }}
        >
          <Input name="code" label="MSSV / Mã giảng viên" required />
          <Input name="fullName" label="Họ và tên" required />
          <Input name="email" label="Email" type="email" required />
          <Select name="role" label="Vai trò" defaultValue="STUDENT" required>
            <option value="STUDENT">Sinh viên</option>
            <option value="LECTURER">Giảng viên</option>
            <option value="ADMIN">Quản trị viên</option>
          </Select>
          <p className="rounded-default bg-selected-bg px-3 py-2 text-xs text-secondary">
            Mật khẩu mặc định: <span className="font-mono font-semibold">EduExam@123</span>
          </p>
          {createUser.isError && <ErrorBox error={createUser.error} />}
          <Button type="submit" disabled={createUser.isPending} className="w-full">
            {createUser.isPending ? 'Đang tạo...' : 'Tạo tài khoản'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={openImport}
        title="Import sinh viên từ Excel"
        onClose={() => {
          setOpenImport(false);
          importExcel.reset();
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            File cần 3 cột theo thứ tự: <strong>MSSV</strong>, <strong>Họ tên</strong>,{' '}
            <strong>Email</strong>. Dòng đầu là tiêu đề.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="w-full rounded-default border border-border-default px-3 py-2 text-sm file:mr-3 file:rounded-default file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-white"
          />
          {importExcel.isError && <ErrorBox error={importExcel.error} />}
          {importExcel.data && (
            <div className="space-y-1 rounded-default bg-success-bg px-3 py-2 text-sm text-success">
              <p>Đã tạo {importExcel.data.created} tài khoản.</p>
              {importExcel.data.skippedExisting > 0 && (
                <p>Bỏ qua {importExcel.data.skippedExisting} MSSV đã tồn tại.</p>
              )}
              {importExcel.data.failed > 0 && (
                <div className="text-danger">
                  <p>{importExcel.data.failed} dòng lỗi:</p>
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {importExcel.data.errors.slice(0, 10).map((er, i) => (
                      <li key={i}>
                        Dòng {er.row}: {er.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <Button
            className="w-full"
            disabled={importExcel.isPending}
            onClick={() => {
              const file = fileRef.current?.files?.[0];
              if (file) importExcel.mutate(file);
            }}
          >
            {importExcel.isPending ? 'Đang xử lý...' : 'Bắt đầu import'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
