# UML and ERD sources

These PlantUML files are source deliverables aligned with `prisma/schema.prisma` and the current REST contract:

- `use-case.puml`: Customer, Operator, Admin, and simulated device capabilities.
- `purchase-sequence.puml`: customer checkout, demo payment/dispense and SSE notification.
- `telemetry-sequence.puml`: device upload, staff portal refresh and safe fault-clear flow.
- `class-diagram.puml`: persistent domain model and relationships.
- `erd.puml`: database ERD with primary keys, foreign keys and uniqueness constraints.
- `../architecture.md`: component and deployment diagrams.

Render a source file with a PlantUML renderer for presentation slides. Notes identify simulated behavior; do not present it as connected hardware or real payment processing.
