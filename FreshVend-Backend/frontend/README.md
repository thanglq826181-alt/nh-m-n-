# FreshVend Frontend integration

This React/Vite app consumes the FreshVend Backend API.

## Run locally

1. Start the backend from the repository root (`npm run dev`).
2. In this directory, copy `.env.example` to `.env` and set `VITE_API_BASE_URL`.
   - Same computer: `http://localhost:5000/api/v1`
   - Another computer on the same LAN: `http://<backend-lan-ip>:5000/api/v1`
3. Install and run the frontend:

   ```sh
   npm ci
   npm run dev -- --host 0.0.0.0
   ```

Vite normally opens at `http://localhost:5173`. The backend catalog only returns stock from ONLINE machines with assigned products and unexpired inventory. If it is empty, an Admin must set a machine ONLINE, assign products to columns, and restock them.

The payment page registers/logs in a customer, creates one backend transaction per selected unit, then calls development-only simulated payment and dispense routes. The QR is illustrative; no money is collected. A real payment provider and device dispense callback are not integrated.
