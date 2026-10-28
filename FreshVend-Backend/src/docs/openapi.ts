const idParameter = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

const bearer = [{ bearerAuth: [] }];
const jsonResponse = (description: string, schema: Record<string, unknown> = { type: 'object' }) => ({
  description,
  content: { 'application/json': { schema } },
});
const requestBody = (schema: Record<string, unknown>) => ({
  required: true,
  content: { 'application/json': { schema } },
});

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'FreshVend Backend API',
    version: '1.0.0',
    description: 'REST API cho hệ thống máy bán trái cây FreshVend. Thanh toán và kết quả nhả hàng hiện chạy ở chế độ giả lập trong môi trường development. Màn hình QR hiện tại chỉ là giao diện demo; frontend cần gửi transaction ID và dùng số tiền từ giao dịch, không xác nhận thanh toán chỉ bằng điều hướng trang.',
  },
  servers: [{ url: 'http://localhost:5000', description: 'Local development' }],
  tags: [
    { name: 'Health' }, { name: 'Auth' }, { name: 'Products' },
    { name: 'Machines & Inventory' }, { name: 'Transactions' }, { name: 'Users' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      deviceKeyAuth: { type: 'apiKey', in: 'header', name: 'X-Device-Key' },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { success: { type: 'boolean', example: false }, message: { type: 'string' } },
      },
      ProductInput: {
        type: 'object', required: ['name', 'price', 'shelfLifeHours'],
        properties: {
          name: { type: 'string', maxLength: 100, example: 'Táo Envy' },
          price: { type: 'number', exclusiveMinimum: 0, example: 65000 },
          shelfLifeHours: { type: 'integer', minimum: 1, example: 48 },
        },
      },
      ProductUpdateInput: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 100 },
          price: { type: 'number', exclusiveMinimum: 0 },
          shelfLifeHours: { type: 'integer', minimum: 1 },
        },
        minProperties: 1,
      },
      TransactionInput: {
        type: 'object', required: ['machineId', 'columnId'],
        properties: {
          machineId: { type: 'string', format: 'uuid' },
          columnId: { type: 'string', format: 'uuid' },
        },
      },
      UserInput: {
        type: 'object', required: ['username', 'password', 'role'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 50 },
          password: { type: 'string', minLength: 8, maxLength: 72, format: 'password' },
          fullName: { type: 'string', maxLength: 100 },
          role: { type: 'string', enum: ['ADMIN', 'OPERATOR', 'CUSTOMER'] },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: { tags: ['Health'], summary: 'Kiểm tra server và PostgreSQL', responses: { '200': jsonResponse('Server hoạt động'), '500': jsonResponse('Database không khả dụng') } },
    },
    '/api/v1/auth/register': {
      post: { tags: ['Auth'], summary: 'Đăng ký Customer', description: 'Role luôn là CUSTOMER; không nhận role từ request.', requestBody: requestBody({ type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string', format: 'password' }, fullName: { type: 'string' } } }), responses: { '201': jsonResponse('Tạo tài khoản thành công'), '409': jsonResponse('Username đã tồn tại') } },
    },
    '/api/v1/auth/login': {
      post: { tags: ['Auth'], summary: 'Đăng nhập và nhận JWT', requestBody: requestBody({ type: 'object', required: ['username', 'password'], properties: { username: { type: 'string' }, password: { type: 'string', format: 'password' } } }), responses: { '200': jsonResponse('Đăng nhập thành công'), '401': jsonResponse('Thông tin đăng nhập sai') } },
    },
    '/api/v1/auth/me': {
      get: { tags: ['Auth'], summary: 'Lấy tài khoản hiện tại', security: bearer, responses: { '200': jsonResponse('Thông tin tài khoản'), '401': jsonResponse('Token không hợp lệ') } },
    },
    '/api/v1/products': {
      get: { tags: ['Products'], summary: 'Danh sách sản phẩm công khai', responses: { '200': jsonResponse('Danh sách sản phẩm') } },
      post: { tags: ['Products'], summary: 'Tạo sản phẩm (Admin)', security: bearer, requestBody: requestBody({ $ref: '#/components/schemas/ProductInput' }), responses: { '201': jsonResponse('Đã tạo'), '401': jsonResponse('Cần đăng nhập'), '403': jsonResponse('Chỉ Admin') } },
    },
    '/api/v1/products/catalog': {
      get: { tags: ['Products'], summary: 'Danh mục trái cây đang còn hàng tại máy ONLINE', description: 'Trả mỗi vị trí bán được kèm product fields, machineId, columnId và availableStock để Frontend tạo giao dịch.', responses: { '200': jsonResponse('Danh mục sản phẩm và vị trí cột hàng đang bán') } },
    },
    '/api/v1/products/{id}': {
      get: { tags: ['Products'], summary: 'Chi tiết sản phẩm công khai', parameters: [idParameter], responses: { '200': jsonResponse('Sản phẩm'), '404': jsonResponse('Không tìm thấy') } },
      put: { tags: ['Products'], summary: 'Cập nhật một hoặc nhiều trường sản phẩm (Admin)', parameters: [idParameter], security: bearer, requestBody: requestBody({ $ref: '#/components/schemas/ProductUpdateInput' }), responses: { '200': jsonResponse('Đã cập nhật'), '403': jsonResponse('Chỉ Admin') } },
      delete: { tags: ['Products'], summary: 'Xóa sản phẩm (Admin)', parameters: [idParameter], security: bearer, responses: { '200': jsonResponse('Đã xóa'), '403': jsonResponse('Chỉ Admin') } },
    },
    '/api/v1/machines': {
      get: { tags: ['Machines & Inventory'], summary: 'Danh sách máy (Admin/Operator)', security: bearer, responses: { '200': jsonResponse('Danh sách máy và cột hàng'), '403': jsonResponse('Chỉ staff') } },
      post: { tags: ['Machines & Inventory'], summary: 'Tạo máy (Admin)', security: bearer, requestBody: requestBody({ type: 'object', required: ['machineCode', 'locationName'], properties: { machineCode: { type: 'string' }, locationName: { type: 'string' }, tempMin: { type: 'number', default: 2 }, tempMax: { type: 'number', default: 8 } } }), responses: { '201': jsonResponse('Đã tạo'), '409': jsonResponse('Mã máy đã tồn tại') } },
    },
    '/api/v1/machines/{machineId}': {
      get: { tags: ['Machines & Inventory'], summary: 'Chi tiết máy và cột hàng', parameters: [{ ...idParameter, name: 'machineId' }], security: bearer, responses: { '200': jsonResponse('Máy và cột hàng'), '404': jsonResponse('Không tìm thấy') } },
      patch: { tags: ['Machines & Inventory'], summary: 'Cập nhật máy (Admin)', parameters: [{ ...idParameter, name: 'machineId' }], security: bearer, requestBody: requestBody({ type: 'object', properties: { machineCode: { type: 'string' }, locationName: { type: 'string' }, status: { type: 'string', enum: ['ONLINE', 'OFFLINE', 'FAULT'] }, tempMin: { type: 'number' }, tempMax: { type: 'number' } } }), responses: { '200': jsonResponse('Đã cập nhật'), '403': jsonResponse('Chỉ Admin') } },
    },
    '/api/v1/machines/{machineId}/device-key/rotate': {
      post: { tags: ['Machines & Inventory'], summary: 'Tạo lại khóa HTTP cho thiết bị IoT (Admin)', description: 'Khóa mới chỉ trả về một lần. Gửi nó trong header X-Device-Key khi POST telemetry.', parameters: [{ ...idParameter, name: 'machineId' }], security: bearer, responses: { '200': jsonResponse('Khóa thiết bị mới'), '404': jsonResponse('Không tìm thấy máy') } },
    },
    '/api/v1/machines/{machineId}/columns': {
      get: { tags: ['Machines & Inventory'], summary: 'Danh sách cột hàng (Admin/Operator)', parameters: [{ ...idParameter, name: 'machineId' }], security: bearer, responses: { '200': jsonResponse('Danh sách cột hàng') } },
      post: { tags: ['Machines & Inventory'], summary: 'Tạo cột hàng (Admin)', parameters: [{ ...idParameter, name: 'machineId' }], security: bearer, requestBody: requestBody({ type: 'object', required: ['columnNumber'], properties: { columnNumber: { type: 'integer', minimum: 1 }, productId: { type: 'string', format: 'uuid', nullable: true }, currentStock: { type: 'integer', default: 0 }, maxCapacity: { type: 'integer', default: 10 }, expiryDate: { type: 'string', format: 'date-time', nullable: true } } }), responses: { '201': jsonResponse('Đã tạo cột hàng'), '409': jsonResponse('Số cột đã được dùng') } },
    },
    '/api/v1/machines/{machineId}/columns/{columnId}': {
      patch: { tags: ['Machines & Inventory'], summary: 'Gán sản phẩm hoặc cập nhật cấu hình cột (Admin)', parameters: [{ ...idParameter, name: 'machineId' }, { ...idParameter, name: 'columnId' }], security: bearer, requestBody: requestBody({ type: 'object', properties: { productId: { type: 'string', format: 'uuid', nullable: true }, maxCapacity: { type: 'integer' }, expiryDate: { type: 'string', format: 'date-time', nullable: true } } }), responses: { '200': jsonResponse('Đã cập nhật cột hàng') } },
    },
    '/api/v1/machines/{machineId}/columns/{columnId}/inventory': {
      put: { tags: ['Machines & Inventory'], summary: 'Cập nhật tồn kho tuyệt đối (Admin/Operator)', parameters: [{ ...idParameter, name: 'machineId' }, { ...idParameter, name: 'columnId' }], security: bearer, requestBody: requestBody({ type: 'object', required: ['currentStock'], properties: { currentStock: { type: 'integer', minimum: 0 }, expiryDate: { type: 'string', format: 'date-time', nullable: true } } }), responses: { '200': jsonResponse('Đã cập nhật tồn kho'), '400': jsonResponse('Dữ liệu không hợp lệ') } },
    },
    '/api/v1/machines/{machineId}/temperature-logs': {
      get: { tags: ['Machines & Inventory'], summary: 'Lịch sử cảm biến nhiệt độ/độ ẩm/cửa (Admin/Operator)', parameters: [{ ...idParameter, name: 'machineId' }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, minimum: 1, maximum: 500 } }], security: bearer, responses: { '200': jsonResponse('Danh sách log mới nhất') } },
    },
    '/api/v1/machines/{machineId}/restock-events': {
      get: { tags: ['Machines & Inventory'], summary: 'Lịch sử restock của máy (Admin/Operator)', parameters: [{ ...idParameter, name: 'machineId' }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 100, minimum: 1, maximum: 500 } }], security: bearer, responses: { '200': jsonResponse('Lịch sử restock có Operator thực hiện') } },
    },
    '/api/v1/machines/{machineId}/columns/{columnId}/restock': {
      post: { tags: ['Machines & Inventory'], summary: 'Cộng thêm tồn kho theo lô và ghi lịch sử restock (Admin/Operator)', description: 'quantity được cộng vào tồn kho hiện tại. Mỗi lần restock tạo một lô; nếu không gửi expiryDate, hạn dùng được tính từ shelfLifeHours của sản phẩm. Cảnh báo khi lô còn hạn trong 3 ngày; mức tồn thấp là 1–5 hộp, 0 là hết hàng. Khi bán, hệ thống ưu tiên lô nhập trước (FIFO).', parameters: [{ ...idParameter, name: 'machineId' }, { ...idParameter, name: 'columnId' }], security: bearer, requestBody: requestBody({ type: 'object', required: ['quantity'], properties: { quantity: { type: 'integer', minimum: 1, description: 'Số hộp bổ sung, cộng dồn vào tồn kho hiện tại' }, expiryDate: { type: 'string', format: 'date-time' } } }), responses: { '201': jsonResponse('Đã cộng tồn kho và lưu lô hàng/lịch sử'), '409': jsonResponse('Vượt sức chứa hoặc tồn kho vừa đổi') } },
    },
    '/api/v1/telemetry/temperature': {
      post: { tags: ['Machines & Inventory'], summary: 'Ghi dữ liệu cảm biến qua HTTP', description: 'Thiết bị IoT xác thực bằng X-Device-Key; Admin/Operator có thể dùng JWT để kiểm tra thủ công.', security: [{ deviceKeyAuth: [] }, ...bearer], requestBody: requestBody({ type: 'object', required: ['machineId', 'temperature'], properties: { machineId: { type: 'string', format: 'uuid' }, temperature: { type: 'number', example: 5.2 }, humidity: { type: 'number', minimum: 0, maximum: 100 }, doorOpen: { type: 'boolean', default: false } } }), responses: { '201': jsonResponse('Đã ghi nhận log và cập nhật lastPing'), '401': jsonResponse('Device key hoặc JWT không hợp lệ') } },
    },
    '/api/v1/transactions': {
      get: { tags: ['Transactions'], summary: 'Lịch sử giao dịch (Customer của mình; staff toàn bộ)', security: bearer, responses: { '200': jsonResponse('Danh sách giao dịch') } },
      post: { tags: ['Transactions'], summary: 'Tạo giao dịch giả lập, mỗi đơn một sản phẩm', security: bearer, requestBody: requestBody({ $ref: '#/components/schemas/TransactionInput' }), responses: { '201': jsonResponse('Giao dịch chờ thanh toán'), '409': jsonResponse('Máy hoặc tồn kho không khả dụng') } },
    },
    '/api/v1/transactions/{id}': {
      get: { tags: ['Transactions'], summary: 'Chi tiết giao dịch của mình hoặc giao dịch staff', parameters: [idParameter], security: bearer, responses: { '200': jsonResponse('Giao dịch'), '404': jsonResponse('Không tìm thấy') } },
    },
    '/api/v1/transactions/{id}/simulate-payment': {
      post: { tags: ['Transactions'], summary: 'Giả lập xác nhận thanh toán (chỉ development)', parameters: [idParameter], security: bearer, requestBody: requestBody({ type: 'object', required: ['outcome'], properties: { outcome: { type: 'string', enum: ['SUCCESS', 'FAILED'] } } }), responses: { '200': jsonResponse('Đã cập nhật thanh toán'), '404': jsonResponse('Endpoint ẩn ở production') } },
    },
    '/api/v1/transactions/{id}/simulate-dispense': {
      post: { tags: ['Transactions'], summary: 'Giả lập kết quả nhả hàng (chỉ development)', parameters: [idParameter], security: bearer, requestBody: requestBody({ type: 'object', required: ['outcome'], properties: { outcome: { type: 'string', enum: ['SUCCESS', 'JAMMED'] } } }), responses: { '200': jsonResponse('Đã cập nhật nhả hàng') } },
    },
    '/api/v1/users': {
      get: { tags: ['Users'], summary: 'Danh sách user (Admin)', security: bearer, parameters: [{ name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } }], responses: { '200': jsonResponse('Danh sách user, không gồm password hash') } },
      post: { tags: ['Users'], summary: 'Tạo user (Admin)', security: bearer, requestBody: requestBody({ $ref: '#/components/schemas/UserInput' }), responses: { '201': jsonResponse('Đã tạo user'), '409': jsonResponse('Username đã tồn tại') } },
    },
    '/api/v1/users/{id}': {
      get: { tags: ['Users'], summary: 'Chi tiết user (Admin)', parameters: [idParameter], security: bearer, responses: { '200': jsonResponse('Thông tin user') } },
      delete: { tags: ['Users'], summary: 'Xóa user (Admin; không thể tự xóa hoặc xóa Admin cuối)', parameters: [idParameter], security: bearer, responses: { '200': jsonResponse('Đã xóa'), '409': jsonResponse('Không thể xóa Admin cuối') } },
    },
    '/api/v1/users/{id}/role': {
      patch: { tags: ['Users'], summary: 'Đổi role (Admin)', parameters: [idParameter], security: bearer, requestBody: requestBody({ type: 'object', required: ['role'], properties: { role: { type: 'string', enum: ['ADMIN', 'OPERATOR', 'CUSTOMER'] } } }), responses: { '200': jsonResponse('Đã đổi role'), '409': jsonResponse('Không thể hạ quyền Admin cuối') } },
    },
  },
} as const;
