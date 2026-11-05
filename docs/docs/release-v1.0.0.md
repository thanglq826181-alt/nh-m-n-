# FreshVend 1.0.0 — Official Demo Release

## Release scope

This is the official **software demo release** of FreshVend. It includes the customer storefront, demo checkout and dispense flow, staff operations portal, inventory and expiry tracking, telemetry simulation, alerts, reporting, PostgreSQL migrations, and Docker deployment configuration.

`SIMULATION_MODE=true` is intentional for this release: no money is collected, QR codes are illustrative, dispense results are simulated, and no physical machine is controlled. Do not present the receipt as a bank receipt or the machine state as proof from calibrated hardware.

## Production-mode deployment

1. Install Docker Engine/Desktop with the Compose plugin and configure a DNS name plus HTTPS reverse proxy. Route the frontend hostname to `127.0.0.1:8080` and the API hostname to `127.0.0.1:5000`. Keep PostgreSQL private.
2. Copy `.env.release.example` to `.env.release`. Replace all credentials, use an alphanumeric PostgreSQL password for the Compose-built connection URL, and set `CORS_ORIGINS` to the exact HTTPS frontend origin and `FRONTEND_API_BASE_URL` to the HTTPS API base host. Do not commit `.env.release`.
3. Start the release stack:

   ```powershell
   docker compose --env-file .env.release -f docker-compose.release.yml up --build -d
   ```

4. Create or reset the first Admin using the configured secret:

   ```powershell
   docker compose --env-file .env.release -f docker-compose.release.yml exec api npm run db:seed
   ```

5. Confirm all containers are healthy with `docker compose --env-file .env.release -f docker-compose.release.yml ps`; then verify HTTPS frontend, `/health`, and `/api-docs` through the reverse proxy.
6. Back up the `freshvend-release-postgres` volume and test restoring it before accepting operational data.

The release stack sets `NODE_ENV=production`, binds frontend/API ports to loopback for the TLS proxy, does not publish PostgreSQL, uses the default non-root Node account for the API, and applies migrations before starting the API. Keep `SIMULATION_MODE=true` only while this release remains an explicitly labelled demo. Setting it false disables payment/dispense simulation endpoints; it does not activate a real payment provider or hardware adapter.

## Verification for this release

- Backend build, frontend lint/build, Prisma migration status, local health/API docs, and local CORS allowlist smoke checks pass.
- Automated tests include inventory rules, the production simulation-mode gate, a PostgreSQL API integration test for health, registration/login, JWT identity and Customer RBAC, and PWA manifest/cache tests; CI provisions its own PostgreSQL service.
- Performance targets, multi-instance availability, a full browser E2E suite, payment-provider certification, and physical IoT acceptance are not verified by this release.

## Upgrade path to commercial operation

Select a payment provider and supply merchant sandbox credentials and webhook requirements; implement server-side payment verification, idempotency and refunds. Supply the ESP32/sensor/motor hardware contract and firmware; implement authenticated commands and device acknowledgements. Then run security review, browser and concurrency tests, backup/restore drills, and load/availability benchmarks in staging before calling the service a commercial production system.
