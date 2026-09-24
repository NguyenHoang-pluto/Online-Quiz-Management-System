import {
  Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Distribution } from '@/shared/types/api';

const BELOW = 'var(--color-chart-below)';
const PASS = 'var(--color-chart-pass)';

/**
 * Phổ điểm ca thi — chức năng 6.6.
 *
 * Một chuỗi duy nhất (số sinh viên) trên 5 khoảng điểm có thứ tự. Danh tính
 * khoảng do nhãn trục mang, nên màu không dùng để phân biệt khoảng mà để trả lời
 * câu hỏi giảng viên thực sự quan tâm: bao nhiêu em dưới điểm đạt.
 *
 * Hai màu đã qua kiểm định mù màu; xem ghi chú trong styles/index.css.
 */
export function ScoreDistributionChart({ data }: { data: Distribution }) {
  const rows = data.buckets.map((b) => ({
    label: b.label,
    range: b.max >= 10 ? `${b.min} – 10` : `${b.min} – ${b.max}`,
    count: b.count,
    percent: b.percent,
    below: b.max <= 5,
  }));

  const failed = rows.filter((r) => r.below).reduce((s, r) => s + r.count, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-semibold text-primary">Phổ điểm</h3>
          <p className="text-xs text-text-secondary">
            {data.total} bài đã chấm · trung bình {data.summary.average} · trung vị{' '}
            {data.summary.median} · độ lệch chuẩn {data.summary.stdDev}
          </p>
        </div>
        {/* Màu mang một tầng nghĩa thứ hai nên phải có chú giải, không để màu tự nói */}
        <ul className="flex gap-4 text-xs">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BELOW }} />
            <span className="text-text-secondary">Dưới điểm đạt ({failed})</span>
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PASS }} />
            <span className="text-text-secondary">Đạt trở lên ({data.total - failed})</span>
          </li>
        </ul>
      </div>

      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 22, right: 8, left: -18, bottom: 4 }}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border-default)' }}
              tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fill: 'var(--color-text-subdued)', fontSize: 11 }}
            />
            <ReferenceLine y={0} stroke="var(--color-border-default)" />
            <Tooltip
              cursor={{ fill: 'var(--color-surface-hover)' }}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid var(--color-border-default)',
                boxShadow: 'var(--shadow-level2)',
                fontSize: 13,
              }}
              formatter={(value: number, _n, item: any) => [
                `${value} sinh viên (${item.payload.percent}%)`,
                `Khoảng ${item.payload.range} điểm`,
              ]}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={64}>
              {rows.map((r) => (
                <Cell key={r.label} fill={r.below ? BELOW : PASS} />
              ))}
              <LabelList
                dataKey="count"
                position="top"
                offset={8}
                style={{ fill: 'var(--color-text-primary)', fontSize: 12, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
