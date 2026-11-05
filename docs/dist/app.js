"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const db_1 = require("./config/db");
const openapi_1 = require("./docs/openapi");
const auth_1 = __importDefault(require("./routes/auth"));
const products_1 = __importDefault(require("./routes/products"));
const machines_1 = __importDefault(require("./routes/machines"));
const transactions_1 = __importDefault(require("./routes/transactions"));
const users_1 = __importDefault(require("./routes/users"));
const telemetry_1 = __importDefault(require("./routes/telemetry"));
const operations_1 = __importDefault(require("./routes/operations"));
dotenv_1.default.config();
const app = (0, express_1.default)();
exports.app = app;
const PORT = process.env.PORT || 5000;
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
app.use((0, cors_1.default)({ origin: corsOrigins }));
app.use(express_1.default.json());
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openapi_1.openApiSpec));
app.get('/api-docs.json', (_req, res) => res.json(openapi_1.openApiSpec));
app.use('/api/v1/auth', auth_1.default);
app.use('/api/v1/products', products_1.default);
app.use('/api/v1/machines', machines_1.default);
app.use('/api/v1/transactions', transactions_1.default);
app.use('/api/v1/users', users_1.default);
app.use('/api/v1/telemetry', telemetry_1.default);
app.use('/api/v1/operations', operations_1.default);
// Route kiểm tra trạng thái Server & CSDL
app.get('/health', async (req, res) => {
    try {
        await db_1.prisma.$queryRaw `SELECT 1`;
        res.status(200).json({
            status: 'success',
            message: '🚀 FreshVend Backend đang chạy rất tốt!',
            database: 'Kết nối PostgreSQL thành công'
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Lỗi kết nối CSDL PostgreSQL',
            error: error.message
        });
    }
});
app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Không tìm thấy endpoint' });
});
// Route lấy danh sách sản phẩm mẫu
if (require.main === module)
    app.listen(PORT, () => {
        console.log(`==================================================`);
        console.log(`🚀 Server FreshVend đang chạy tại: http://localhost:${PORT}`);
        console.log(`🔍 Thử nghiệm API Health Check: http://localhost:${PORT}/health`);
        console.log(`📚 Swagger API Documentation: http://localhost:${PORT}/api-docs`);
        console.log(`==================================================`);
    });
exports.default = app;
