# Cài đặt & chuẩn bị môi trường

Hướng dẫn dựng EduExam Pro từ mã nguồn: cái gì phải cài, biến môi trường nào
phải sửa, và cách kiểm tra sau khi cài. Xem [README.md](../README.md) để biết
kiến trúc và danh mục module.

---

## 1. Cần cài những gì

| Thành phần | Bắt buộc | Phiên bản | Việc dùng | Ghi chú |
|---|:--:|---|---|---|
| Git | ✅ | bất kỳ | lấy mã nguồn | — |
| Node.js + npm | ✅ | Node **>= 22**, npm **>= 10** | build, chạy API/web, test | khai báo trong `engines` của `package.json`; kiểm tra `node -v && npm -v` |
| Docker Engine + Compose plugin | ✅ nếu dùng Docker | Compose **v2** | chạy MySQL, Redis, MinIO; deploy | kiểm tra `docker compose version`. Không dùng Docker được thì xem [mục 6](#6-chạy-không-dùng-docker) |
| MySQL | ✅ | **8.0** | cơ sở dữ liệu | `docker compose` tự kéo `mysql:8.0`; cài riêng thì bắt buộc collation `utf8mb4_0900_ai_ci`. **Không dùng MariaDB** — thiếu collation này |
| Redis | ✅ | >= 6.2, khuyến nghị **7** | cache, hàng đợi BullMQ, realtime | compose tự kéo `redis:7-alpine` |
| MinIO | ✅ khi dùng ảnh | bản tương thích S3 | ảnh câu hỏi, ảnh bằng chứng giám sát | compose tự kéo `cgr.dev/chainguard/minio:latest` |
| OpenSSL | ✅ khi tạo khoá JWT | bất kỳ | `openssl rand -base64 48` | có sẵn trên Linux/macOS; Windows dùng Git Bash hoặc WSL |
| Pandoc | ⚠️ tuỳ chọn | bất kỳ | import câu hỏi từ Word (`.docx`) | `apt install pandoc` / `brew install pandoc` / `choco install pandoc`. Không import Word thì bỏ qua |
| Playwright Chromium | ⚠️ tuỳ chọn | theo `package.json` | `test:ui`, `test:camera` | cài riêng bằng lệnh ở [mục 7](#7-kiểm-thử-tuỳ-chọn) |
| curl | ⚠️ tuỳ chọn | bất kỳ | smoke check các cổng | có sẵn trên hầu hết Linux/macOS |

**Mạng:** cần Internet lúc `npm install` và lúc `npm run setup:proctoring` (tải
model nhận diện khuôn mặt, ~23 MB). Sau khi tải xong, WASM/model được phục vụ từ
chính máy chủ của hệ thống — ca thi từ xa vẫn chạy khi phòng thi mất mạng ra
Internet.

---

## 2. Chạy nhanh bằng Docker

Chạy từ thư mục gốc `Online-Quiz-Management-System/` (nơi có `package.json`).

```bash
# 0. Kiểm tra prerequisite
node -v            # v22.x
npm -v             # 10.x trở lên
docker compose version

# 1. Tạo file cấu hình; TUYỆT ĐỐI không commit .env
cp .env.example .env

# 2. Sinh hai khoá JWT khác nhau rồi thay vào .env
openssl rand -base64 48
openssl rand -base64 48
#   JWT_ACCESS_SECRET  = khoá thứ nhất
#   JWT_REFRESH_SECRET = khoá thứ hai

# 3. Cài dependency cho toàn bộ workspace
npm install                 # hoặc `npm ci` nếu cần đúng lockfile

# 4. Bật MySQL + Redis + MinIO, đợi healthcheck xanh
npm run infra:up
docker compose ps

# 5. Tạo bảng và nạp dữ liệu mẫu
npm run db:migrate
npm run db:seed

# 6. (Tuỳ chọn) Tải WASM + model cho chế độ thi từ xa
npm run setup:proctoring

# 7. Chạy backend và frontend ở hai terminal riêng
npm run dev:api     # http://localhost:3000/api/v1, Swagger http://localhost:3000/docs
npm run dev:web     # http://localhost:5173
```

**Tài khoản mẫu** (mật khẩu chung `EduExam@123`): `admin` (quản trị), `GV001`
(giảng viên), `3122410127` (sinh viên).

`npm run db:seed` nạp lại dữ liệu mẫu, dùng được nhiều lần. `npm run db:studio`
mở Prisma Studio để xem bảng.

---

## 3. Biến `.env` phải sửa

Đầy đủ danh sách nằm trong [`.env.example`](../.env.example). Các biến dễ gây
lỗi nhất:

| Biến | Lúc nào sửa | Ý nghĩa |
|---|---|---|
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | **luôn luôn** | hai chuỗi ngẫu nhiên khác nhau; để giá trị mẫu là lỗi bảo mật |
| `MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`, `MYSQL_USER`, `MYSQL_DATABASE` | nên đổi | phải khớp `DATABASE_URL` |
| `DATABASE_URL` | khi chạy local | trỏ tới `localhost:3306`; khi deploy, compose tự ghi đè thành `mysql:3306` |
| `REDIS_HOST`, `S3_ENDPOINT` | khi chạy local | mặc định `localhost`; compose deploy tự ghi đè thành `redis`, `http://minio:9000` |
| `WEB_ORIGIN` | khi deploy | compose deploy ghi đè thành `http://localhost:8080` |
| `MYSQL_HOME`, `MYSQL_INI` | chỉ khi không dùng Docker | đường dẫn MySQL portable trên Windows, máy mỗi người một khác |
| `PANDOC_BIN` | khi cài Pandoc ở đường dẫn riêng | mặc định `pandoc` |
| `PROCTOR_EVIDENCE_RETENTION_DAYS` | tuỳ chính sách | số ngày giữ ảnh bằng chứng trước khi tự xoá (mặc định 30) |

Sửa `.env` rồi khởi động lại API để áp dụng.

---

## 4. Cổng đang dùng

| Cổng | Dịch vụ | Truy cập |
|---:|---|---|
| 3000 | API NestJS | `http://localhost:3000/api/v1`, Swagger `/docs` |
| 5173 | Web dev (Vite) | `http://localhost:5173` |
| 3306 | MySQL | `DATABASE_URL` |
| 6379 | Redis | `REDIS_PORT` |
| 9000 / 9001 | MinIO API / Console | `S3_ENDPOINT` / `MINIO_CONSOLE_PORT` |
| 8080 | Web deploy (Nginx) | `http://localhost:8080` |

---

## 5. Kiểm tra sau khi cài

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/docs   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:5173/       # 200
npm run build                    # shared + api + web, phải exit 0
npm test                         # unit test, phải xanh
```

Mở `http://localhost:5173`, đăng nhập bằng `admin` / `EduExam@123`. Thấy trang
"Môn học & Chương" là cài đặt thành công.

---

## 6. Chạy không dùng Docker

Máy phát triển Windows có thể dùng MySQL portable + Redis cài sẵn. Quy trình cài
MySQL 8.0.43, tạo user, cấp quyền shadow database cho Prisma và sửa lỗi WSL2 được
viết đầy đủ trong [CHAY-KHONG-CAN-DOCKER.md](CHAY-KHONG-CAN-DOCKER.md). Tóm tắt:

```bash
npm run mysql:start      # bật MySQL portable (đường dẫn lấy từ MYSQL_HOME)
npm run mysql:status     # kiểm tra MySQL + Redis
npm run dev:api
npm run dev:web
```

---

## 7. Kiểm thử (tuỳ chọn)

```bash
npm test                 # unit: 5 file web + 7 suite API
npm run test:e2e         # 110 phép thử API, cần API đang chạy ở :3000
npm run test:ui          # 50 phép thử Chromium, cần API :3000 và web :5173
npm run test:camera      # 21 phép thử camera giả lập, cùng prerequisite ở trên
```

Cài browser cho hai bộ sau một lần:

```bash
cd apps/web && npx playwright install chromium
```

Ảnh chụp của `test:ui` nằm ở `apps/web/test/screenshots/`.

---

## 8. Deploy bằng Docker

Yêu cầu: Docker + Compose v2, file `.env` đã sửa khoá JWT. Không cần cài Node,
MySQL, Redis, Pandoc trên máy chủ — mọi thứ nằm trong image/container.

```bash
npm run deploy:up        # build API + web, bật kèm MySQL/Redis/MinIO
npm run deploy:down      # dừng, giữ dữ liệu
npm run infra:reset      # xoá sạch volume (MẤT TOÀN BỘ DỮ LIỆU)
```

Kết quả: API `http://localhost:3000/api/v1`, giao diện `http://localhost:8080`.
Nginx proxy `/api` và `/socket.io` tới API; `deploy/nginx.conf` có SPA fallback
nên mở trực tiếp `/ket-qua/:id` vẫn ra giao diện. Kiểm tra nhanh:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/             # 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/doi-mat-khau # 200
```

CI (`.github/workflows/ci.yml`) chạy `npm ci`, `npm run build`, `npm test` trên
mỗi push vào `dev`/`main` và mọi PR — dùng Node 22, không cần Pandoc.

---

## 9. Lỗi thường gặp

| Triệu chứng | Nguyên nhân / cách sửa |
|---|---|
| `Wsl/Service/RegisterDistro/CreateVm/HCS/ERROR_FILE_NOT_FOUND` | Docker Desktop lỗi WSL2 trên máy phát triển; xem [mục cuối của CHAY-KHONG-CAN-DOCKER.md](CHAY-KHONG-CAN-DOCKER.md#5-về-lỗi-docker--wsl) hoặc dùng quy trình không Docker |
| `Unknown collation: utf8mb4_0900_ai_ci` | Đang dùng MariaDB/XAMPP thay vì MySQL 8 |
| `Found 110 error(s)` khi build API trong Docker | Prisma client chưa sinh; `deploy/Dockerfile.api` đã chạy `npx prisma generate`, dùng lại Dockerfile mới nhất |
| `host not found in upstream "api"` lúc khởi động Nginx | Config cũ proxy thẳng tới hostname; `deploy/nginx.conf` nay dùng `resolver 127.0.0.11` + biến `$api_upstream`, rebuild web image |
| `npm run lint` → `eslint: command not found` (exit 127) | eslint chưa có trong dependency; **lỗi có sẵn**, CI chỉ chạy build + test |
| `Executable doesn't exist at .../chromium_headless_shell-<version>` | Browser trong cache không khớp phiên bản Playwright của lockfile; chạy lại `cd apps/web && npx playwright install chromium` |
| `Tải model thất bại: HTTP ...` | Cần Internet một lần cho `npm run setup:proctoring`; chạy lại lệnh này |
| Không mở được camera khi chia sẻ qua LAN | `navigator.mediaDevices` chỉ chạy trên origin an toàn; dùng `npm run share` (HTTPS tự ký) — xem ghi chú trong `apps/web/vite.config.ts` |

---

**Chú ý bảo mật:** `.env` chứa mật khẩu database và khoá JWT. Không commit file
này; chỉ commit `.env.example`.
