import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { prisma } from './config/db';
import { openApiSpec } from './docs/openapi';
import authRouter from './routes/auth';
import productsRouter from './routes/products';
import machinesRouter from './routes/machines';
import transactionsRouter from './routes/transactions';
import usersRouter from './routes/users';
import telemetryRouter from './routes/telemetry';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean);

app.use(cors(corsOrigins?.length ? { origin: corsOrigins } : undefined));
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
app.get('/api-docs.json', (_req, res) => res.json(openApiSpec));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/machines', machinesRouter);
app.use('/api/v1/transactions', transactionsRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/telemetry', telemetryRouter);

// Route kiểm tra trạng thái Server & CSDL
app.get('/health', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'success',
      message: '🚀 FreshVend Backend đang chạy rất tốt!',
      database: 'Kết nối PostgreSQL thành công'
    });
  } catch (error: any) {
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
if (require.main === module) app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Server FreshVend đang chạy tại: http://localhost:${PORT}`);
  console.log(`🔍 Thử nghiệm API Health Check: http://localhost:${PORT}/health`);
  console.log(`📚 Swagger API Documentation: http://localhost:${PORT}/api-docs`);
  console.log(`==================================================`);
});

export default app;
