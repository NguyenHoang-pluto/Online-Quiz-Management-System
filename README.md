# EduExam Pro — Hệ thống thi trắc nghiệm trực tuyến

> Đồ án môn học — **Nhóm 08**
> Hỗ trợ hiển thị công thức toán (KaTeX/LaTeX) và giám sát hành vi thi cho cả
> hai hình thức: **thi tại phòng máy** và **thi từ xa**.

---

## 1. Công nghệ sử dụng

| Tầng | Công nghệ |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, TanStack Query, Zustand, KaTeX, Recharts |
| Backend | NestJS 11, TypeScript, Prisma 6, Passport-JWT, Socket.IO, BullMQ |
| CSDL | MySQL 8.0 (`utf8mb4_0900_ai_ci`) |
| Cache / Realtime | Redis 7 |
| Lưu trữ tệp | MinIO (tương thích S3) |
| Công cụ | Docker Compose, Pandoc, ExcelJS, Sharp |

---

## 2. Cấu trúc thư mục

```
eduexam/
├── apps/
│   ├── api/                      # Backend NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma     # ERD toàn hệ thống
│   │   │   └── seed.ts           # Dữ liệu khởi tạo
│   │   └── src/
│   │       ├── common/           # Dùng chung: guard, filter, decorator
│   │       ├── config/           # Biến môi trường
│   │       ├── infra/            # Hạ tầng: Prisma, Redis, S3, Queue, Socket
│   │       ├── modules/          # 8 module nghiệp vụ (xem mục 5)
│   │       └── main.ts
│   │
│   └── web/                      # Frontend React
│       └── src/
│           ├── app/              # Router, provider
│           ├── features/         # Chia theo module nghiệp vụ
│           ├── layouts/          # Khung giao diện
│           ├── pages/            # Trang
│           ├── shared/           # API client, component dùng chung, hook
│           └── styles/           # Design token
│
├── packages/
│   └── shared/                   # Kiểu dữ liệu & hằng số dùng chung FE + BE
│
├── docs/                         # Tài liệu đồ án
├── docker-compose.yml            # MySQL + Redis + MinIO
└── .env.example
```

**Vì sao tách `apps/` và `packages/`:** enum như `SignalType`, `ProctoringMode`
phải giống hệt nhau ở frontend và backend. Đặt trong `packages/shared` thì
TypeScript báo lỗi ngay khi hai bên lệch nhau, thay vì để lỗi lọt tới lúc chạy.

---

## 3. Cài đặt và chạy

**Yêu cầu:** Node.js >= 22, Pandoc (chỉ cần cho chức năng import Word), và MySQL 8
+ Redis 7 — chạy bằng Docker hoặc cài trực tiếp.

```bash
# 1. Cài thư viện cho toàn bộ workspace
npm install

# 2. Tạo file .env từ mẫu rồi sửa mật khẩu và khoá JWT
cp .env.example .env

# 3. Bật MySQL + Redis + MinIO
npm run infra:up          # dung Docker
# hoac, neu khong dung Docker:
npm run mysql:start       # xem docs/CHAY-KHONG-CAN-DOCKER.md

# 4. Tạo bảng và nạp dữ liệu mẫu
npm run db:migrate
npm run db:seed

# 5. Tai bo nhan dien khuon mat (chi can cho che do thi tu xa)
npm run setup:proctoring

# 6. Chạy song song backend và frontend
npm run dev:api     # http://localhost:3000/api/v1  — Swagger tại /docs
npm run dev:web     # http://localhost:5173
```

> **Máy phát triển hiện tại chưa chạy được Docker** (lỗi WSL2 ở mức hệ điều hành).
> Dự án đang chạy bằng MySQL 8.0.43 bản portable và Redis cài sẵn trên Windows —
> xem [docs/CHAY-KHONG-CAN-DOCKER.md](docs/CHAY-KHONG-CAN-DOCKER.md).
> Cấu hình Docker vẫn giữ nguyên, sửa xong WSL là quay lại dùng được ngay.

**Tài khoản mẫu** (mật khẩu đều là `EduExam@123`):

| Mã đăng nhập | Vai trò |
|---|---|
| `admin` | Quản trị viên |
| `GV001` | Giảng viên |
| `3122410127` | Sinh viên |

---

## 4. Hai hình thức thi

Hình thức thi là thuộc tính của **từng đề thi** (`Exam.proctoringMode`), và có thể
ghi đè cho **từng sinh viên** (`Attempt.proctoringMode`) khi có trường hợp đặc biệt.

| Tín hiệu giám sát | Tại phòng máy | Từ xa |
|---|:--:|:--:|
| Rời tab / chuyển ứng dụng | ✅ | ✅ |
| Mất focus cửa sổ | ✅ | ✅ |
| Dán nội dung | ✅ | ✅ |
| Mất heartbeat | ✅ (30s) | ✅ (90s) |
| Ràng buộc dải IP phòng máy | ✅ | — |
| Camera: vắng mặt / nhiều mặt / quay đầu | — | ✅ |
| Ngưỡng hủy bài | 3 lần | 5 lần |

Ngưỡng nằm trong bảng `proctoring_policies`, **không hard-code**. Mạng tại nhà
chập chờn là bình thường; dùng ngưỡng phòng lab cho thi từ xa sẽ sinh hàng loạt
báo động giả và giảng viên sẽ tắt luôn tính năng.

### Giám sát bằng camera (chế độ thi từ xa)

Nhận diện khuôn mặt chạy **bằng WebAssembly ngay trên máy sinh viên**
(MediaPipe BlazeFace, 2 lần mỗi giây). Luồng video **không bao giờ rời khỏi
máy**; thứ đi qua mạng chỉ là kết luận dạng *"thấy 0 khuôn mặt trong 12 giây"*,
vài chục byte mỗi lần.

Nhờ vậy không cần máy chủ media, không tốn băng thông, và nghĩa vụ theo
**Nghị định 13/2023/NĐ-CP** nhẹ hơn hẳn so với quay và lưu video cả ca thi.

Chỉ khi phát hiện bất thường hệ thống mới chụp **một khung hình** làm bằng
chứng, nén còn 640px rồi lưu. Ảnh chỉ giảng viên phụ trách xem được (qua
endpoint có kiểm quyền, không phải đường dẫn tĩnh), và tự động xoá cả bản ghi
lẫn tệp trên đĩa sau `PROCTOR_EVIDENCE_RETENTION_DAYS` ngày.

**Khử nhiễu bắt buộc:** mọi bộ nhận diện đều rớt khung khi chớp mắt, nhoè
chuyển động hay ngược sáng. Phải xác nhận **3 khung liên tiếp** mới đổi kết
luận — tin ngay từng khung một thì bộ đếm bị reset liên tục và không bao giờ
đủ ngưỡng, tức là cả cơ chế giám sát trở nên vô dụng.

WASM và model (23 MB) **không commit vào git**, tải bằng `npm run setup:proctoring`.
Chúng được phục vụ từ chính máy chủ của hệ thống chứ không qua CDN — phòng thi
mất mạng ra Internet vẫn phải thi được.

---

## 5. Phân công module

| Module | Tên | Thư mục backend | Phụ trách |
|:--:|---|---|---|
| 1 | Quản trị & Danh mục | `modules/auth`, `users`, `catalog` | Trương Gia Huy |
| 2 | Ngân hàng câu hỏi | `modules/question-bank` | Hứa Thế Dân |
| 3 | Đề thi & Ma trận đề | `modules/exam` | Nguyễn Huy Hoàng |
| 4 | Làm bài thi | `modules/attempt` | La Vĩ Cường |
| 5 | Giám sát hành vi thi | `modules/proctoring` | Ma Lý Hoàng Ân |
| 6 | Kết quả & Báo cáo | `modules/result` | Trương Gia Huy |

**Toàn bộ 6 module đã hiện thực xong cả backend lẫn giao diện.**
67 endpoint, 13 trang, đã kiểm thử end-to-end bằng API và bằng trình duyệt thật.

Backend theo đúng phân lớp `*.module.ts` → `*.controller.ts` → `*.service.ts` →
`dto/`, controller không gọi thẳng `PrismaService`. Frontend chia theo
`features/<module>/`, dùng chung bộ component trong `shared/components/ui/`.

Các trang nặng (báo cáo kéo theo Recharts, giám sát kéo theo Socket.IO) được
**nạp muộn**, nên màn làm bài không phải tải chúng — sinh viên mạng yếu vào thi
nhanh hơn.

---

## 6. Sáu quy tắc bảo mật bắt buộc

Đây là những điều khiến một hệ thống thi trở nên đáng tin. Vi phạm bất kỳ điều
nào thì toàn bộ phần giám sát trở nên vô nghĩa.

1. **Không bao giờ trả `isCorrect` trong API lấy đề.** Sinh viên mở DevTools là
   thấy toàn bộ đáp án. Mọi việc chấm điểm thực hiện ở server.
2. **Lưu ảnh chụp đề đã trộn** vào `attempt_questions.optionOrder`. Nếu sinh đề
   lại mỗi lần tải trang thì sinh viên refresh là đổi đề.
3. **Đồng hồ do server quyết định.** Lưu `startedAt` + `deadlineAt`, client chỉ
   hiển thị. Chống sinh viên chỉnh giờ máy.
4. **Một lượt thi chỉ một thiết bị hoạt động tại một thời điểm**, nhưng phiên
   mới LUÔN được chiếm quyền. Không bao giờ chặn sinh viên quay lại: `sessionId`
   sinh mới mỗi lần đăng nhập, nên chặn đồng nghĩa với việc ai đăng xuất rồi vào
   lại sẽ mất quyền vào bài của chính mình cho tới hết ca thi. Thiết bị cũ mất
   quyền lưu đáp án ngay, và `Attempt.sessionTakeoverCount` đếm số lần chuyển —
   con số tăng liên tục mới là dấu hiệu hai máy đang giành nhau.
5. **Idempotency key khi nộp bài**, tránh nộp đôi khi mạng chập chờn.
6. **Sanitize mọi HTML** sinh ra từ LaTeX và từ import Word. KaTeX phải đặt
   `throwOnError: false`, `trust: false`, `maxExpand: 1000` — xem
   `shared/components/ui/MathContent.tsx`.

---

## 7. Kiểm thử

```bash
npm run test:e2e     # 89 phep thu qua API
npm run test:ui      # 50 phep thu tren trinh duyet
npm run test:camera  # 21 phep thu giam sat bang camera
```

Cả ba cần API chạy ở cổng 3000; hai bộ sau cần thêm web ở cổng 5173.

**Kiểm thử API** — [e2e-full-flow.mjs](apps/api/test/e2e-full-flow.mjs), **89 phép thử**
chạy trọn vòng đời một kỳ thi: admin dựng danh mục → giảng viên soạn 36 câu hỏi,
dựng ma trận, phát hành → 3 sinh viên làm bài với 3 mức độ đúng khác nhau →
giám sát hành vi → chấm điểm, bảng điểm, phổ điểm, phân tích câu hỏi, xuất Excel.

**Kiểm thử giao diện** — [ui-flow.mjs](apps/web/test/ui-flow.mjs), **50 phép thử**
điều khiển Chromium thật: đăng nhập, vào phòng thi, kiểm tra đồng hồ có thực sự
đếm lùi, KaTeX có dựng được công thức, chọn đáp án có tự lưu, tải lại trang có
giữ nguyên bài làm, biểu đồ phổ điểm có vẽ ra cột, và màn hình 390px có bị tràn
ngang không. Ảnh chụp lưu trong `apps/web/test/screenshots/`.

**Kiểm thử camera** — [ui-camera.mjs](apps/web/test/ui-camera.mjs), **21 phép thử**.
Chromium chạy với camera giả lập; luồng giả không có khuôn mặt nào nên đây đúng
là kịch bản cần kiểm. Xác nhận: MediaPipe nạp được, nhận đúng "không thấy mặt",
máy chủ ghi nhận `FACE_ABSENT`, ảnh bằng chứng được nén và lưu, giảng viên tải
được ảnh còn **sinh viên thì không** (403) và người chưa đăng nhập cũng không (401).

Trong đó có các phép thử bảo mật bắt buộc phải đạt:

| Phép thử | Ý nghĩa |
|---|---|
| Không rò rỉ `isCorrect` trong đề của sinh viên | Quét đệ quy toàn bộ JSON trả về |
| Không rò rỉ lời giải trong đề | Như trên |
| Vào lại trả đúng đề cũ, giữ nguyên thứ tự trộn | Refresh không đổi được đề |
| Sinh viên khác không xem được bài này | Kiểm soát quyền theo chủ sở hữu |
| Chọn phương án không thuộc câu hỏi bị chặn | Không tin dữ liệu từ client |
| Thẻ `script` trong câu hỏi bị vô hiệu hóa | Chống XSS lan sang cả phòng thi |
| Thi từ ngoài dải mạng phòng máy bị chặn | Chống thi hộ ở chế độ LAB |
| Tín hiệu không thuộc chế độ thi bị loại bỏ | Chống giả mạo dữ liệu giám sát |
| Sinh viên không mở được màn giám sát / bảng điểm lớp | Phân quyền theo vai trò |

## 8. Lệnh thường dùng

| Lệnh | Tác dụng |
|---|---|
| `npm run dev:api` / `dev:web` | Chạy backend / frontend |
| `npm run db:migrate` | Tạo và áp dụng migration |
| `npm run db:studio` | Mở Prisma Studio xem dữ liệu |
| `npm run db:seed` | Nạp lại dữ liệu mẫu |
| `npm run infra:up` / `infra:down` | Bật / tắt Docker |
| `npm run infra:reset` | Xoá sạch dữ liệu Docker |
| `npm run lint` | Kiểm tra và sửa code style |
| `npm run test:e2e` | Chạy 89 phép thử end-to-end |
| `npm run mysql:start` / `mysql:status` | Bật / kiểm tra MySQL khi không dùng Docker |
