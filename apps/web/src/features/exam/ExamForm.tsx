import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { Button, ErrorBox, Input, LABEL, Select } from '@/shared/components/ui';
import type { CourseClass, Exam, ExamRoom, Paginated } from '@/shared/types/api';

/** Định dạng cho input datetime-local, vốn cần giờ địa phương không kèm múi. */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-default border border-border-default p-3 hover:bg-surface-hover">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-0.5 h-4 w-4 accent-[var(--color-secondary)]"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-[11px] text-text-subdued">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Module 3 — form cấu hình đề thi, dùng chung cho tạo mới (3.1) và sửa bản nháp.
 * Gồm cả cấu hình trộn đề (3.3) và cách hiển thị kết quả (3.4).
 */
export function ExamForm({
  exam,
  pending,
  error,
  submitLabel,
  onSubmit,
}: {
  /** Có thì là sửa đề, không có thì là tạo đề mới */
  exam?: Exam;
  pending: boolean;
  error: unknown;
  submitLabel: string;
  onSubmit: (body: Record<string, unknown>) => void;
}) {
  const [mode, setMode] = useState<'LAB' | 'REMOTE'>(exam?.proctoringMode ?? 'LAB');

  const classes = useQuery({
    queryKey: ['course-classes'],
    enabled: !exam,
    queryFn: async () =>
      (await api.get<Paginated<CourseClass>>('/catalog/course-classes?limit=100')).data,
  });

  const rooms = useQuery({
    queryKey: ['rooms'],
    queryFn: async () => (await api.get<ExamRoom[]>('/catalog/rooms')).data,
  });

  const openAt = exam ? new Date(exam.openAt) : new Date();
  const closeAt = exam ? new Date(exam.closeAt) : new Date(openAt.getTime() + 3 * 3600_000);

  return (
    <form
      className="space-y-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        const f = new FormData(ev.currentTarget);
        onSubmit({
          title: f.get('title'),
          // Lớp học phần chỉ chọn lúc tạo, sau đó không đổi được
          ...(exam ? {} : { courseClassId: f.get('courseClassId') }),
          durationMinutes: Number(f.get('durationMinutes')),
          openAt: new Date(String(f.get('openAt'))).toISOString(),
          closeAt: new Date(String(f.get('closeAt'))).toISOString(),
          totalScore: Number(f.get('totalScore')),
          resultDisplay: f.get('resultDisplay'),
          shuffleQuestions: f.get('shuffleQuestions') === 'on',
          shuffleOptions: f.get('shuffleOptions') === 'on',
          strictMultipleChoice: f.get('strictMultipleChoice') === 'strict',
          proctoringMode: mode,
          ...(mode === 'LAB' ? { roomId: f.get('roomId') } : {}),
        });
      }}
    >
      <Input
        name="title"
        label="Tiêu đề đề thi"
        placeholder="Thi giữa kỳ Giải tích 2"
        defaultValue={exam?.title}
        required
        minLength={3}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {exam ? (
          <Input
            label="Lớp học phần"
            value={`${exam.courseClass.code} — ${exam.courseClass.name}`}
            disabled
            readOnly
          />
        ) : (
          <Select name="courseClassId" label="Lớp học phần" required>
            {classes.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name} ({c._count.enrollments} SV)
              </option>
            ))}
          </Select>
        )}
        <Input
          name="durationMinutes"
          label="Thời lượng làm bài (phút)"
          type="number"
          defaultValue={exam?.durationMinutes ?? 60}
          min={1}
          max={600}
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          name="openAt"
          label="Thời điểm mở phòng thi"
          type="datetime-local"
          defaultValue={toLocalInput(openAt)}
          required
        />
        <Input
          name="closeAt"
          label="Thời điểm đóng phòng thi"
          type="datetime-local"
          defaultValue={toLocalInput(closeAt)}
          required
          hint="Khung giờ phải dài hơn thời lượng làm bài"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          name="totalScore"
          label="Tổng điểm quy đổi"
          type="number"
          step="0.5"
          min={1}
          max={100}
          defaultValue={exam ? Number(exam.totalScore) : 10}
          required
        />
        <Select
          name="resultDisplay"
          label="Hiển thị kết quả cho sinh viên"
          defaultValue={exam?.resultDisplay ?? 'SCORE_ONLY'}
        >
          {Object.entries(LABEL.resultDisplay).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-text-secondary">Trộn đề</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle
            name="shuffleQuestions"
            label="Trộn thứ tự câu hỏi"
            hint="Tắt thì câu hỏi xếp theo thứ tự dòng ma trận"
            defaultChecked={exam?.shuffleQuestions ?? true}
          />
          <Toggle
            name="shuffleOptions"
            label="Trộn thứ tự phương án"
            hint="Nhãn A, B, C, D được gán lại sau khi trộn"
            defaultChecked={exam?.shuffleOptions ?? true}
          />
        </div>
      </div>

      <Select
        name="strictMultipleChoice"
        label="Chấm câu nhiều đáp án"
        defaultValue={exam && !exam.strictMultipleChoice ? 'partial' : 'strict'}
      >
        <option value="strict">Chọn đúng hết mới có điểm</option>
        <option value="partial">Tính điểm từng phần</option>
      </Select>

      <div>
        <p className="mb-1.5 text-xs font-medium text-text-secondary">Hình thức thi</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(['LAB', 'REMOTE'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-card border-2 p-3 text-left transition ${
                mode === m
                  ? 'border-secondary bg-selected-bg'
                  : 'border-border-default hover:bg-surface-hover'
              }`}
            >
              <span className="block text-sm font-semibold">{LABEL.mode[m]}</span>
              <span className="mt-0.5 block text-[11px] text-text-secondary">
                {m === 'LAB'
                  ? 'Khóa dải IP phòng máy · ngưỡng chặt · hủy bài sau 3 vi phạm'
                  : 'Nhận diện khuôn mặt tại máy SV · ngưỡng rộng · hủy sau 5 vi phạm'}
              </span>
            </button>
          ))}
        </div>
        {exam && mode !== exam.proctoringMode && (
          <p className="mt-2 rounded-default bg-warning-bg px-3 py-2 text-xs text-warning">
            Đổi hình thức thi sẽ áp dụng lại bộ ngưỡng giám sát chuẩn của hình thức mới.
          </p>
        )}
      </div>

      {/* Chờ có danh sách phòng rồi mới dựng, nếu không defaultValue rơi về phòng đầu tiên */}
      {mode === 'LAB' && rooms.data && (
        <Select name="roomId" label="Phòng máy" defaultValue={exam?.roomId ?? undefined} required>
          {rooms.data.map((r) => (
            <option key={r.id} value={r.id}>
              {r.code} — {r.name} ({r.ipRules.length} dải IP)
            </option>
          ))}
        </Select>
      )}

      {!!error && <ErrorBox error={error} />}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Đang lưu...' : submitLabel}
      </Button>
    </form>
  );
}
