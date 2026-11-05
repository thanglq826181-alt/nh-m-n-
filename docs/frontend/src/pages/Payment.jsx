import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../services/api";

function Payment() {
  const navigate = useNavigate();
  const location = useLocation();
  const cart = location.state?.cart || [];
  const total = location.state?.total ?? cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hasToken, setHasToken] = useState(Boolean(localStorage.getItem("freshvend-token")));
  const [dispenseScenario, setDispenseScenario] = useState("SUCCESS");
  const [progress, setProgress] = useState("");

  const startDemoCheckout = async (event) => {
    event?.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (!hasToken) {
        if (isRegister) await api.post("/auth/register", { username, password, fullName });
        const login = await api.post("/auth/login", { username, password });
        localStorage.setItem("freshvend-token", login.data.token);
        setHasToken(true);
      }

      const completed = [];
      const jammed = [];
      let confirmedTotal = 0;
      for (const item of cart) {
        for (let index = 0; index < item.quantity; index += 1) {
          setProgress(`Đang tạo giao dịch: ${item.name}…`);
          const order = await api.post("/transactions", { machineId: item.machineId, columnId: item.columnId });
          const transactionId = order.data.data.id;
          confirmedTotal += Number(order.data.data.amount);
          setProgress("Đang xác nhận thanh toán mô phỏng…");
          await api.post(`/transactions/${transactionId}/simulate-payment`, { outcome: "SUCCESS" });
          if (dispenseScenario === "JAMMED") {
            for (let attempt = 1; attempt <= 3; attempt += 1) {
              setProgress(`Mô phỏng nhả hàng · lần ${attempt}/3${attempt < 3 ? " · đang thử lại" : " · vẫn bị kẹt"}`);
              await new Promise((resolve) => window.setTimeout(resolve, 500));
            }
          } else setProgress("Đang nhả hàng mô phỏng…");
          const dispense = await api.post(`/transactions/${transactionId}/simulate-dispense`, { outcome: dispenseScenario });
          if (dispense.data.data.dispenseStatus === "JAMMED") jammed.push(transactionId);
          else completed.push(transactionId);
        }
      }
      navigate("/success", { state: { total: confirmedTotal, transactionIds: [...completed, ...jammed], deliveredIds: completed, jammedIds: jammed, items: cart, createdAt: new Date().toISOString() } });
    } catch (err) {
      setError(err.response?.data?.message || "Không thể hoàn tất giao dịch. Kiểm tra tài khoản, tồn kho và trạng thái máy.");
    } finally {
      setBusy(false);
    }
  };

  if (!cart.length) {
    return <main className="container text-center mt-5"><h2>Giỏ hàng đang trống</h2><button className="btn btn-success mt-3" onClick={() => navigate("/")}>Quay lại sản phẩm</button></main>;
  }

  return (
    <main className="container mt-4 text-center" style={{ maxWidth: 600 }}>
      <h1>💳 Thanh toán FreshVend</h1>
      <div className="alert alert-warning">QR bên dưới chỉ để minh họa. Nút tiếp tục chạy luồng thanh toán và nhả hàng giả lập trong môi trường phát triển, không thu tiền thật.</div>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=FreshVend-Demo" alt="QR minh họa" />
      <h4 className="mt-3">Số tiền: {Number(total).toLocaleString("vi-VN")} đ</h4>
      <ul className="list-group text-start mb-3">
        {cart.map((item) => <li className="list-group-item" key={item.columnId}>{item.name} × {item.quantity}</li>)}
      </ul>
      <label className="d-block text-start mb-3">Kết quả nhả hàng demo
        <select className="form-select mt-1" value={dispenseScenario} onChange={(event) => setDispenseScenario(event.target.value)}>
          <option value="SUCCESS">Nhả hàng thành công</option>
          <option value="JAMMED">Mô phỏng kẹt sau 2 lần thử lại</option>
        </select>
      </label>

      {!hasToken && <form id="checkout-form" onSubmit={startDemoCheckout} className="text-start">
        <h5>{isRegister ? "Tạo tài khoản khách hàng" : "Đăng nhập để tạo giao dịch"}</h5>
        {isRegister && <input className="form-control mb-2" placeholder="Họ tên (không bắt buộc)" value={fullName} onChange={(event) => setFullName(event.target.value)} />}
        <input className="form-control mb-2" placeholder="Tên đăng nhập" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        <input className="form-control mb-2" type="password" placeholder="Mật khẩu (tối thiểu 8 ký tự)" autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
        <button type="button" className="btn btn-link px-0" onClick={() => setIsRegister((value) => !value)}>{isRegister ? "Đã có tài khoản? Đăng nhập" : "Chưa có tài khoản? Đăng ký"}</button>
      </form>}

      {error && <div className="alert alert-danger">{error}</div>}
      {progress && <div className="alert alert-info" role="status">{progress}</div>}
      <button className="btn btn-success mt-2" disabled={busy} type={hasToken ? "button" : "submit"} form={hasToken ? undefined : "checkout-form"} onClick={hasToken ? startDemoCheckout : undefined}>
        {busy ? "Đang xử lý..." : "Xác nhận thanh toán demo & nhả hàng giả lập"}
      </button>
    </main>
  );
}

export default Payment;
