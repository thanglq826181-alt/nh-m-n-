# Hướng dẫn cài đặt và sử dụng FreshVend

## Chạy local

1. Cài Node.js 22+ và PostgreSQL 16+; tạo database và đặt `DATABASE_URL` trong `.env`.
2. Cài backend: `npm ci`, `npm run db:generate`, `npm run db:deploy`, `npm run db:seed`, `npm run dev`.
3. Trong `frontend/`, chạy `npm ci`, đặt `VITE_API_BASE_URL=http://localhost:5000/api/v1`, rồi `npm run dev -- --host 127.0.0.1`.
4. Mở `http://127.0.0.1:5173/`; Swagger tại `http://localhost:5000/api-docs`.
5. Seed tạo/cập nhật Admin từ `ADMIN_USERNAME` và `ADMIN_PASSWORD`. Tạo Operator qua portal Admin.

## Chạy bằng Docker Compose

1. Sao `.env.example` thành `.env`; thay mật khẩu DB, JWT secret, tên Admin và mật khẩu Admin.
2. Đặt `FRONTEND_API_BASE_URL` là URL API mà trình duyệt truy cập được, ví dụ `http://localhost:5000/api/v1`.
3. Chạy `docker compose up --build -d`; UI mặc định ở `http://localhost:8080`, API ở `http://localhost:5000`.
4. Compose development bật endpoint mô phỏng. Bản demo phát hành dùng `docker-compose.release.yml` với `NODE_ENV=production` và `SIMULATION_MODE=true`; cần HTTPS reverse proxy, hostname/CORS đúng và phải ghi rõ không thu tiền/không điều khiển máy thật. Khi đặt `SIMULATION_MODE=false`, endpoint mô phỏng tắt; để thu tiền hoặc điều khiển máy thật phải tích hợp provider/firmware trước.
5. Không dùng `docker compose down -v` trừ khi chủ động xóa dữ liệu PostgreSQL.

## Khách hàng

1. Mở trang bán hàng, lọc và chọn sản phẩm, tăng/giảm số lượng trong giỏ.
2. Chọn thanh toán demo; tạo tài khoản hoặc đăng nhập.
3. Chọn kết quả nhả hàng mô phỏng. Kết quả kẹt hiển thị hai lần retry và biên nhận chỉ dẫn liên hệ vận hành.
4. In/lưu biên nhận từ trình duyệt. Đây không phải biên nhận ngân hàng.

### Cài FreshVend lên điện thoại/máy tính bảng

Frontend là PWA: mở site qua HTTPS trong trình duyệt, chọn lệnh cài ứng dụng/thêm vào màn hình chính. Khi ngoại tuyến, app shell có thể mở nhưng API không dùng cache để bán hàng; cần kết nối lại mạng trước khi xem catalog hoặc giao dịch. Đây là PWA, không phải app native Flutter/React Native và chưa có push notification.

## Operator

1. Mở nút **Portal vận hành** và đăng nhập role `OPERATOR`.
2. Xem dashboard/cảnh báo, máy/kho, lịch sử nhiệt độ, restock event và giao dịch.
3. Restock lô mới; không bán lô hết hạn. Cảnh báo lỗi chỉ được xóa sau khi gửi telemetry an toàn mới trong 2 phút.
4. Trang **Đo nhiệt độ máy** gửi telemetry mô phỏng bằng JWT nhân viên; thiết bị thật dùng `X-Device-Key`.

## Admin

- Tạo tài khoản/đổi role, thêm sản phẩm, gán sản phẩm cho cột trống, đổi ngưỡng, xoay device key.
- Xem analytics doanh thu, giờ cao điểm, xuất CSV và in báo cáo PDF từ trình duyệt.
- Device key chỉ hiển thị một lần khi tạo/xoay; lưu vào secret store của thiết bị, không ghi vào báo cáo hay source control.

## Sự cố thường gặp

- Danh mục trống: cần máy `ONLINE`, cột gán sản phẩm và lô còn hạn.
- `401/403`: đăng nhập lại và kiểm tra role.
- Không kết nối API: kiểm tra API/DB đang chạy và URL `VITE_API_BASE_URL`.
- Telemetry bị từ chối: kiểm tra machine UUID, device key hoặc JWT Admin/Operator.
- Khi mạng/cooling lỗi, giao diện phải hiển thị không bán được; không dùng cache cũ để xác nhận thanh toán.
