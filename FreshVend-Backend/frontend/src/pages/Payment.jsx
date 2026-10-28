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
      for (const item of cart) {
        for (let index = 0; index < item.quantity; index += 1) {
          const order = await api.post("/transactions", { machineId: item.machineId, columnId: item.columnId });
          const transactionId = order.data.data.id;
          await api.post(`/transactions/${transactionId}/simulate-payment`, { outcome: "SUCCESS" });
          await api.post(`/transactions/${transactionId}/simulate-dispense`, { outcome: "SUCCESS" });
          completed.push(transactionId);
        }
      }
      navigate("/success", { state: { total, transactionIds: completed } });
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

      {!hasToken && <form id="checkout-form" onSubmit={startDemoCheckout} className="text-start">
        <h5>{isRegister ? "Tạo tài khoản khách hàng" : "Đăng nhập để tạo giao dịch"}</h5>
        {isRegister && <input className="form-control mb-2" placeholder="Họ tên (không bắt buộc)" value={fullName} onChange={(event) => setFullName(event.target.value)} />}
        <input className="form-control mb-2" placeholder="Tên đăng nhập" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        <input className="form-control mb-2" type="password" placeholder="Mật khẩu (tối thiểu 8 ký tự)" autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
        <button type="button" className="btn btn-link px-0" onClick={() => setIsRegister((value) => !value)}>{isRegister ? "Đã có tài khoản? Đăng nhập" : "Chưa có tài khoản? Đăng ký"}</button>
      </form>}

      {error && <div className="alert alert-danger">{error}</div>}
      <button className="btn btn-success mt-2" disabled={busy} type={hasToken ? "button" : "submit"} form={hasToken ? undefined : "checkout-form"} onClick={hasToken ? startDemoCheckout : undefined}>
        {busy ? "Đang xử lý..." : "Xác nhận thanh toán demo & nhả hàng giả lập"}
      </button>
    </main>
  );
}

export default Payment;
