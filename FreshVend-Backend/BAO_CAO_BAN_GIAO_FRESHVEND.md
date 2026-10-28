# Báo cáo bàn giao FreshVend Backend

Tài liệu bàn giao cũ đã lỗi thời. Dùng tài liệu cập nhật tại [HUONG_DAN_TICH_HOP_BAN_GIAO.md](./HUONG_DAN_TICH_HOP_BAN_GIAO.md) để xem trạng thái API, hướng dẫn chạy local/Docker, hợp đồng tích hợp Frontend/IoT và các phụ thuộc còn thiếu cho thanh toán thật và triển khai VPS.

Tóm tắt hiện tại: backend REST, Prisma schema/migrations, JWT/RBAC, APIs sản phẩm/máy/tồn kho/giao dịch/người dùng, Swagger và telemetry HTTP bằng device key đã có. Thanh toán QR hiện là mô phỏng; chưa thể xác nhận giao dịch thật khi nhóm chưa chọn nhà cung cấp và cung cấp tài khoản sandbox/webhook. Tích hợp với firmware/Frontend và deploy lên VPS cần mã nguồn/tài khoản/hardware tương ứng.
