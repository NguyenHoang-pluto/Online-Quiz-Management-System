import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import {
  Badge, Button, Card, ErrorBox, LABEL, Loading, formatDateTime,
} from '@/shared/components/ui';
import type { ExamRules, Paper } from '@/shared/types/api';

/** Module 4 — Thể lệ thi và xác nhận trước khi bắt đầu (chức năng 4.2). */
export function ExamRulesPage() {
  const { examId = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [acceptRules, setAcceptRules] = useState(false);
  const [acceptBiometric, setAcceptBiometric] = useState(false);
  const [machineCode, setMachineCode] = useState('');
  const [camera, setCamera] = useState<'chua-thu' | 'dang-thu' | 'ok' | 'loi'>('chua-thu');
  const [cameraError, setCameraError] = useState('');

  /** Chức năng 4.10 — thử mở camera trước khi đồng hồ bắt đầu chạy. */
  const checkCamera = async () => {
    setCamera('dang-thu');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setCamera('ok');
    } catch (e) {
      const name = (e as DOMException)?.name;
      setCameraError(
        name === 'NotAllowedError'
          ? 'Bạn đã từ chối quyền camera. Hãy bấm vào biểu tượng khoá trên thanh địa chỉ để cấp lại quyền.'
          : name === 'NotFoundError'
            ? 'Không tìm thấy camera nào trên thiết bị này.'
            : `Không mở được camera: ${(e as Error).message}`,
      );
      setCamera('loi');
    }
  };

  const rules = useQuery({
    queryKey: ['rules', examId],
    queryFn: async () => (await api.get<ExamRules>(`/attempts/exams/${examId}/rules`)).data,
  });

  const start = useMutation({
    mutationFn: async () =>
      (
        await api.post<Paper>(`/attempts/exams/${examId}/start`, {
          acceptRules,
          acceptBiometric,
          machineCode: machineCode || undefined,
        })
      ).data,
    onSuccess: (paper) => {
      // Đặt sẵn đề vào cache: màn làm bài khỏi gọi lại, và nếu lần vào trước
      // đã bị từ chối vì chưa xác nhận thể lệ thì lỗi cũ cũng được dọn luôn.
      qc.setQueryData(['paper', paper.attemptId], paper);
      navigate(`/thi/lam-bai/${paper.attemptId}`, { replace: true });
    },
  });

  if (rules.isLoading) return <Loading />;
  if (rules.isError) return <div className="p-6"><ErrorBox error={rules.error} /></div>;

  const r = rules.data!;
  const ready = acceptRules && (!r.requiresBiometricConsent || acceptBiometric);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Card className="p-6">
        <Badge tone={r.proctoringMode === 'LAB' ? 'info' : 'warning'}>
          {LABEL.mode[r.proctoringMode]}
        </Badge>
        <h1 className="mt-3 text-xl font-bold text-primary">{r.title}</h1>

        {r.resuming && (
          <p className="mt-3 rounded-default bg-warning-bg px-3 py-2 text-sm text-warning">
            Bạn đang có bài làm dở ở ca thi này. Đáp án đã lưu vẫn còn nguyên và đồng hồ
            vẫn đang chạy; xác nhận lại thể lệ bên dưới để làm tiếp.
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-card bg-surface p-4 text-sm sm:grid-cols-4">
          {[
            ['Số câu', r.totalQuestions],
            ['Thời lượng', `${r.durationMinutes} phút`],
            ['Thang điểm', r.totalScore],
            ['Phòng thi', r.room?.code ?? 'Tại nhà'],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <dt className="text-[11px] tracking-wide text-text-subdued uppercase">{k}</dt>
              <dd className="font-mono text-base font-semibold text-primary">{v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-xs text-text-subdued">
          Phòng thi mở từ {formatDateTime(r.openAt)} đến {formatDateTime(r.closeAt)}
        </p>

        <h2 className="mt-6 mb-2 font-semibold">Thể lệ thi</h2>
        <ul className="space-y-2">
          {r.rules.map((rule, i) => (
            <li key={i} className="flex gap-2 text-sm text-text-secondary">
              <span className="mt-0.5 font-mono text-xs text-secondary">{i + 1}.</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>

        {r.proctoringMode === 'LAB' && (
          <label className="mt-5 block">
            <span className="mb-1 block text-xs font-medium text-text-secondary">
              Mã máy trạm (ghi trên thân máy)
            </span>
            <input
              value={machineCode}
              onChange={(e) => setMachineCode(e.target.value)}
              placeholder="D9-04"
              className="w-full rounded-default border border-border-default px-3 py-2 font-mono text-sm outline-none focus:border-secondary"
            />
          </label>
        )}

        <div className="mt-6 space-y-3 border-t border-border-default pt-5">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={acceptRules}
              onChange={(e) => setAcceptRules(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--color-secondary)]"
            />
            <span>Tôi đã đọc và cam kết tuân thủ toàn bộ thể lệ thi nêu trên.</span>
          </label>

          {r.requiresBiometricConsent && (
            <>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-default bg-warning-bg p-3 text-sm">
                <input
                  type="checkbox"
                  checked={acceptBiometric}
                  onChange={(e) => setAcceptBiometric(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--color-warning)]"
                />
                <span>
                  Tôi đồng ý cho hệ thống dùng camera để nhận diện khuôn mặt trong suốt ca thi.
                  Việc nhận diện chạy ngay trên máy tôi, <strong>video không được gửi đi</strong>;
                  hệ thống chỉ lưu ảnh tại thời điểm phát hiện bất thường và tự động xóa sau 30 ngày.
                </span>
              </label>

              {/* Kiểm tra thiết bị TRƯỚC khi đồng hồ bắt đầu chạy. Phát hiện
                  camera hỏng lúc đã vào phòng thi thì đã mất thời gian làm bài. */}
              <div className="rounded-default border border-border-default p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Kiểm tra camera</p>
                    <p className="text-[11px] text-text-subdued">
                      Nên thử trước, tránh vào thi rồi mới phát hiện hỏng
                    </p>
                  </div>
                  <Button variant="ghost" onClick={checkCamera} disabled={camera === 'dang-thu'}>
                    {camera === 'dang-thu' ? 'Đang thử...' : 'Thử camera'}
                  </Button>
                </div>

                {camera === 'ok' && (
                  <p className="mt-2 rounded-default bg-success-bg px-3 py-2 text-xs text-success">
                    Camera hoạt động bình thường. Bạn có thể vào thi.
                  </p>
                )}
                {camera === 'loi' && (
                  <p className="mt-2 rounded-default bg-danger-bg px-3 py-2 text-xs text-danger">
                    {cameraError}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {start.isError && (
          <div className="mt-4">
            <ErrorBox error={start.error} />
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <Button variant="ghost" onClick={() => navigate('/ca-thi')}>
            Quay lại
          </Button>
          <Button
            className="flex-1"
            disabled={!ready || start.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending
              ? 'Đang vào phòng thi...'
              : r.resuming
                ? 'Tiếp tục làm bài'
                : 'Bắt đầu làm bài'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
