import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { MathContent } from '@/shared/components/ui/MathContent';
import {
  Badge, Button, Card, ErrorBox, LABEL, Loading, Modal, difficultyTone, formatClock,
} from '@/shared/components/ui';
import { useProctoring } from './useProctoring';
import { useFaceProctoring } from './useFaceProctoring';
import { CameraMonitor } from './CameraMonitor';
import type { Paper } from '@/shared/types/api';

/**
 * Server báo phiên hiện tại chưa xác nhận thể lệ thi hay chưa.
 * Trả về examId để biết đường quay lại trang thể lệ, null nếu là lỗi khác.
 */
function needsRulesConsent(error: unknown): string | null {
  const data = (error as any)?.response?.data;
  return data?.code === 'CHUA_XAC_NHAN_THE_LE' ? (data.examId as string) : null;
}

/** Module 4 — Màn hình làm bài (chức năng 4.4 đến 4.8). */
export function DoExamPage() {
  const { attemptId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const paper = useQuery({
    queryKey: ['paper', attemptId],
    queryFn: async () => (await api.get<Paper>(`/attempts/${attemptId}`)).data,
    // Phiên chưa xác nhận thể lệ thì thử lại bao nhiêu lần cũng vậy
    retry: (failureCount, error) =>
      needsRulesConsent(error) === null && failureCount < 1,
    refetchOnWindowFocus: false,
  });

  /**
   * Đăng xuất rồi đăng nhập lại sinh phiên mới, và phiên mới chưa tích cam kết
   * thể lệ. Server từ chối trả đề; ở đây đưa thí sinh về đúng trang thể lệ
   * thay vì để họ nhìn một thông báo lỗi không biết bấm gì tiếp.
   */
  const consentExamId = needsRulesConsent(paper.error);
  useEffect(() => {
    // Chờ lần gọi lại kết thúc rồi mới quyết định: lỗi cũ còn nằm trong cache
    // trong lúc đang tải lại, điều hướng ngay sẽ thành vòng lặp thể lệ ↔ làm bài.
    if (consentExamId && !paper.isFetching) {
      navigate(`/thi/${consentExamId}/the-le`, { replace: true });
    }
  }, [consentExamId, paper.isFetching, navigate]);

  // Nạp đáp án đã lưu — chức năng 4.7, khôi phục sau khi tải lại trang
  useEffect(() => {
    if (!paper.data) return;
    const a: Record<string, string[]> = {};
    const f: Record<string, boolean> = {};
    for (const q of paper.data.questions) {
      a[q.questionId] = q.selectedOptionIds;
      f[q.questionId] = q.flagged;
    }
    setAnswers(a);
    setFlags(f);
    setRemaining(paper.data.remainingSeconds);
  }, [paper.data]);

  /**
   * Đồng hồ đếm ngược — chức năng 4.4.
   *
   * Mốc hết giờ do server cấp (deadlineAt). Bộ đếm ở đây chỉ để hiển thị;
   * nếu sinh viên chỉnh giờ máy thì server vẫn từ chối mọi thao tác sau hạn.
   */
  const deadline = paper.data ? new Date(paper.data.deadlineAt).getTime() : 0;
  const skew = useRef(0);
  useEffect(() => {
    if (!paper.data) return;
    skew.current = new Date(paper.data.serverTime).getTime() - Date.now();
  }, [paper.data]);

  const submit = useMutation({
    mutationFn: () => api.post(`/attempts/${attemptId}/submit`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-exams'] });
      navigate(`/ket-qua-cua-toi/${attemptId}`, { replace: true });
    },
  });

  const autoSubmit = useCallback(() => {
    if (!submit.isPending && !submit.isSuccess) submit.mutate();
  }, [submit]);

  useEffect(() => {
    if (!deadline) return;
    const tick = () => {
      const left = Math.floor((deadline - (Date.now() + skew.current)) / 1000);
      setRemaining(Math.max(0, left));
      if (left <= 0) autoSubmit();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [deadline, autoSubmit]);

  const running = !!paper.data && paper.data.status === 'IN_PROGRESS';
  // Camera chỉ bật ở ca thi TỪ XA. Thi tại phòng máy đã có giám thị người thật,
  // và máy bàn trong lab thường không có webcam.
  const cameraOn = running && paper.data?.proctoringMode === 'REMOTE';

  const pushRef = useRef<((e: any) => void) | null>(null);
  const handleFaceEvent = useCallback((e: any) => pushRef.current?.(e), []);

  const face = useFaceProctoring({
    enabled: cameraOn,
    thresholds: paper.data?.proctoring.thresholds ?? null,
    onEvent: handleFaceEvent,
  });

  const proctor = useProctoring({
    attemptId,
    thresholds: paper.data?.proctoring.thresholds ?? null,
    batchIntervalMs: paper.data?.proctoring.batchIntervalMs ?? 5000,
    enabled: running,
    onTerminated: autoSubmit,
    getEvidence: cameraOn ? face.takeEvidence : undefined,
  });
  pushRef.current = proctor.pushEvent;

  const saveAnswer = useMutation({
    mutationFn: (body: { questionId: string; selectedOptionIds: string[]; flagged?: boolean }) =>
      api.post(`/attempts/${attemptId}/answers`, body),
    onSuccess: () => setSavedAt(new Date().toLocaleTimeString('vi-VN')),
  });

  // Chức năng 4.6 — lưu ngay sau mỗi thao tác chọn
  const pick = (questionId: string, optionId: string, multiple: boolean) => {
    const prev = answers[questionId] ?? [];
    const next = multiple
      ? prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
      : [optionId];
    setAnswers({ ...answers, [questionId]: next });
    saveAnswer.mutate({ questionId, selectedOptionIds: next, flagged: flags[questionId] });
  };

  const toggleFlag = (questionId: string) => {
    const next = !flags[questionId];
    setFlags({ ...flags, [questionId]: next });
    saveAnswer.mutate({
      questionId,
      selectedOptionIds: answers[questionId] ?? [],
      flagged: next,
    });
  };

  const answeredCount = useMemo(
    () => Object.values(answers).filter((v) => v.length > 0).length,
    [answers],
  );

  if (paper.isLoading) return <Loading label="Đang tải đề thi..." />;
  // Đang chuyển về trang thể lệ, đừng chớp một khung báo lỗi rồi mới đi
  if (consentExamId) return <Loading label="Đang mở lại thể lệ thi..." />;
  if (paper.isError) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorBox error={paper.error} />
        <Button className="mt-4" variant="ghost" onClick={() => navigate('/ca-thi')}>
          Về danh sách ca thi
        </Button>
      </div>
    );
  }

  const p = paper.data!;
  const q = p.questions[current];
  const isMultiple = q.type === 'MULTIPLE_CHOICE';
  const low = remaining <= 300;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      {/* Thanh trạng thái: đồng hồ, tiến độ, vi phạm */}
      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-primary">{p.title}</p>
          <p className="font-mono text-xs text-text-subdued">
            {LABEL.mode[p.proctoringMode]} · đã làm {answeredCount}/{p.questions.length} câu
          </p>
        </div>

        <div className="flex items-center gap-3">
          {proctor.state.violationCount > 0 && (
            <Badge tone={proctor.state.violationCount >= proctor.state.maxViolations ? 'danger' : 'warning'}>
              Vi phạm {proctor.state.violationCount}/{proctor.state.maxViolations}
            </Badge>
          )}
          <div
            className={`rounded-default px-3 py-1.5 text-center ${low ? 'bg-danger-bg' : 'bg-selected-bg'}`}
          >
            <p className="text-[10px] tracking-wide text-text-subdued uppercase">Còn lại</p>
            <p
              className={`font-mono text-xl font-bold tabular-nums ${low ? 'text-danger' : 'text-secondary'}`}
            >
              {formatClock(remaining)}
            </p>
          </div>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Nộp bài
          </Button>
        </div>
      </Card>

      {proctor.state.warning && (
        <div className="mb-4 rounded-default bg-warning-bg px-4 py-2.5 text-sm text-warning">
          <strong>Cảnh báo giám sát:</strong> {proctor.state.warning}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Khung câu hỏi */}
        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-default bg-primary px-2.5 py-1 font-mono text-xs font-bold text-white">
              Câu {current + 1} / {p.questions.length}
            </span>
            <Badge tone={difficultyTone(q.difficulty)}>{LABEL.difficulty[q.difficulty]}</Badge>
            <Badge>{LABEL.questionType[q.type]}</Badge>
            <span className="font-mono text-xs text-text-subdued">+{q.score.toFixed(2)} điểm</span>
            <button
              onClick={() => toggleFlag(q.questionId)}
              className={`ml-auto rounded-default border px-3 py-1.5 text-xs font-medium transition ${
                flags[q.questionId]
                  ? 'border-warning bg-warning text-white'
                  : 'border-border-default hover:bg-surface-hover'
              }`}
            >
              {flags[q.questionId] ? 'Đã đánh dấu' : 'Đánh dấu xem lại'}
            </button>
          </div>

          <MathContent content={q.content} className="mb-5 text-[17px]" />

          {q.imageUrl && (
            <img src={q.imageUrl} alt="" className="mb-5 max-h-80 rounded-card border border-border-default" />
          )}

          <div className="space-y-2.5">
            {q.options.map((o) => {
              const selected = (answers[q.questionId] ?? []).includes(o.id);
              return (
                <button
                  key={o.id}
                  onClick={() => pick(q.questionId, o.id, isMultiple)}
                  className={`flex w-full items-start gap-3 rounded-card border p-3 text-left transition ${
                    selected
                      ? 'border-secondary bg-selected-bg ring-2 ring-[var(--color-secondary)] ring-inset'
                      : 'border-border-default bg-surface-card hover:bg-surface-hover'
                  }`}
                  style={{ minHeight: 56 }}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center font-mono text-xs font-bold ${
                      isMultiple ? 'rounded-default' : 'rounded-full'
                    } ${selected ? 'bg-secondary text-white' : 'bg-surface-hover text-text-secondary'}`}
                  >
                    {o.label}
                  </span>
                  <MathContent content={o.content} className="pt-0.5" />
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-border-default pt-4">
            <Button
              variant="ghost"
              disabled={current === 0}
              onClick={() => setCurrent((c) => c - 1)}
            >
              ← Câu trước
            </Button>

            {savedAt && (
              <span className="rounded-default bg-success-bg px-3 py-1.5 font-mono text-xs text-success">
                ✓ Đã tự động lưu lúc {savedAt}
              </span>
            )}
            {saveAnswer.isError && (
              <span className="rounded-default bg-danger-bg px-3 py-1.5 text-xs text-danger">
                Lưu thất bại, đang thử lại...
              </span>
            )}

            <Button
              disabled={current === p.questions.length - 1}
              onClick={() => setCurrent((c) => c + 1)}
            >
              Câu tiếp →
            </Button>
          </div>
        </Card>

        {/* Cột phải: camera (nếu thi từ xa) rồi tới bảng điều hướng */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {cameraOn && (
          <CameraMonitor videoRef={face.videoRef} canvasRef={face.canvasRef} state={face.state} />
        )}

        {/* Bảng điều hướng câu hỏi — chức năng 4.5 */}
        <Card className="h-fit p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Bảng điều hướng</p>
            <span className="font-mono text-xs text-secondary">
              {answeredCount}/{p.questions.length}
            </span>
          </div>

          <div className="mb-4 grid grid-cols-6 gap-1.5 lg:grid-cols-5">
            {p.questions.map((item, i) => {
              const done = (answers[item.questionId] ?? []).length > 0;
              const flagged = flags[item.questionId];
              const active = i === current;
              return (
                <button
                  key={item.questionId}
                  onClick={() => setCurrent(i)}
                  className={`relative h-9 rounded-default font-mono text-xs font-semibold transition ${
                    flagged
                      ? 'bg-warning text-white'
                      : done
                        ? 'bg-primary text-white'
                        : 'border border-border-strong bg-surface-card text-text-secondary'
                  } ${active ? 'ring-2 ring-[var(--color-secondary)] ring-offset-1' : ''}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <ul className="space-y-1.5 border-t border-border-default pt-3 text-xs">
            {[
              ['bg-primary', 'Đã trả lời', answeredCount],
              ['border border-border-strong bg-surface-card', 'Chưa làm', p.questions.length - answeredCount],
              ['bg-warning', 'Đánh dấu xem lại', Object.values(flags).filter(Boolean).length],
            ].map(([cls, label, n]) => (
              <li key={String(label)} className="flex items-center gap-2">
                <span className={`h-3.5 w-3.5 rounded-sm ${cls}`} />
                <span className="text-text-secondary">{label}</span>
                <span className="ml-auto font-mono font-semibold">{n}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t border-border-default pt-3">
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-text-secondary">Tiến độ</span>
              <span className="font-mono font-semibold">
                {Math.round((answeredCount / p.questions.length) * 100)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
              <div
                className="h-full rounded-full bg-secondary transition-all"
                style={{ width: `${(answeredCount / p.questions.length) * 100}%` }}
              />
            </div>
          </div>
        </Card>
        </div>
      </div>

      <Modal open={confirmOpen} title="Xác nhận nộp bài" onClose={() => setConfirmOpen(false)}>
        <p className="text-sm text-text-secondary">
          Bạn đã trả lời <strong>{answeredCount}</strong> trên tổng{' '}
          <strong>{p.questions.length}</strong> câu.
        </p>
        {answeredCount < p.questions.length && (
          <p className="mt-3 rounded-default bg-warning-bg px-3 py-2 text-sm text-warning">
            Còn {p.questions.length - answeredCount} câu chưa làm. Các câu bỏ trống được tính 0 điểm.
          </p>
        )}
        <p className="mt-3 text-sm text-danger">Sau khi nộp, bạn không thể làm lại bài thi này.</p>
        {submit.isError && (
          <div className="mt-3">
            <ErrorBox error={submit.error} />
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={() => setConfirmOpen(false)}>
            Quay lại làm bài
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? 'Đang nộp...' : 'Xác nhận nộp bài'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
