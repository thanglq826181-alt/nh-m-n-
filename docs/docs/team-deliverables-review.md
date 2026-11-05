# Đối chiếu phân công nhóm và mức hoàn thiện FreshVend

Đánh giá dựa trên mã nguồn/tài liệu hiện có trong repo, không giả định phần cứng, ứng dụng hay demo ngoài repo đã hoàn thành.

## Trạng thái theo thành viên

| Thành viên | Đã có trong repo | Còn thiếu / chỉ mô phỏng | Mức độ |
|---|---|---|---|
| **1. Team Leader + Backend Lead** | PostgreSQL + Prisma schema/migrations; ERD và class diagram ở `docs/uml`; REST API auth/product/machine/inventory/transaction/user/telemetry; JWT, bcrypt, RBAC; OpenAPI/Swagger; transaction và FIFO inventory. | Cần bổ sung kiểm thử API/security/concurrency rộng hơn để nghiệm thu. | **Backend phần mềm gần hoàn chỉnh** |
| **2. IoT & Hardware Lead** | Trang mô phỏng telemetry; API HTTP nhận nhiệt độ/độ ẩm/cửa/sensor status; device key; lưu log, cảnh báo, clear-fault; portal nhận SSE. | Không có firmware ESP32, mạch, servo/motor, cảm biến thật hay demo nhả hàng vật lý. Không dùng MQTT/WebSocket cho thiết bị. | **Mới hoàn thành luồng mô phỏng phần mềm** |
| **3. Vending Machine UI Lead** | React storefront, catalog còn hàng, giỏ, tích hợp API, checkout demo, chọn kết quả nhả hàng demo, receipt và báo lỗi. | QR chỉ minh họa; chưa có cổng/QR thanh toán thật; chưa chạy kiểm thử trên màn hình kiosk vật lý. | **UI demo đã có; thanh toán thật chưa có** |
| **4. Dashboard & Mobile Lead** | Web portal Admin/Operator: doanh thu/CSV, tồn kho, nhiệt độ, máy, cảnh báo, restock, quản lý account; giao diện responsive và có thể cài như PWA trên điện thoại/máy tính bảng. | Không có native Flutter/React Native app, push notification hay kiểm thử trên thiết bị di động thật. PWA chỉ cache app shell; thao tác dữ liệu vẫn cần mạng. | **Web dashboard/PWA có; native mobile app chưa có** |
| **5. QA + DevOps + Documentation Lead** | SRS, architecture/component/deployment, ERD/class/use-case/sequence sources, Mermaid preview, test report, operations guide, README, Docker Compose release config, CI build, API integration và PWA tests. | Sơ đồ PlantUML chưa render thành ảnh; Docker image/Compose chưa được chạy local do thiếu Docker CLI; chưa có browser E2E, load/restore/security acceptance. | **Tài liệu và cấu hình có; nghiệm thu triển khai còn thiếu** |

## Tài liệu/sơ đồ có thể dùng khi bảo vệ

- ERD: [`docs/uml/erd.puml`](uml/erd.puml), đối chiếu với [`prisma/schema.prisma`](../prisma/schema.prisma).
- Class diagram: [`docs/uml/class-diagram.puml`](uml/class-diagram.puml).
- Use-case: [`docs/uml/use-case.puml`](uml/use-case.puml).
- Sequence mua hàng: [`docs/uml/purchase-sequence.puml`](uml/purchase-sequence.puml).
- Sequence telemetry: [`docs/uml/telemetry-sequence.puml`](uml/telemetry-sequence.puml).
- Component/deployment diagram và kiến trúc: [`docs/architecture.md`](architecture.md).
- Bản xem sơ đồ Mermaid: [`docs/diagrams-preview.md`](diagrams-preview.md).
- OpenAPI/Swagger chạy tại `/api-docs`; test/build status ở [`docs/quality-and-test-report.md`](quality-and-test-report.md).

## Gợi ý trả lời các câu hỏi bảo vệ

### Thành viên 2 — servo, ESP32, dữ liệu

**Servo hoạt động thế nào?** Trong máy thật, ESP32 tạo PWM (ví dụ qua LEDC) với chu kỳ và độ rộng xung phù hợp servo để đặt góc nhả; cần nguồn phù hợp, giới hạn hành trình và cảm biến xác nhận sản phẩm đã rơi. Thông số xung phải lấy theo đúng model servo, không tự khẳng định một model cụ thể khi nhóm chưa chọn. Xem [hướng dẫn servo chính thức của Espressif](https://docs.espressif.com/projects/esp-iot-solution/en/latest/motor/servo.html). Repo hiện chưa có servo hoặc firmware, vì vậy chỉ có thể trình bày đây là thiết kế dự kiến, không nói phần cứng đã chạy.

**ESP32 giao tiếp server bằng gì?** Bản hiện tại nhận telemetry bằng HTTP REST qua `POST /api/v1/telemetry/temperature`, xác thực thiết bị bằng `X-Device-Key`. Chưa có MQTT hay giao tiếp WebSocket với ESP32. Portal web nhận thay đổi qua SSE.

**Dữ liệu gửi lên Backend thế nào?** Payload hiện dùng JSON:

```json
{
  "machineId": "<UUID>",
  "temperature": 5.2,
  "humidity": 70,
  "doorOpen": false,
  "sensorOk": true
}
```

Backend kiểm tra thiết bị/nhân viên, ghi `TemperatureLog`, cập nhật `lastPing` và trạng thái máy, rồi phát event cho portal. Để dùng firmware thật cần kiểm thử hợp đồng payload, khóa, retry và TLS với thiết bị.

### Thành viên 3 — luồng bán hàng và thanh toán

1. UI tải catalog chỉ gồm máy ONLINE, cột có hàng còn hạn.
2. Khách chọn sản phẩm/số lượng; backend xác thực lại máy, cột, tồn kho và giá khi tạo từng transaction.
3. Checkout gọi endpoint thanh toán mô phỏng, sau đó chọn kết quả nhả thành công hoặc JAMMED.
4. Backend cập nhật tồn kho khi nhả mô phỏng thành công; khi hết hàng/kẹt, UI hiển thị mã giao dịch và hướng dẫn liên hệ vận hành.

QR hiện chỉ minh họa, không tạo giao dịch ngân hàng. Vì vậy cần nói rõ đây là checkout demo.

### Thành viên 4 — dashboard và cảnh báo

- **Admin:** quản lý máy/sản phẩm/tài khoản, đặt ngưỡng, xem doanh thu đơn đã giao thành công, sản phẩm bán chạy/giờ cao điểm, CSV và báo cáo in.
- **Operator:** theo dõi máy, kho, telemetry và giao dịch; restock/kiểm kê; xóa FAULT chỉ sau telemetry mới đạt điều kiện an toàn.
- **Alerts:** bao gồm máy FAULT/offline hoặc không ping trên 2 phút, nhiệt độ ngoài ngưỡng, cửa mở, stock thấp (≤5), lô sắp hết hạn (≤3 ngày), lô hết hạn và giao dịch JAMMED gần đây.
- Dashboard cập nhật bằng SSE, có polling dự phòng; chưa có push notification mobile.

### Thành viên 5 — kiểm thử, triển khai và kiến trúc

- Test tự động có 5 unit test và 1 API integration test với PostgreSQL. Smoke test thủ công đã chạy portal; đây chưa phải bộ browser E2E/security/load đầy đủ.
- Bản demo phát hành dùng Docker Compose, PostgreSQL private, API và frontend sau reverse proxy HTTPS; xem [`docs/release-v1.0.0.md`](release-v1.0.0.md). Chưa kiểm chứng compose/image local vì máy dev không có Docker CLI.
- Kiến trúc: React browser → Express REST API → PostgreSQL/Prisma; IoT simulator/thiết bị tương lai → telemetry REST; API → Operations Portal qua SSE.

## Kết luận mức sẵn sàng

Repo đủ nội dung để bảo vệ **prototype phần mềm và mô phỏng**. Chưa đủ để khẳng định đã hoàn thành một máy bán hàng IoT tích hợp hoàn chỉnh: firmware, mạch/servo, thanh toán thật, native mobile app, push notifications và kiểm thử tải/triển khai thực tế chưa có. Nếu rubric bắt buộc các mục đó, cần nhóm thành viên phụ trách cung cấp phần cứng/tài khoản và triển khai phần còn thiếu trước nghiệm thu cuối.
