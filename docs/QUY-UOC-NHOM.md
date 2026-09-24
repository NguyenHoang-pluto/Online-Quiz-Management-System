# Quy ước làm việc — Nhóm 08

Tài liệu này chốt cách 5 thành viên làm việc song song trên cùng một repo mà
không giẫm chân nhau. Đọc một lần trước khi commit dòng code đầu tiên.

---

## 1. Quy ước Git

### Nhánh

```
main                        # Luôn chạy được. Không ai push thẳng.
└── develop                 # Nhánh tích hợp
    ├── feat/m1-quan-tri
    ├── feat/m2-ngan-hang-cau-hoi
    ├── feat/m3-de-thi
    ├── feat/m4-lam-bai
    ├── feat/m5-giam-sat
    └── feat/m6-ket-qua
```

Mỗi người làm trên nhánh module của mình, xong thì mở Pull Request vào `develop`.
**Bắt buộc có ít nhất 1 người review** trước khi merge.

### Thông điệp commit

Theo chuẩn Conventional Commits:

```
feat(m3): them man hinh khai bao ma tran de
fix(m4): sua loi mat dap an khi tai lai trang
docs(readme): bo sung huong dan cai dat
refactor(m2): tach logic render KaTeX ra component rieng
test(m5): them test cho nguong vi pham
chore(deps): nang cap prisma len 6.4
```

Tiền tố module (`m1`–`m6`) giúp lọc lịch sử theo module khi viết báo cáo.

### Không bao giờ commit

- File `.env` (đã có trong `.gitignore`)
- Thư mục `node_modules/`, `dist/`
- File `.sql` dump chứa dữ liệu thật của sinh viên

---

## 2. Quy ước đặt tên

| Loại | Quy tắc | Ví dụ |
|---|---|---|
| Thư mục, file | kebab-case | `question-bank.service.ts` |
| Class, Component | PascalCase | `ProctoringService`, `MathContent` |
| Biến, hàm | camelCase | `calculateScore`, `attemptId` |
| Hằng số | UPPER_SNAKE_CASE | `DEFAULT_LAB_POLICY` |
| Model Prisma | PascalCase số ít | `Question`, `Attempt` |
| Bảng CSDL | snake_case số nhiều | `questions`, `attempt_answers` |
| Route API | kebab-case, danh từ số nhiều | `/api/v1/exams/:id/matrix` |
| Đường dẫn web | tiếng Việt không dấu | `/de-thi`, `/ngan-hang-cau-hoi` |

---

## 3. Phân lớp bắt buộc ở backend

```
Controller  →  nhận request, kiểm tra quyền, trả response. KHÔNG có logic nghiệp vụ.
Service     →  toàn bộ logic nghiệp vụ và truy vấn CSDL.
DTO         →  định nghĩa và kiểm tra dữ liệu vào, dùng class-validator.
```

Controller không được gọi thẳng `PrismaService`. Sai lớp thì reviewer trả lại PR.

---

## 4. Thứ tự làm việc

Module có phụ thuộc lẫn nhau, không làm song song tuỳ tiện được:

```
M1 (danh mục, tài khoản)
 └─> M2 (ngân hàng câu hỏi)   cần Subject, Chapter từ M1
      └─> M3 (đề thi, ma trận) cần Question từ M2
           └─> M4 (làm bài)     cần Exam từ M3
                ├─> M5 (giám sát) cần Attempt từ M4
                └─> M6 (kết quả)  cần AttemptAnswer từ M4
```

Trong lúc chờ module trước, người phụ trách module sau làm giao diện với dữ liệu
giả, và viết sẵn DTO + service ký hiệu hàm.

---

## 5. Lộ trình Module 5 — chia 3 lát cắt

Module 5 là module nặng nhất. Chia thành 3 lát để nếu trễ vẫn có sản phẩm bàn giao:

| Lát | Nội dung | Tuần | Ưu tiên |
|:--:|---|:--:|---|
| 1 | Tầng hồ sơ chính sách + 4 tín hiệu nền + khoá dải IP → **chế độ phòng máy hoàn chỉnh** | 7–8 | Bắt buộc |
| 2 | Kiểm tra thiết bị, màn đồng ý, nhận diện khuôn mặt tại client → **chế độ từ xa cơ bản** | 9 | Bắt buộc |
| 3 | Ảnh bằng chứng + màn xem dòng thời gian + tự động xoá | 10 | **Nên có** |

Nếu hết thời gian, bỏ lát 3 vẫn còn một hệ thống chạy đủ hai chế độ.

---

## 6. Định nghĩa "Xong" (Definition of Done)

Một chức năng chỉ được tính là xong khi đủ cả 5 điều:

1. Chạy được đúng mô tả trong file đặc tả
2. Có DTO kiểm tra dữ liệu đầu vào
3. Có kiểm tra quyền (`@Roles`) đúng vai trò
4. Có ít nhất 1 unit test cho luồng chính
5. Đã được 1 thành viên khác review và merge vào `develop`

---

## 7. Việc còn thiếu trong tài liệu, cần bổ sung

Những mục này chưa có trong file `Nhom_08_Quanlythitracnghiemtructuyen.xlsx`:

- [ ] Yêu cầu phi chức năng: số người dùng đồng thời, thời gian phản hồi, RPO/RTO
- [ ] Sổ rủi ro (hiện chỉ có khoản dự phòng 10%)
- [ ] Kế hoạch kiểm thử và danh sách test case
- [ ] Tiêu chí nghiệm thu cho từng chức năng
- [ ] Lịch Gantt theo ngày (hiện chỉ ghi "Tuần 3-10" cho cả module)
- [ ] Quy tắc chấm câu nhiều đáp án: đúng hết mới tính điểm hay tính điểm từng phần
- [ ] Sửa cột **Mã Chức năng** đang bị Excel tự chuyển thành ngày tháng
