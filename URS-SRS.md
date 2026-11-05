# FreshVend — URS / SRS bản triển khai

## 1. Mục tiêu và phạm vi

FreshVend là nguyên mẫu máy bán trái cây theo cột hàng, có trang khách hàng, API quản lý, tồn kho theo lô và thu thập telemetry. Bản hiện tại phù hợp trình diễn luồng phần mềm. Nó không thay thế kiểm định an toàn thực phẩm, phần cứng hoặc thanh toán thật.

## 2. Nhóm người dùng

| Vai trò | Quyền chính |
|---|---|
| Customer | Xem danh mục đang bán, tạo giỏ, đăng ký/đăng nhập, tạo đơn và xem kết quả demo của đơn mình. |
| Operator | Xem tình trạng máy, kho, cảnh báo, lịch sử telemetry/restock; restock, kiểm kê và xóa lỗi sau khi telemetry an toàn. |
| Admin | Tất cả quyền vận hành; quản lý máy, sản phẩm, tài khoản/role, ngưỡng nhiệt, báo cáo tài chính và CSV. |
| Thiết bị IoT | Gửi telemetry qua HTTPS/HTTP REST bằng `X-Device-Key` riêng của máy. |

## 3. Yêu cầu chức năng và trạng thái

| ID | Yêu cầu | Trạng thái trong repo |
|---|---|---|
| FR-C01 | Xem trái cây, giá, ảnh, tồn kho và máy/cột có hàng | Có; tồn kho khả dụng loại các lô hết hạn. |
| FR-C02 | Chọn nhiều sản phẩm/số lượng trong giỏ | Có; mỗi đơn vị được tạo thành một giao dịch backend. |
| FR-C03 | Thanh toán QR/ví/thẻ | Mô phỏng; QR minh họa, không thu tiền. Cần nhà cung cấp, sandbox và webhook để hoàn tất thật. |
| FR-C04 | Xuất hàng vật lý | Mô phỏng trạng thái API và tồn kho; chưa có ESP32/servo. |
| FR-C05 | Thông báo giao dịch bị kẹt và biên nhận | Có màn hình biên nhận; demo kẹt sau 2 lần retry; chưa có hoàn tiền tự động/email. |
| FR-O01 | Nhân viên đăng nhập an toàn | Có JWT, bcrypt, role `OPERATOR`; giao diện portal responsive. |
| FR-O02 | Restock và nhật ký thao tác | Có lô FIFO/restock event; portal xem lịch sử. |
| FR-O03 | Cảnh báo tồn thấp, hạn dùng, lỗi máy, cửa và nhả hàng | Có endpoint cảnh báo và portal; portal tự cập nhật. Chưa có push notification ra điện thoại. |
| FR-O04 | Xem nhiệt độ/độ ẩm/cửa/cảm biến | Có log và trang telemetry; event stream nội bộ đẩy dữ liệu tới portal. Chưa có kết nối cảm biến thật. |
| FR-O05 | Xóa lỗi có kiểm tra | Có; chỉ xóa khi có telemetry mới trong 2 phút, cảm biến tốt, cửa đóng, nhiệt độ trong ngưỡng; lưu `MachineAction`. |
| FR-A01 | Quản lý đội máy, ngưỡng, sản phẩm/cột, role | API và portal Admin có. |
| FR-A02 | Dashboard doanh thu, sản phẩm bán, giờ cao điểm | Có API tổng hợp và portal Admin; tính doanh thu từ giao dịch đã thanh toán và giao thành công. |
| FR-A03 | Xuất báo cáo | CSV có; nút in/lưu PDF dùng chức năng in của trình duyệt. |
| FR-A04 | Xem/sửa tài khoản và vai trò | Có ở portal Admin; tạo user, đổi role. |
| FR-S01 | OpenAPI/Swagger có version | Có tại `/api-docs`; API prefix `/api/v1`. |

## 4. Yêu cầu phi chức năng

| Nhóm | Mục tiêu đề tài | Bản hiện tại / bằng chứng |
|---|---|---|
| Hiệu năng | API p95 < 500 ms; telemetry < 2 s | Có index truy vấn và streaming event; chưa chạy benchmark nên chưa thể khẳng định p95/1000 máy. Streaming hiện là SSE, không phải WebSocket. |
| Usability | Khách mua ≤5 thao tác; màn 14 inch; dashboard mobile | Trang React có giỏ/checkout demo; portal responsive và frontend cài được như PWA. Chưa kiểm thử thực tế trên kiosk/điện thoại hoặc đếm thao tác; chưa có native mobile app. |
| Bảo mật | TLS, mã hóa lưu trữ, RBAC | JWT/RBAC, bcrypt, device key hash và giới hạn API theo role. TLS phải cấu hình reverse proxy; mã hóa ổ đĩa/backup phụ thuộc hạ tầng. |
| Availability | 99.9%, offline mode | Có health check và thông báo không kết nối; không có SLA/HA hay chế độ bán offline. Khi offline phải dừng giao dịch để tránh tồn kho sai. |
| Reliability | Jam <2%, retry, DLQ | Mô phỏng 2 lần retry; chưa có phần cứng/benchmark, queue hoặc dead-letter queue. |
| Scale | 1.000 máy | Có index và truy vấn theo fleet; chưa có load test. |

## 5. Quy tắc nghiệp vụ

- Nhiệt độ an toàn mặc định 2–8 °C, có thể cấu hình trên từng máy.
- Cảm biến lỗi, cửa mở hoặc nhiệt độ ngoài ngưỡng đưa máy về `FAULT` và không cho tạo đơn mới.
- Restock tạo lô mới; hạn dùng mặc định lấy từ `shelfLifeHours` của sản phẩm.
- Xuất hàng thành công trừ lô còn hạn nhập trước (FIFO); lô hết hạn không được bán.
- Doanh thu dashboard chỉ tính đơn `paymentStatus=SUCCESS` và `dispenseStatus=SUCCESS`.
- `simulate-payment`/`simulate-dispense` chạy trong development; trong production chỉ chạy khi được bật chủ động bằng `SIMULATION_MODE=true` cho bản demo. Cờ này không tích hợp thanh toán hoặc phần cứng thật.

## 6. Ngoài phạm vi bản phần mềm demo

ESP32/servo/DHT22, cổng thanh toán thật, hoàn tiền tự động, push mobile, SLA 99.9%, benchmark 1.000 máy và vận hành cloud production cần thiết bị/tài khoản/hạ tầng thực tế.
