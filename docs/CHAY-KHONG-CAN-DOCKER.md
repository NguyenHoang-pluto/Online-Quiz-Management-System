# Chạy dự án không cần Docker

Docker Desktop trên máy phát triển hiện không khởi động được (lỗi WSL2, xem mục
cuối). Tài liệu này mô tả cách chạy dự án bằng MySQL và Redis cài trực tiếp trên
Windows — **không cần quyền Administrator, không cần khởi động lại máy**.

File `docker-compose.yml` vẫn giữ nguyên. Khi nào WSL được sửa, chỉ cần
`npm run infra:up` là quay lại dùng Docker bình thường.

---

## 1. Thành phần đang dùng

| Dịch vụ | Cách chạy hiện tại | Phiên bản |
|---|---|---|
| MySQL | Bản ZIP portable tại `E:\mysql8` | **8.0.43** |
| Redis | Dịch vụ Windows có sẵn, tự khởi động | **5.0.14** |
| MinIO | **Chưa cài** — hoãn tới khi làm chức năng 2.5 (ảnh câu hỏi) | — |

### Hai điểm khác so với môi trường triển khai

1. **Redis 5 thay vì Redis 7.** Phần mã hiện tại chỉ dùng `SET`, `GET`,
   `EXISTS`, `TTL` nên chạy tốt. Nhưng **BullMQ khuyến nghị Redis >= 6.2**, nên
   khi làm hàng đợi ở Module 2 (import Word/Excel) và Module 6 (chấm hàng loạt),
   cần kiểm tra lại. VPS triển khai phải cài Redis 7.
2. **Chưa có MinIO.** Chức năng 2.5 (chèn ảnh câu hỏi) và ảnh bằng chứng của
   Module 5 sẽ cần. Khi đó tải `minio.exe` cho Windows, hoặc tạm lưu ra thư mục
   cục bộ trong lúc phát triển.

---

## 2. Lệnh hằng ngày

```bash
npm run mysql:status     # Xem MySQL va Redis con chay khong
npm run mysql:start      # Bat MySQL
npm run mysql:stop       # Tat MySQL

npm run dev:api          # http://localhost:3000/api/v1  (Swagger tai /docs)
npm run dev:web          # http://localhost:5173
```

Redis chạy dưới dạng dịch vụ Windows tự khởi động nên không cần bật thủ công.

Đường dẫn MySQL lấy từ `MYSQL_HOME` và `MYSQL_INI` trong file `.env`. **Máy mỗi
người mỗi khác**, nên mỗi thành viên tự sửa hai biến này trong `.env` của mình.
File `.env` không được commit.

---

## 3. Cài MySQL trên máy mới

Dành cho thành viên khác trong nhóm muốn dựng lại từ đầu.

```powershell
# 1. Tai ban ZIP (khong can trinh cai dat, khong can Admin)
curl -L -o mysql8.zip https://cdn.mysql.com//archives/mysql-8.0/mysql-8.0.43-winx64.zip

# 2. Giai nen
tar -xf mysql8.zip -C E:\mysql8
```

**3. Tạo `E:\mysql8\my.ini`:**

```ini
[mysqld]
basedir=E:/mysql8/mysql-8.0.43-winx64
datadir=E:/mysql8/data
port=3306
character-set-server=utf8mb4
collation-server=utf8mb4_0900_ai_ci
default-time-zone='+07:00'
innodb_buffer_pool_size=256M
max_connections=200
log-error=E:/mysql8/mysql-error.log

[client]
port=3306
default-character-set=utf8mb4
```

**4. Khởi tạo và chạy:**

```powershell
E:\mysql8\mysql-8.0.43-winx64\bin\mysqld.exe --defaults-file=E:\mysql8\my.ini --initialize-insecure --console
npm run mysql:start
```

**5. Tạo database và tài khoản** (thay `<mat_khau>` bằng `MYSQL_PASSWORD` trong `.env`):

```sql
CREATE DATABASE eduexam CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'eduexam'@'localhost' IDENTIFIED BY '<mat_khau>';
CREATE USER 'eduexam'@'127.0.0.1' IDENTIFIED BY '<mat_khau>';
GRANT ALL PRIVILEGES ON eduexam.* TO 'eduexam'@'localhost';
GRANT ALL PRIVILEGES ON eduexam.* TO 'eduexam'@'127.0.0.1';

-- Prisma can quyen tao "shadow database" de so sanh migration.
-- Chi cap dung pham vi nay, khong cap ALL tren *.*
GRANT ALL PRIVILEGES ON `prisma_migrate_shadow_db%`.* TO 'eduexam'@'localhost';
GRANT ALL PRIVILEGES ON `prisma_migrate_shadow_db%`.* TO 'eduexam'@'127.0.0.1';
FLUSH PRIVILEGES;
```

**6. Tạo bảng và nạp dữ liệu:**

```bash
npm run db:migrate
npm run db:seed
```

---

## 4. Vì sao không dùng MariaDB của XAMPP

Máy đã có sẵn XAMPP với **MariaDB 10.4**, nhưng không dùng được vì:

- MariaDB **không có collation `utf8mb4_0900_ai_ci`** mà schema đang khai báo
- Kiểu `JSON` trong MariaDB 10.4 thực chất là `LONGTEXT` kèm ràng buộc CHECK,
  khác MySQL 8
- VPS triển khai sẽ chạy MySQL 8 — để môi trường phát triển lệch môi trường thật
  sẽ sinh ra lỗi chỉ xuất hiện lúc bàn giao, rất khó tìm

---

## 5. Về lỗi Docker / WSL

Docker Desktop báo:

```
Wsl/Service/RegisterDistro/CreateVm/HCS/ERROR_FILE_NOT_FOUND
```

Đã kiểm tra và **loại trừ**: file `ext4.vhdx` của Docker (còn nguyên), kernel WSL
(`tools/kernel`, 17 MB, còn), ổ đĩa ảo của Ubuntu (5.6 GB, còn), file
`.wslconfig` (không có), WSLg, ảo hoá trong BIOS (đã bật), hypervisor (đang
chạy), dịch vụ HCS (khởi động bình thường), `wsl --update` (đã mới nhất).

**Distro Ubuntu cũng lỗi y hệt**, nên đây không phải lỗi của Docker mà là tầng
máy ảo WSL2 nói chung.

Nghi phạm còn lại: tính năng Windows `VirtualMachinePlatform` hỏng sau một bản
cập nhật. Cần PowerShell **quyền Administrator**:

```powershell
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
bcdedit /set hypervisorlaunchtype auto
```

Rồi **khởi động lại máy**. Kiểm tra bằng `wsl -d Ubuntu -- echo ok`.

Sửa xong thì quay lại dùng Docker được ngay, không phải đổi gì trong mã nguồn.
