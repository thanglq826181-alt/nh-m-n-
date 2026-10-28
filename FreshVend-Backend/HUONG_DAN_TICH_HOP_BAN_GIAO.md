# FreshVend Backend — hướng dẫn tích hợp và bàn giao

## Trạng thái

- Backend: Node.js, Express, TypeScript, Prisma và PostgreSQL.
- Tài liệu API: `http://localhost:5000/api-docs`; OpenAPI JSON: `/api-docs.json`.
- Health check: `GET /health`.
- Quy tắc kho: 0 hộp là hết hàng; 1–5 hộp là tồn kho thấp; cảnh báo lô còn hạn trong 3 ngày; restock cộng số lượng; bán hàng dùng FIFO trên các lô còn hạn.
- IoT dùng HTTP REST và khóa riêng từng máy qua header `X-Device-Key`.
- Giao dịch thanh toán và nhả hàng hiện có endpoint mô phỏng cho development; chưa kết nối cổng thanh toán hoặc cơ cấu nhả hàng thật.

## Chạy cục bộ

1. Cài Node.js 22+ và PostgreSQL, sau đó chạy `npm ci`.
2. Sao chép `.env.example` thành `.env`; thay mật khẩu PostgreSQL, JWT secret và mật khẩu Admin bằng giá trị riêng.
3. Tạo database khớp `DATABASE_URL`, sau đó chạy:

   ```powershell
   npm run db:generate
   npm run db:deploy
   npm run db:seed
   npm run dev
   ```

4. Mở `http://localhost:5000/health` và `http://localhost:5000/api-docs`.

## Chạy bằng Docker Compose

1. Cài Docker Desktop.
2. Sao chép `.env.example` thành `.env` và đặt các giá trị bí mật mạnh. Không commit `.env`.
3. Từ thư mục dự án chạy `docker compose up --build -d`.
4. Xem trạng thái/log: `docker compose ps` và `docker compose logs -f api`.
5. Dừng stack: `docker compose down`. Dữ liệu PostgreSQL nằm trong volume `freshvend-postgres`; chỉ dùng `docker compose down -v` khi chủ động xóa database.

Compose tự chờ PostgreSQL khỏe, áp dụng Prisma migrations rồi khởi chạy API. Trên VPS, đặt reverse proxy HTTPS (ví dụ Nginx/Caddy), chỉ công khai cổng HTTPS và giới hạn `CORS_ORIGINS` theo domain Frontend. Không mở PostgreSQL ra Internet.

## Hợp đồng tích hợp Frontend

- Base URL local: `http://localhost:5000/api/v1`; trên môi trường triển khai dùng domain HTTPS của API.
- Frontend React đã được đưa vào thư mục `frontend/`. Cấu hình `VITE_API_BASE_URL` trong `frontend/.env`; xem thêm `frontend/README.md`.
- Đăng ký: `POST /auth/register` nhận `username`, `password`, `fullName` (role khách hàng do server gán).
- Đăng nhập: `POST /auth/login`; lưu `token` an toàn, gửi `Authorization: Bearer <token>` cho các endpoint cần đăng nhập.
- Sản phẩm: `GET /products`.
- Máy/cột/tồn kho: `GET /machines`, `GET /machines/:machineId`, `GET /machines/:machineId/columns`.
- Tạo giao dịch: `POST /transactions` với `{ "machineId": "...", "columnId": "..." }`. Response có `id` giao dịch và `amount` cần thanh toán.
- Danh mục vị trí có thể bán: `GET /products/catalog` trả sản phẩm kèm `machineId`, `columnId`, `availableStock`, chỉ gồm máy ONLINE và lô còn hạn.
- Các endpoint `/transactions/:id/simulate-payment` và `/simulate-dispense` chỉ để demo development, không dùng làm xác nhận tiền thật trên production.
- Lỗi nghiệp vụ trả JSON dạng `{ "success": false, "message": "..." }`; cần xử lý 401 (đăng nhập), 403 (quyền), 404 (không tồn tại), 409 (xung đột/trạng thái kho), 5xx (server/database).
- CORS nhận danh sách domain phân tách bằng dấu phẩy trong `CORS_ORIGINS`.

## Hợp đồng tích hợp IoT qua HTTP

1. Admin tạo máy bằng `POST /api/v1/machines`; khóa thiết bị chỉ trả một lần. Với máy đã tồn tại, Admin xoay khóa bằng `POST /api/v1/machines/:machineId/device-key/rotate`.
2. Lưu khóa trong cấu hình bí mật của thiết bị, không ghi vào mã nguồn hoặc log.
3. Thiết bị gửi `POST /api/v1/telemetry/temperature`, header `X-Device-Key: <device key>`, JSON ví dụ:

   ```json
   {
     "machineId": "UUID-cua-may",
     "temperature": 5.2,
     "humidity": 70,
     "doorOpen": false
   }
   ```

4. HTTP 201 là đã ghi log và cập nhật `lastPing`. API hiện không có MQTT, không điều khiển động cơ và không nhận callback trạng thái nhả hàng thật; cần thống nhất payload/command với thành viên IoT trước khi bổ sung.

## Thanh toán QR thật — phần cần nhà cung cấp

Frontend hiện chỉ có QR demo; backend hiện không nhận webhook xác thực thanh toán. Để triển khai tiền thật, nhóm cần chọn nhà cung cấp (ví dụ VNPay/MoMo hoặc dịch vụ VietQR phù hợp), tạo tài khoản merchant/sandbox và cung cấp tài liệu tích hợp, credentials sandbox, quy tắc chữ ký và URL callback. Sau đó mới có thể triển khai server-side tạo payment, xác minh webhook/idempotency, cập nhật trạng thái giao dịch và xử lý hoàn tiền. Không tin nút bấm “đã thanh toán” từ trình duyệt làm bằng chứng thanh toán.

## Kiểm thử tích hợp cần phối hợp

- Frontend: đăng nhập → tải sản phẩm/máy → tạo giao dịch → (sandbox webhook sau khi chọn cổng) → hiển thị kết quả; thử token sai, máy offline và hết hàng.
- IoT thật: gửi telemetry đúng/sai khóa, mất mạng/gửi lại, ngưỡng nhiệt độ, cửa mở; xác nhận log hiển thị trong dashboard.
- Phần nhả hàng: chỉ kết luận hoàn tất sau khi nhóm chốt HTTP command/response với firmware và có thiết bị để thử.
- Trước triển khai: đổi toàn bộ secret demo, bật HTTPS, giới hạn CORS, sao lưu PostgreSQL và kiểm tra migration trên môi trường staging.

## Hạng mục bàn giao

- Prisma schema/migrations: `prisma/schema.prisma`, `prisma/migrations/`.
- API docs: `/api-docs`.
- Cấu hình triển khai: `Dockerfile`, `docker-compose.yml`, `.env.example`.
- Tài khoản Admin được tạo bằng seed từ biến `ADMIN_USERNAME` và `ADMIN_PASSWORD`; không ghi thông tin đăng nhập hoặc device key vào báo cáo công khai.
- Tích hợp thanh toán thật, frontend/firmware thật và triển khai VPS vẫn cần tài khoản, mã nguồn hoặc phần cứng do các thành viên liên quan cung cấp.
