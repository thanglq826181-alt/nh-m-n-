# Sơ đồ FreshVend

Các sơ đồ Mermaid dưới đây hiển thị trực tiếp trên GitHub/GitLab hỗ trợ Mermaid. PlantUML source đầy đủ nằm trong [`docs/uml/`](uml/README.md). Các sơ đồ mô tả bản phần mềm demo 1.0.0.

## Use-case

```mermaid
flowchart LR
  Customer([Customer])
  Operator([Operator])
  Admin([Admin])
  Device([IoT device / simulator])
  subgraph FV[FreshVend]
    Catalog[Browse available catalog]
    Auth[Register / sign in]
    Checkout[Create demo transaction]
    Payment[Simulate payment]
    Dispense[Simulate dispense result]
    Receipt[View receipt / jam result]
    Monitor[View machine, inventory, alerts]
    Restock[Restock / stocktake]
    Temperature[View temperature history]
    ClearFault[Clear fault after safe telemetry]
    AdminTasks[Manage machines, products, users]
    Analytics[View analytics / export CSV]
    SendTelemetry[Send authenticated telemetry]
  end
  Customer --> Catalog
  Customer --> Auth
  Customer --> Checkout
  Customer --> Payment
  Customer --> Dispense
  Customer --> Receipt
  Operator --> Monitor
  Operator --> Restock
  Operator --> Temperature
  Operator --> ClearFault
  Admin --> Monitor
  Admin --> Restock
  Admin --> Temperature
  Admin --> ClearFault
  Admin --> AdminTasks
  Admin --> Analytics
  Device --> SendTelemetry
```

## ERD

```mermaid
erDiagram
  USER {
    uuid id PK
    string username UK
    string passwordHash
    enum role
  }
  MACHINE {
    uuid id PK
    string machineCode UK
    enum status
    float tempMin
    float tempMax
    string deviceKeyHash UK
  }
  PRODUCT {
    uuid id PK
    string name
    decimal price
    int shelfLifeHours
  }
  COLUMN {
    uuid id PK
    uuid machineId FK
    int columnNumber
    uuid productId FK
    int currentStock
    int maxCapacity
  }
  INVENTORY_BATCH {
    uuid id PK
    uuid columnId FK
    int quantity
    datetime expiryDate
  }
  TRANSACTION {
    uuid id PK
    string transactionCode UK
    uuid machineId FK
    uuid columnId FK
    uuid customerId FK
    decimal amount
    enum paymentStatus
    enum dispenseStatus
  }
  TEMPERATURE_LOG {
    bigint id PK
    uuid machineId FK
    float temperature
    float humidity
    boolean doorOpen
    boolean sensorOk
  }
  RESTOCK_EVENT {
    uuid id PK
    uuid machineId FK
    uuid columnId FK
    uuid operatorId FK
    int quantity
  }
  MACHINE_ACTION {
    uuid id PK
    uuid machineId FK
    uuid operatorId FK
    string action
  }
  MACHINE ||--o{ COLUMN : contains
  PRODUCT o|--o{ COLUMN : assigned
  COLUMN ||--o{ INVENTORY_BATCH : stocked_as
  MACHINE ||--o{ TRANSACTION : occurs_at
  COLUMN ||--o{ TRANSACTION : purchased_from
  USER o|--o{ TRANSACTION : customer
  MACHINE ||--o{ TEMPERATURE_LOG : records
  MACHINE ||--o{ RESTOCK_EVENT : has
  COLUMN ||--o{ RESTOCK_EVENT : restocked
  USER o|--o{ RESTOCK_EVENT : operator
  MACHINE ||--o{ MACHINE_ACTION : audits
  USER o|--o{ MACHINE_ACTION : operator
```

## Class diagram

```mermaid
classDiagram
  class User {
    +UUID id
    +String username
    +UserRole role
  }
  class Machine {
    +UUID id
    +String machineCode
    +MachineStatus status
    +Float tempMin
    +Float tempMax
  }
  class Column {
    +UUID id
    +Int columnNumber
    +Int currentStock
    +Int maxCapacity
  }
  class Product {
    +UUID id
    +String name
    +Decimal price
    +Int shelfLifeHours
  }
  class InventoryBatch {
    +UUID id
    +Int quantity
    +DateTime expiryDate
  }
  class Transaction {
    +UUID id
    +Decimal amount
    +PaymentStatus paymentStatus
    +DispenseStatus dispenseStatus
  }
  class TemperatureLog {
    +BigInt id
    +Float temperature
    +Boolean doorOpen
    +Boolean sensorOk
  }
  class RestockEvent {
    +UUID id
    +Int quantity
    +Int previousStock
    +Int newStock
  }
  class MachineAction {
    +UUID id
    +String action
    +String details
  }
  Machine "1" *-- "0..*" Column
  Product "0..1" --> "0..*" Column
  Column "1" *-- "0..*" InventoryBatch
  Machine "1" --> "0..*" Transaction
  Column "1" --> "0..*" Transaction
  User "0..1" --> "0..*" Transaction : customer
  Machine "1" *-- "0..*" TemperatureLog
  Machine "1" *-- "0..*" RestockEvent
  Column "1" --> "0..*" RestockEvent
  User "0..1" --> "0..*" RestockEvent : operator
  Machine "1" *-- "0..*" MachineAction
  User "0..1" --> "0..*" MachineAction : operator
```

## Sequence: checkout demo

```mermaid
sequenceDiagram
  actor Customer
  participant UI as React storefront
  participant API as Express REST API
  participant DB as PostgreSQL
  participant Portal as Operations portal
  Customer->>UI: Chọn sản phẩm và số lượng
  UI->>API: GET /products/catalog
  API->>DB: Đọc máy ONLINE, lô còn hạn
  DB-->>UI: Catalog, giá, tồn khả dụng
  loop Mỗi sản phẩm
    UI->>API: POST /transactions
    API->>DB: Kiểm tra và tạo đơn theo giá server
    DB-->>UI: Transaction ID, amount
    UI->>API: POST /simulate-payment
    API->>DB: PENDING → SUCCESS (demo)
    UI->>API: POST /simulate-dispense
    API->>DB: Cập nhật kho / trạng thái (mô phỏng)
    API-->>UI: SUCCESS hoặc JAMMED
    API-->>Portal: Event giao dịch qua SSE
  end
  UI-->>Customer: Biên nhận demo / mã cần hỗ trợ
```

## Component và deployment

```mermaid
flowchart LR
  Browser[Browser / kiosk screen]
  Frontend[React PWA + Nginx]
  API[Express REST API + Prisma]
  DB[(PostgreSQL)]
  Sim[IoT simulator]
  Device[Future ESP32 hardware]
  Pay[Future payment provider]
  Browser --> Frontend
  Frontend -->|HTTPS REST, SSE| API
  API --> DB
  Sim -->|HTTP telemetry| API
  Device -. Future integration .-> API
  Pay -. Future integration .-> API
```

Thiết bị thật và nhà cung cấp thanh toán là các tích hợp tương lai; diagram không biểu thị chúng đã được triển khai.
