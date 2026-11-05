# Các đầu vào bên ngoài còn cần để hoàn tất sản phẩm thật

## Phạm vi đã chốt cho bản hiện tại

Người dùng chọn giữ thanh toán demo và IoT mô phỏng. Vì vậy, các tích hợp dưới đây được ghi nhận là điều kiện để nâng cấp sang sản phẩm thương mại, không phải việc cản trở bản demo hiện tại.

## Thanh toán

Nhóm cần chốt VNPay/MoMo/VietQR/ngân hàng, tài khoản sandbox/merchant, tài liệu chữ ký/webhook, URL callback HTTPS, quy trình idempotency, timeout, đối soát và hoàn tiền. Hiện `Payment.jsx` chạy endpoint mô phỏng; không được đưa lên production để thu tiền.

## Phần cứng và firmware

Cần sơ đồ ESP32, model cảm biến (ví dụ DHT22), driver servo/motor, protocol command/ack, timeout, cảm biến kẹt, cơ chế dừng khẩn và nguồn điện lạnh. Thiết bị cần gửi telemetry theo contract và xác nhận command có idempotency. Chưa có mã firmware hoặc thiết bị trong repo.

## Nghiệm thu vận hành

Cần máy thử thật, thực phẩm/lô mẫu, hiệu chuẩn nhiệt kế, thử cửa, test chu kỳ servo, log retry/jam, quy trình vệ sinh, bảo quản và hoàn tiền. Yêu cầu 2–8 °C cần xác nhận bởi cảm biến/thiết bị đã hiệu chuẩn và tiêu chuẩn an toàn thực phẩm phù hợp.

## Hạ tầng production

Cần domain, TLS, secrets, backup/restore, monitoring/alerting, log retention, reverse proxy, CI/CD và staging. Docker Compose chỉ là gói triển khai cơ sở, không tự cung cấp HA/SLA 99.9% hoặc scale 1.000 máy.
