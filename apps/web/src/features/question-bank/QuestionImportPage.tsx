import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import {
  Badge, Button, Card, ErrorBox, Loading, PageHeader, Select, Textarea,
} from '@/shared/components/ui';
import type { Chapter, Paginated, Subject } from '@/shared/types/api';
import { OptionEditor } from './OptionEditor';
import { QuestionPreviewCard } from './QuestionPreviewCard';
import { useQuestionImport } from './useQuestionImport';

/** Trang import cau hoi 3 buoc: tai file — xem truoc/sua — xac nhan (2.6, 2.7). */
export function QuestionImportPage() {
  const imp = useQuestionImport();
  const [editing, setEditing] = useState<number | null>(null);

  const subjects = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => (await api.get<Paginated<Subject>>('/catalog/subjects?limit=100')).data,
  });

  const chapters = useQuery({
    queryKey: ['chapters', imp.subjectId],
    enabled: !!imp.subjectId,
    queryFn: async () =>
      (await api.get<Chapter[]>(`/catalog/subjects/${imp.subjectId}/chapters`)).data,
  });

  const downloadTemplate = async () => {
    const res = await api.get('/questions/template.xlsx', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mau-cau-hoi.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const cleanSelected = imp.rows.filter(
    (r) => imp.selected.has(r.rowIndex) && r.rowErrors.length === 0,
  ).length;

  return (
    <div>
      <PageHeader
        title="Import câu hỏi"
        subtitle="Tải file — xem trước và sửa — xác nhận ghi vào ngân hàng"
        actions={
          <Link to="/ngan-hang-cau-hoi">
            <Button variant="ghost">← Ngân hàng câu hỏi</Button>
          </Link>
        }
      />

      {imp.step === 'upload' && (
        <Card className="p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="Nguồn file" value={imp.source} onChange={(e) => imp.setSource(e.target.value as 'excel' | 'word')}>
              <option value="excel">Excel (.xlsx) — câu hỏi thuần chữ</option>
              <option value="word">Word (.docx) — giữ công thức qua Pandoc</option>
            </Select>
            <Select label="Môn học" value={imp.subjectId} onChange={(e) => imp.setSubjectId(e.target.value)}>
              <option value="">— Chọn môn —</option>
              {subjects.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                </option>
              ))}
            </Select>
            {imp.source === 'word' && (
              <Select label="Chương (chung cho cả file)" value={imp.chapterId} onChange={(e) => imp.setChapterId(e.target.value)} disabled={!imp.subjectId}>
                <option value="">— Chọn chương —</option>
                {chapters.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
            <div>
              <p className="mb-1 text-xs font-medium text-text-secondary">File import</p>
              <input
                type="file"
                accept={imp.source === 'excel' ? '.xlsx' : '.docx'}
                onChange={(e) => imp.setFile(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              onClick={imp.parsePreview}
              disabled={imp.loading || !imp.file || !imp.subjectId || (imp.source === 'word' && !imp.chapterId)}
            >
              {imp.loading ? 'Đang đọc file…' : 'Xem trước →'}
            </Button>
            {imp.source === 'excel' && (
              <Button variant="ghost" onClick={downloadTemplate}>
                Tải file Excel mẫu
              </Button>
            )}
          </div>
          {imp.source === 'word' && (
            <p className="mt-3 text-xs text-text-subdued">
              Định dạng: dòng <span className="font-mono">[TB] nội dung $x^2$</span>, đáp án đúng
              đánh dấu <span className="font-mono">*B.</span> ở đầu dòng.
            </p>
          )}
          {imp.error ? <div className="mt-3"><ErrorBox error={imp.error} /></div> : null}
        </Card>
      )}

      {imp.step === 'preview' && (
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{imp.rows.length} dòng đọc được</Badge>
              <Badge tone={imp.errors.length ? 'danger' : 'success'}>{imp.errors.length} dòng lỗi</Badge>
              <Badge tone="success">{cleanSelected} dòng sẽ import</Badge>
              <span className="ml-auto flex gap-2">
                <Button variant="ghost" onClick={imp.reset}>
                  ← Chọn file khác
                </Button>
                <Button onClick={imp.confirm} disabled={imp.loading || cleanSelected === 0}>
                  {imp.loading ? 'Đang ghi…' : `Xác nhận import ${cleanSelected} câu`}
                </Button>
              </span>
            </div>
            {imp.errors.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-danger">
                {imp.errors.map((e, i) => (
                  <li key={i}>
                    Dòng {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            {imp.error ? <div className="mt-3"><ErrorBox error={imp.error} /></div> : null}
          </Card>

          {imp.rows.map((row) => {
            const checked = imp.selected.has(row.rowIndex);
            const isEditing = editing === row.rowIndex;
            return (
              <Card key={row.rowIndex} className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => imp.toggleRow(row.rowIndex)}
                    aria-label={`Chọn dòng ${row.rowIndex}`}
                    className="h-4 w-4"
                  />
                  <span className="font-mono text-[11px] text-text-subdued">Dòng {row.rowIndex}</span>
                  {row.rowErrors.length > 0 ? (
                    <Badge tone="danger">{row.rowErrors.join(' · ')}</Badge>
                  ) : (
                    <Badge tone="success">Hợp lệ</Badge>
                  )}
                  <span className="ml-auto">
                    <Button variant="ghost" onClick={() => setEditing(isEditing ? null : row.rowIndex)}>
                      {isEditing ? 'Thu gọn' : 'Sửa'}
                    </Button>
                  </span>
                </div>
                {isEditing ? (
                  <div className="space-y-3">
                    <Textarea
                      label="Nội dung"
                      rows={3}
                      value={row.content}
                      onChange={(e) => imp.editRow(row.rowIndex, { content: e.target.value })}
                    />
                    <OptionEditor
                      type={row.type}
                      options={row.options}
                      onChange={(options) => imp.editRow(row.rowIndex, { options })}
                    />
                  </div>
                ) : (
                  <QuestionPreviewCard content={row.content} options={row.options} />
                )}
              </Card>
            );
          })}
        </div>
      )}

      {imp.step === 'done' && (
        <Card className="p-4">
          <p className="mb-2 font-semibold text-success">
            Đã ghi {imp.result?.created ?? 0} câu vào ngân hàng
            {(imp.result?.failed ?? 0) > 0 && `, ${imp.result?.failed} dòng lỗi bị bỏ qua`}.
          </p>
          <div className="flex gap-2">
            <Link to="/ngan-hang-cau-hoi">
              <Button>Về ngân hàng câu hỏi</Button>
            </Link>
            <Button variant="ghost" onClick={imp.reset}>
              Import file khác
            </Button>
          </div>
        </Card>
      )}

      {subjects.isLoading && <Loading />}
    </div>
  );
}
