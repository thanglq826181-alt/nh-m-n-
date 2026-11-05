import { useEffect, useState } from "react";
import api from "../services/api";
import "./IoTSimulation.css";

function IoTSimulation() {
  const [machines, setMachines] = useState([]);
  const [machineId, setMachineId] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [temperature, setTemperature] = useState(5);
  const [humidity, setHumidity] = useState(65);
  const [doorOpen, setDoorOpen] = useState(false);
  const [sensorOk, setSensorOk] = useState(true);
  const [reading, setReading] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/machines").then(({ data }) => {
      const rows = data.data || [];
      setMachines(rows);
      if (rows.length) setMachineId(rows[0].id);
    }).catch((error) => setMessage(error.response?.data?.message || "Không tải được danh sách máy. Hãy đăng nhập bằng tài khoản vận hành."));
  }, []);

  const selectedMachine = machines.find((machine) => machine.id === machineId);
  const currentStatus = reading?.machineStatus || selectedMachine?.status;
  const isFault = !sensorOk || doorOpen || (temperature < (selectedMachine?.tempMin ?? 2)) || (temperature > (selectedMachine?.tempMax ?? 8));

  async function sendTelemetry(event) {
    event.preventDefault();
    if (!machineId) {
      setMessage("Hãy chọn máy trước khi gửi telemetry.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { data } = await api.post("/telemetry/temperature", {
        machineId,
        temperature: Number(temperature),
        humidity: Number(humidity),
        doorOpen,
        sensorOk,
      }, { headers: deviceKey.trim() ? { "X-Device-Key": deviceKey.trim() } : {} });
      setReading(data.data);
      setMessage("Đã gửi telemetry và cập nhật trạng thái máy.");
      const refreshed = await api.get("/machines");
      setMachines(refreshed.data.data || []);
    } catch (error) {
      setMessage(error.response?.data?.message || "Không gửi được telemetry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="iot-shell">
      <header className="iot-header">
        <div><p className="iot-eyebrow">FRESH VEND · WEB SIMULATOR</p><h1>Mô phỏng máy IoT</h1></div>
        <a href="/">Về trang bán hàng</a>
      </header>
      <div className="iot-grid">
        <section className="iot-card iot-status">
          <p className="iot-eyebrow">TRẠNG THÁI THIẾT BỊ</p>
          <h2>{selectedMachine?.machineCode || "Chưa chọn máy"}</h2>
          <span className={`iot-badge ${isFault ? "fault" : "online"}`}>{isFault ? "Cảnh báo mô phỏng" : currentStatus || "Đang tải…"}</span>
          <div className="iot-metrics">
            <div><span>Nhiệt độ</span><strong>{Number(temperature).toFixed(1)} °C</strong></div>
            <div><span>Độ ẩm</span><strong>{Number(humidity).toFixed(0)}%</strong></div>
          </div>
          <p className="iot-note">Ngưỡng của máy: {selectedMachine?.tempMin ?? 2}–{selectedMachine?.tempMax ?? 8} °C</p>
          {reading && <p className="iot-note">Đã ghi nhận lúc {new Date(reading.loggedAt).toLocaleString("vi-VN")}</p>}
        </section>

        <form className="iot-card" onSubmit={sendTelemetry}>
          <p className="iot-eyebrow">ĐIỀU KHIỂN MÔ PHỎNG</p><h2>Gửi telemetry HTTP</h2>
          <label>Máy
            <select value={machineId} onChange={(event) => { setMachineId(event.target.value); setReading(null); }}>
              {machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machineCode} · {machine.locationName}</option>)}
            </select>
          </label>
          <label>Khóa thiết bị (X-Device-Key, không bắt buộc khi đã đăng nhập nhân viên)<input type="password" autoComplete="off" value={deviceKey} onChange={(event) => setDeviceKey(event.target.value)} placeholder="Nhập khóa đã cấp cho máy (nếu có)" /></label>
          <label>Nhiệt độ <output>{Number(temperature).toFixed(1)} °C</output><input type="range" min="-2" max="15" step="0.1" value={temperature} onChange={(event) => setTemperature(event.target.value)} /></label>
          <label>Độ ẩm (%)<input type="number" min="0" max="100" value={humidity} onChange={(event) => setHumidity(event.target.value)} /></label>
          <label className="iot-check"><input type="checkbox" checked={!sensorOk} onChange={(event) => setSensorOk(!event.target.checked)} /> Giả lập cảm biến lỗi</label>
          <label className="iot-check"><input type="checkbox" checked={doorOpen} onChange={(event) => setDoorOpen(event.target.checked)} /> Giả lập cửa máy đang mở</label>
          <button disabled={busy || !machines.length}>{busy ? "Đang gửi…" : "Gửi telemetry"}</button>
          {message && <p className="iot-message" role="status">{message}</p>}
          <p className="iot-note">Dữ liệu do trình duyệt tạo. Nhân viên đã đăng nhập có thể gửi telemetry demo bằng JWT; khóa thiết bị chỉ cần khi giả lập thiết bị và không được lưu lại.</p>
        </form>
      </div>
    </main>
  );
}

export default IoTSimulation;
