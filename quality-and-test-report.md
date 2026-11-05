# Kế hoạch kiểm thử và báo cáo hiện trạng

## Kiểm tra đã chạy

- `npm run release:check`: 5 unit test passed; backend build thành công. Ngoài ra, API integration test chạy với PostgreSQL local: **6 passed, 0 failed** tổng cộng, bao gồm health, register/login, JWT identity và Customer bị chặn khỏi Admin API. CI chạy integration test sau khi migrate DB riêng.
- Backend `npm run build`: thành công.
- Frontend `npm run lint` và `npm run build`: thành công.
- Prisma validate/generate/deploy: thành công; database local đang ở trạng thái up to date với 9 migrations.
- Smoke test local: `/health`, Swagger JSON và frontend đều trả HTTP 200. CORS preflight cho `127.0.0.1:5173` được phép; origin không nằm trong allowlist không nhận `Access-Control-Allow-Origin`.
- Kiểm thử tích hợp thủ công đã xác nhận Admin login, summary/alerts/CSV/SSE, telemetry và clear-fault; clear-fault chỉ thành công sau telemetry an toàn. Checkout JAMMED ghi nhận hai lần retry; Customer bị từ chối API analytics. Dữ liệu tạo riêng trong smoke test đã được dọn.
- Luồng thanh toán demo chỉ đổi trạng thái khi giao dịch còn PENDING. Nhả hàng dùng transaction Serializable, cập nhật lô có điều kiện và trả xung đột tồn kho để client tải lại. Biên nhận tính tổng theo giá backend trả về.
- Backend Docker chạy bằng user `node`; cấu hình phát hành Compose riêng đặt `NODE_ENV=production` và chỉ mở mô phỏng khi `SIMULATION_MODE=true`.
- PWA production build phục vụ manifest, service worker và icon 192/512. Service worker cache app shell/static assets, loại trừ `/api/`; offline chỉ mở giao diện, không cho giao dịch bằng dữ liệu cache.
- Frontend PWA tests: **2 passed**; kiểm tra manifest, kích thước/chữ ký PNG và quy tắc không cache API.

## Ma trận kiểm thử còn cần mở rộng

| ID | Kịch bản | Trạng thái |
|---|---|---|
| T-01 | Browse/cart, hết hàng, lô hết hạn | Unit test kho có; cần browser integration |
| T-02 | Sai/hết hạn token, customer gọi API staff | Customer analytics đã kiểm tra; cần security suite rộng hơn |
| T-03 | Telemetry sensor/cửa/nhiệt bất thường | Đã kiểm tra luồng telemetry và clear-fault cơ bản; cần kiểm tra từng điều kiện |
| T-04 | Restock capacity, batch hết hạn, FIFO | Cần integration test |
| T-05 | Mô phỏng JAMMED và hướng dẫn xử lý | API đã kiểm tra; cần browser end-to-end |
| T-06 | CSV formula injection và quyền Operator | Cần kiểm tra bảo mật đầy đủ |
| T-07 | 1.000 máy, telemetry mỗi 2 giây, API p95 500ms | Chưa chạy benchmark; không tuyên bố đạt |
| T-08 | API/DB mất kết nối | Cần browser test và kiểm tra phục hồi |
| T-09 | Hai request nhả cùng một đơn hoặc tồn kho đồng thời | Có bảo vệ trạng thái/Serializable; cần kiểm thử concurrency trên staging |

## Giới hạn bằng chứng

Năm unit test và một API integration test chưa thay thế bộ browser E2E/security/load đầy đủ. Docker CLI không có trong môi trường làm việc này nên image/Compose chưa được dựng local; CI có bước build image. PWA manifest/service worker đã trả HTTP 200 qua production preview, nhưng chưa được kiểm thử cài đặt trên iOS/Android thật. SSE là event stream một chiều, không phải WebSocket. Hiệu năng p95, uptime 99.9%, 1.000 máy và tích hợp phần cứng thật cần môi trường kiểm thử riêng. Thanh toán, nhả hàng và biên nhận hiện là mô phỏng; không dùng để thu tiền hoặc xác nhận giao hàng thật.
