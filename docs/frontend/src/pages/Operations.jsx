import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import "./Operations.css";

const tabs = ["Tổng quan", "Máy & kho", "Nhiệt độ", "Giao dịch", "Sản phẩm", "Tài khoản"];
const money = (amount) => `${Number(amount || 0).toLocaleString("vi-VN")} ₫`;
const dateTime = (value) => value ? new Date(value).toLocaleString("vi-VN") : "—";

function Operations() {
  const [user, setUser] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [machines, setMachines] = useState([]);
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [newDeviceKey, setNewDeviceKey] = useState("");
  const [expandedMachineId, setExpandedMachineId] = useState("");
  const [machineHistory, setMachineHistory] = useState({ actions: [], restocks: [] });
  const [selectedMachine, setSelectedMachine] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [productForm, setProductForm] = useState({ name: "", price: "", shelfLifeHours: 72 });
  const [userForm, setUserForm] = useState({ username: "", password: "", fullName: "", role: "OPERATOR" });
  const isAdmin = user?.role === "ADMIN";

  const loadData = useCallback(async () => {
    const [machineResult, productResult, transactionResult, summaryResult, alertResult] = await Promise.allSettled([
      api.get("/machines"), api.get("/products"), api.get("/transactions"), isAdmin ? api.get("/operations/summary") : Promise.resolve(null), api.get("/operations/alerts"),
    ]);
    if (machineResult.status === "fulfilled") {
      const rows = machineResult.value.data.data || [];
      setMachines(rows);
      setSelectedMachine((current) => current || rows[0]?.id || "");
    }
    if (productResult.status === "fulfilled") setProducts(productResult.value.data.data || []);
    if (transactionResult.status === "fulfilled") setTransactions(transactionResult.value.data.data || []);
    if (isAdmin && summaryResult.status === "fulfilled") setSummary(summaryResult.value.data.data);
    if (!isAdmin) setSummary(null);
    if (alertResult.status === "fulfilled") setAlerts(alertResult.value.data.data || []);
    const failed = [machineResult, alertResult, ...(isAdmin ? [summaryResult] : [])].find((result) => result.status === "rejected");
    if (failed) setError(failed.reason?.response?.data?.message || "Không tải được dữ liệu vận hành. Vui lòng đăng nhập tài khoản Admin hoặc Operator.");
    else setError("");
  }, [isAdmin]);

  useEffect(() => {
    if (!localStorage.getItem("freshvend-token")) return;
    api.get("/auth/me").then(({ data }) => setUser(data.user)).catch(() => localStorage.removeItem("freshvend-token"));
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    const initialLoad = window.setTimeout(loadData, 0);
    const controller = new AbortController();
    const token = localStorage.getItem("freshvend-token");
    let retryTimer;
    const connectStream = async () => {
      while (!controller.signal.aborted) {
        try {
          const response = await fetch(`${api.defaults.baseURL}/operations/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
          if (!response.ok || !response.body) throw new Error("Telemetry stream unavailable");
          const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read(); if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\n\n"); buffer = frames.pop() || "";
            if (frames.some((frame) => /^event: (telemetry|inventory|transaction|machine)/.test(frame))) loadData();
          }
        } catch { if (controller.signal.aborted) return; }
        await new Promise((resolve) => { retryTimer = window.setTimeout(resolve, 2500); });
      }
    };
    connectStream();
    const fallback = window.setInterval(loadData, 30_000);
    return () => { controller.abort(); window.clearInterval(fallback); window.clearTimeout(retryTimer); window.clearTimeout(initialLoad); };
  }, [user, loadData]);

  useEffect(() => {
    if (!selectedMachine || !user) return;
    api.get(`/machines/${selectedMachine}/temperature-logs?limit=30`)
      .then(({ data }) => setLogs(data.data || []))
      .catch((requestError) => setError(requestError.response?.data?.message || "Không tải được lịch sử nhiệt độ."));
  }, [selectedMachine, user]);

  const login = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const { data } = await api.post("/auth/login", { username, password });
      localStorage.setItem("freshvend-token", data.token);
      setUser(data.user);
      setNotice(`Xin chào ${data.user.fullName || data.user.username}`);
      setPassword("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Đăng nhập không thành công.");
    } finally { setBusy(false); }
  };

  const logout = () => { localStorage.removeItem("freshvend-token"); setUser(null); setMachines([]); setProducts([]); setTransactions([]); setSummary(null); setAlerts([]); };

  const restock = async (machine, column) => {
    const quantity = Number(window.prompt(`Nhập số lượng restock cho cột ${column.columnNumber}:`, "5"));
    if (!Number.isInteger(quantity) || quantity < 1) return;
    setBusy(true); setError("");
    try {
      await api.post(`/machines/${machine.id}/columns/${column.id}/restock`, { quantity });
      setNotice(`Đã restock ${quantity} phần vào ${machine.machineCode}, cột ${column.columnNumber}.`);
      await loadData();
    } catch (requestError) { setError(requestError.response?.data?.message || "Restock không thành công."); }
    finally { setBusy(false); }
  };

  const removeExpiredInventory = async (machine, column) => {
    const remaining = column.batches
      .filter((batch) => batch.quantity > 0 && (!batch.expiryDate || new Date(batch.expiryDate) > new Date()))
      .sort((a, b) => (a.expiryDate ? new Date(a.expiryDate).getTime() : Number.MAX_SAFE_INTEGER) - (b.expiryDate ? new Date(b.expiryDate).getTime() : Number.MAX_SAFE_INTEGER))[0];
    try {
      await api.put(`/machines/${machine.id}/columns/${column.id}/inventory`, {
        currentStock: column.availableStock,
        expiryDate: remaining?.expiryDate || null,
      });
      setNotice("Đã loại các lô hết hạn khỏi tồn kho; số lượng còn hạn được giữ lại.");
      await loadData();
    } catch (requestError) { setError(requestError.response?.data?.message || "Không cập nhật được kiểm kê."); }
  };

  const clearFault = async (machine) => {
    setBusy(true); setError("");
    try {
      await api.post(`/machines/${machine.id}/clear-fault`);
      setNotice(`Đã xóa lỗi cho máy ${machine.machineCode}; thao tác đã được ghi nhật ký.`);
      await loadData();
    } catch (requestError) { setError(requestError.response?.data?.message || "Chưa thể xóa lỗi máy."); }
    finally { setBusy(false); }
  };

  const rotateDeviceKey = async (machine) => {
    if (!window.confirm(`Tạo khóa mới cho ${machine.machineCode}? Khóa hiện tại sẽ hết hiệu lực.`)) return;
    setBusy(true); setError(""); setNewDeviceKey("");
    try {
      const { data } = await api.post(`/machines/${machine.id}/device-key/rotate`);
      setNewDeviceKey(`${machine.machineCode}: ${data.data.deviceKey}`);
      setNotice("Khóa chỉ hiển thị lần này. Hãy sao chép vào cấu hình thiết bị an toàn.");
    } catch (requestError) { setError(requestError.response?.data?.message || "Không tạo được khóa thiết bị."); }
    finally { setBusy(false); }
  };

  const toggleMachineHistory = async (machine) => {
    if (expandedMachineId === machine.id) { setExpandedMachineId(""); return; }
    setExpandedMachineId(machine.id);
    try {
      const [actions, restocks] = await Promise.all([
        api.get(`/machines/${machine.id}/actions?limit=20`), api.get(`/machines/${machine.id}/restock-events?limit=20`),
      ]);
      setMachineHistory({ actions: actions.data.data || [], restocks: restocks.data.data || [] });
    } catch (requestError) { setError(requestError.response?.data?.message || "Không tải được nhật ký máy."); }
  };

  const configureTemperatureRange = async (machine) => {
    const minimum = window.prompt(`Ngưỡng thấp cho ${machine.machineCode} (°C):`, String(machine.tempMin));
    if (minimum === null) return;
    const maximum = window.prompt(`Ngưỡng cao cho ${machine.machineCode} (°C):`, String(machine.tempMax));
    if (maximum === null) return;
    const tempMin = Number(minimum); const tempMax = Number(maximum);
    if (!Number.isFinite(tempMin) || !Number.isFinite(tempMax) || tempMin >= tempMax) { setError("Ngưỡng nhiệt độ không hợp lệ."); return; }
    try { await api.patch(`/machines/${machine.id}`, { tempMin, tempMax }); setNotice("Đã cập nhật ngưỡng nhiệt độ."); await loadData(); }
    catch (requestError) { setError(requestError.response?.data?.message || "Không cập nhật được ngưỡng nhiệt độ."); }
  };

  const saveProduct = async (event, productId) => {
    event.preventDefault(); setBusy(true); setError("");
    const data = { ...productForm, price: Number(productForm.price), shelfLifeHours: Number(productForm.shelfLifeHours) };
    try {
      if (productId) await api.put(`/products/${productId}`, data);
      else await api.post("/products", data);
      setNotice(productId ? "Đã cập nhật sản phẩm." : "Đã thêm sản phẩm.");
      setProductForm({ name: "", price: "", shelfLifeHours: 72 });
      await loadData();
    } catch (requestError) { setError(requestError.response?.data?.message || "Không lưu được sản phẩm."); }
    finally { setBusy(false); }
  };

  const loadUsers = async () => {
    try { const { data } = await api.get("/users?limit=100"); setUsers(data.data || []); }
    catch (requestError) { setError(requestError.response?.data?.message || "Không tải được danh sách tài khoản."); }
  };

  useEffect(() => {
    if (!isAdmin || activeTab !== "Tài khoản") return undefined;
    const timer = window.setTimeout(loadUsers, 0);
    return () => window.clearTimeout(timer);
  }, [isAdmin, activeTab]);

  const createUser = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api.post("/users", userForm);
      setUserForm({ username: "", password: "", fullName: "", role: "OPERATOR" });
      setNotice("Đã tạo tài khoản nhân viên."); await loadUsers();
    } catch (requestError) { setError(requestError.response?.data?.message || "Không tạo được tài khoản."); }
    finally { setBusy(false); }
  };

  const downloadCsv = async () => {
    try {
      const { data } = await api.get("/operations/sales.csv", { responseType: "blob" });
      const url = URL.createObjectURL(data); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "freshvend-sales.csv"; anchor.click(); URL.revokeObjectURL(url);
    } catch (requestError) { setError(requestError.response?.data?.message || "Không xuất được báo cáo."); }
  };

  const chartMax = useMemo(() => Math.max(1, ...(summary?.peakHours || []).map((point) => point.transactions)), [summary]);
  const fleetStats = summary?.machines || machines.reduce((stats, machine) => ({ ...stats, total: stats.total + 1, online: stats.online + Number(machine.status === "ONLINE"), offline: stats.offline + Number(machine.status === "OFFLINE"), fault: stats.fault + Number(machine.status === "FAULT") }), { total: 0, online: 0, offline: 0, fault: 0 });
  const stockStats = summary?.inventory || machines.reduce((stats, machine) => machine.columns.reduce((columnStats, column) => ({
    lowStockColumns: columnStats.lowStockColumns + Number(column.lowStock),
    outOfStockColumns: columnStats.outOfStockColumns + Number(column.outOfStock),
    expiringColumns: columnStats.expiringColumns + Number(column.expiryWarning),
  }), stats), { lowStockColumns: 0, outOfStockColumns: 0, expiringColumns: 0 });

  if (!user) return (
    <main className="ops-login-wrap">
      <form className="ops-login" onSubmit={login}>
        <p className="ops-kicker">FRESHVEND · OPERATIONS</p><h1>Đăng nhập vận hành</h1>
        <p>Portal dành cho Admin và nhân viên vận hành máy.</p>
        <label>Tên đăng nhập<input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
        <label>Mật khẩu<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="ops-error">{error}</p>}
        <button disabled={busy}>{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
        <a href="/">← Trở về trang bán hàng</a>
      </form>
    </main>
  );

  if (user.role === "CUSTOMER") return (
    <main className="ops-login-wrap">
      <section className="ops-login">
        <p className="ops-kicker">FRESHVEND · OPERATIONS</p>
        <h1>Không có quyền truy cập</h1>
        <p>Tài khoản khách hàng không được phép vào trung tâm vận hành.</p>
        <div className="ops-actions"><a href="/">Trang bán hàng</a><button onClick={logout}>Đăng xuất</button></div>
      </section>
    </main>
  );

  return (
    <main className="ops-shell">
      <header className="ops-topbar"><div><p className="ops-kicker">FRESHVEND · MANAGEMENT</p><h1>Trung tâm vận hành</h1><span>{user.fullName || user.username} · {user.role}</span></div><div className="ops-head-actions"><span className="ops-live"><i /> Telemetry trực tiếp · dự phòng 30 giây</span><a href="/">Trang bán hàng</a><button className="ops-quiet" onClick={logout}>Đăng xuất</button></div></header>
      <nav className="ops-tabs">{tabs.filter((tab) => tab !== "Tài khoản" || isAdmin).map((tab) => <button className={activeTab === tab ? "active" : ""} key={tab} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>
      {notice && <div className="ops-notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
      {error && <div className="ops-error-banner" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
      {newDeviceKey && <div className="ops-notice ops-device-key"><span><strong>Khóa thiết bị mới (chỉ hiện một lần):</strong> <code>{newDeviceKey}</code></span><button onClick={() => navigator.clipboard?.writeText(newDeviceKey).then(() => setNotice("Đã sao chép khóa thiết bị."))}>Sao chép</button><button onClick={() => setNewDeviceKey("")}>Ẩn</button></div>}

      {activeTab === "Tổng quan" && <section className="ops-section">
        <div className="ops-section-head"><div><h2>Tình hình hoạt động</h2><p>Số liệu bán hàng trong 30 ngày gần nhất; trang tự làm mới mỗi 5 giây.</p></div>{isAdmin && <div className="ops-actions"><button onClick={downloadCsv}>Xuất CSV</button><button className="ops-secondary" onClick={() => window.print()}>In / lưu PDF</button></div>}</div>
        <div className="ops-stats">
          {isAdmin && <article><span>Doanh thu đã giao</span><strong>{money(summary?.transactions.revenue)}</strong><small>{summary?.transactions.delivered ?? 0} đơn giao thành công</small></article>}
          <article><span>Máy đang online</span><strong>{fleetStats.online}<small> / {fleetStats.total}</small></strong><small>{fleetStats.fault} lỗi · {fleetStats.offline} offline</small></article>
          <article><span>Cảnh báo đang mở</span><strong>{alerts.length}</strong><small>{alerts.filter((alert) => alert.severity === "critical").length} mức nghiêm trọng</small></article>
          <article><span>Tồn kho cần chú ý</span><strong>{stockStats.lowStockColumns + stockStats.outOfStockColumns}</strong><small>{stockStats.expiringColumns} cột có lô sắp hết hạn</small></article>
        </div>
        <div className="ops-two-col">
          <article className="ops-panel"><h3>Cảnh báo vận hành</h3>{alerts.length ? <ul className="ops-alert-list">{alerts.slice(0, 12).map((alert) => <li key={alert.id} className={alert.severity}><span>{alert.severity === "critical" ? "●" : "▲"}</span><div><strong>{alert.machineCode}</strong><p>{alert.message}</p></div></li>)}</ul> : <p className="ops-empty">Không có cảnh báo hiện tại.</p>}</article>
          {isAdmin && <article className="ops-panel"><h3>Giờ cao điểm</h3><div className="ops-hours">{(summary?.peakHours || []).map((point) => <div key={point.hour} title={`${point.transactions} giao dịch`}><span style={{ height: `${Math.max(3, point.transactions / chartMax * 100)}%` }} /><small>{String(point.hour).padStart(2, "0")}</small></div>)}</div><p className="ops-muted">Giao dịch đã thanh toán và giao hàng thành công.</p></article>}
        </div>
        {isAdmin && <article className="ops-panel"><h3>Sản phẩm bán tốt</h3>{summary?.topProducts?.length ? <div className="ops-table-wrap"><table><thead><tr><th>Sản phẩm</th><th>Máy</th><th>Đã bán</th><th>Doanh thu</th></tr></thead><tbody>{summary.topProducts.map((item, index) => <tr key={`${item.machineCode}-${item.name}-${index}`}><td>{item.name}</td><td>{item.machineCode}</td><td>{item.units}</td><td>{money(item.revenue)}</td></tr>)}</tbody></table></div> : <p className="ops-empty">Chưa có giao dịch hoàn tất trong khoảng thời gian này.</p>}</article>}
      </section>}

      {activeTab === "Máy & kho" && <section className="ops-section"><div className="ops-section-head"><div><h2>Máy bán hàng và tồn kho</h2><p>Quản lý restock; lô mới dùng hạn bảo quản cấu hình trên sản phẩm.</p></div></div>
        {machines.map((machine) => <article className="ops-machine" key={machine.id}><header><div><h3>{machine.machineCode}</h3><p>{machine.locationName} · ngưỡng {machine.tempMin}–{machine.tempMax} °C</p></div><span className={`ops-status ${machine.status.toLowerCase()}`}>{machine.status}</span><button className="ops-small" onClick={() => toggleMachineHistory(machine)}>Nhật ký</button>{isAdmin && <button className="ops-small" onClick={() => configureTemperatureRange(machine)}>Ngưỡng nhiệt độ</button>}{isAdmin && <button disabled={busy} onClick={() => rotateDeviceKey(machine)}>Đổi khóa IoT</button>}{machine.status === "FAULT" && <button disabled={busy} onClick={() => clearFault(machine)}>Xóa lỗi an toàn</button>}</header>
          <div className="ops-table-wrap"><table><thead><tr><th>Cột</th><th>Sản phẩm</th><th>Tồn</th><th>Sức chứa</th><th>Hạn gần nhất</th><th>Thao tác</th></tr></thead><tbody>{machine.columns.map((column) => <tr key={column.id}><td>{column.columnNumber}</td><td>{isAdmin ? <select aria-label={`Sản phẩm cột ${column.columnNumber}`} value={column.productId || ""} disabled={column.currentStock > 0} onChange={async (event) => { try { await api.patch(`/machines/${machine.id}/columns/${column.id}`, { productId: event.target.value || null }); await loadData(); setNotice("Đã cập nhật gán sản phẩm cho cột."); } catch (requestError) { setError(requestError.response?.data?.message || "Không đổi được sản phẩm trong cột."); } }}><option value="">Chưa gán</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select> : column.product?.name || "Chưa gán"}</td><td>{column.availableStock}{column.expiredStock ? ` (+${column.expiredStock} hết hạn)` : ""}</td><td>{column.maxCapacity}</td><td>{dateTime(column.expiryDate)}</td><td><div className="d-flex gap-1">{column.product && <button className="ops-small" disabled={busy || column.currentStock >= column.maxCapacity} onClick={() => restock(machine, column)}>Restock</button>}{column.expiredStock > 0 && <button className="ops-small" disabled={busy} onClick={() => removeExpiredInventory(machine, column)}>Loại hàng hết hạn</button>}</div></td></tr>)}</tbody></table></div>
          {expandedMachineId === machine.id && <div className="ops-history"><h4>Thao tác nhân viên</h4>{machineHistory.actions.map((action) => <p key={action.id}>{dateTime(action.createdAt)} · {action.action} · {action.operator?.fullName || action.operator?.username || "nhân viên"}</p>)}{!machineHistory.actions.length && <p>Chưa có thao tác xóa lỗi.</p>}<h4>Restock gần đây</h4>{machineHistory.restocks.map((event) => <p key={event.id}>{dateTime(event.createdAt)} · Cột {event.column.columnNumber}: +{event.quantity} (tồn {event.previousStock} → {event.newStock}) · {event.operator?.fullName || event.operator?.username || "nhân viên"}</p>)}{!machineHistory.restocks.length && <p>Chưa có bản ghi restock.</p>}</div>}
        </article>)}
      </section>}

      {activeTab === "Nhiệt độ" && <section className="ops-section"><div className="ops-section-head"><div><h2>Chuỗi lạnh và cảm biến</h2><p>Lịch sử telemetry được lưu từ thiết bị hoặc trang mô phỏng IoT.</p></div><select value={selectedMachine} onChange={(event) => setSelectedMachine(event.target.value)}>{machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.machineCode}</option>)}</select></div>
        <div className="ops-stats ops-stats-compact">{(() => { const machine = machines.find((entry) => entry.id === selectedMachine); const latest = logs[0]; return <><article><span>Trạng thái</span><strong>{machine?.status || "—"}</strong></article><article><span>Nhiệt độ gần nhất</span><strong>{latest ? `${latest.temperature.toFixed(1)} °C` : "—"}</strong></article><article><span>Cửa</span><strong>{latest ? latest.doorOpen ? "Đang mở" : "Đã đóng" : "—"}</strong></article><article><span>Cảm biến</span><strong>{latest ? latest.sensorOk ? "Bình thường" : "Lỗi" : "—"}</strong></article></>; })()}</div>
        <article className="ops-panel"><h3>30 lần đo gần nhất</h3><div className="ops-table-wrap"><table><thead><tr><th>Thời gian</th><th>Nhiệt độ</th><th>Độ ẩm</th><th>Cửa</th><th>Cảm biến</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{dateTime(log.loggedAt)}</td><td>{log.temperature.toFixed(1)} °C</td><td>{log.humidity == null ? "—" : `${log.humidity}%`}</td><td>{log.doorOpen ? "Mở" : "Đóng"}</td><td>{log.sensorOk ? "Tốt" : "Lỗi"}</td></tr>)}</tbody></table>{!logs.length && <p className="ops-empty">Chưa có dữ liệu telemetry.</p>}</div></article>
      </section>}

      {activeTab === "Giao dịch" && <section className="ops-section"><div className="ops-section-head"><div><h2>Lịch sử giao dịch</h2><p>Giao dịch gần nhất toàn hệ thống.</p></div>{isAdmin && <button onClick={downloadCsv}>Xuất CSV</button>}</div><article className="ops-panel"><div className="ops-table-wrap"><table><thead><tr><th>Mã</th><th>Thời gian</th><th>Khách hàng</th><th>Sản phẩm</th><th>Máy</th><th>Thanh toán</th><th>Nhả hàng</th>{isAdmin && <th>Tiền</th>}</tr></thead><tbody>{transactions.slice(0, 200).map((transaction) => <tr key={transaction.id}><td>{transaction.transactionCode}</td><td>{dateTime(transaction.createdAt)}</td><td>{transaction.customer?.username || "Khách lẻ"}</td><td>{transaction.column?.product?.name || "—"}</td><td>{transaction.machine?.machineCode || "—"}</td><td><span className={`ops-status ${transaction.paymentStatus.toLowerCase()}`}>{transaction.paymentStatus}</span></td><td><span className={`ops-status ${transaction.dispenseStatus.toLowerCase()}`}>{transaction.dispenseStatus}</span></td>{isAdmin && <td>{money(transaction.amount)}</td>}</tr>)}</tbody></table>{!transactions.length && <p className="ops-empty">Chưa có giao dịch.</p>}</div></article></section>}

      {activeTab === "Sản phẩm" && <section className="ops-section"><div className="ops-section-head"><div><h2>Danh mục sản phẩm</h2><p>Thay đổi giá và hạn bảo quản có hiệu lực khi tạo lô restock tiếp theo.</p></div></div>
        {isAdmin && <form className="ops-form-row" onSubmit={(event) => saveProduct(event)}><input placeholder="Tên sản phẩm" value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} required /><input type="number" min="1" step="1000" placeholder="Giá (₫)" value={productForm.price} onChange={(event) => setProductForm({ ...productForm, price: event.target.value })} required /><input type="number" min="1" placeholder="Hạn bảo quản (giờ)" value={productForm.shelfLifeHours} onChange={(event) => setProductForm({ ...productForm, shelfLifeHours: event.target.value })} required /><button disabled={busy}>Thêm sản phẩm</button></form>}
        <article className="ops-panel"><div className="ops-table-wrap"><table><thead><tr><th>Sản phẩm</th><th>Giá</th><th>Hạn bảo quản</th><th>Cập nhật</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><input aria-label={`Tên ${product.name}`} disabled={!isAdmin} defaultValue={product.name} onBlur={(event) => { if (event.target.value !== product.name) api.put(`/products/${product.id}`, { name: event.target.value }).then(loadData).catch((requestError) => setError(requestError.response?.data?.message || "Không cập nhật được tên sản phẩm.")); }} /></td><td><input aria-label={`Giá ${product.name}`} disabled={!isAdmin} type="number" defaultValue={Number(product.price)} onBlur={(event) => { const price = Number(event.target.value); if (price && price !== Number(product.price)) api.put(`/products/${product.id}`, { price }).then(loadData).catch((requestError) => setError(requestError.response?.data?.message || "Không cập nhật được giá.")); }} /></td><td>{product.shelfLifeHours} giờ</td><td>{isAdmin ? "Lưu tự động khi rời ô" : "Chỉ Admin cập nhật"}</td></tr>)}</tbody></table></div></article>
      </section>}

      {activeTab === "Tài khoản" && isAdmin && <section className="ops-section"><div className="ops-section-head"><div><h2>Tài khoản và phân quyền</h2><p>Admin quản lý vai trò theo nguyên tắc ít quyền cần thiết.</p></div></div>
        <form className="ops-form-row" onSubmit={createUser}><input placeholder="Tên đăng nhập" minLength="3" maxLength="50" value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} required /><input type="password" placeholder="Mật khẩu (8 ký tự trở lên)" minLength="8" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} required /><input placeholder="Họ tên" value={userForm.fullName} onChange={(event) => setUserForm({ ...userForm, fullName: event.target.value })} /><select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })}><option value="OPERATOR">Operator</option><option value="ADMIN">Admin</option><option value="CUSTOMER">Customer</option></select><button disabled={busy}>Tạo tài khoản</button></form>
        <article className="ops-panel"><div className="ops-table-wrap"><table><thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Vai trò</th><th>Tạo lúc</th></tr></thead><tbody>{users.map((account) => <tr key={account.id}><td>{account.username}</td><td>{account.fullName || "—"}</td><td><select value={account.role} onChange={async (event) => { try { await api.patch(`/users/${account.id}/role`, { role: event.target.value }); await loadUsers(); setNotice("Đã cập nhật vai trò."); } catch (requestError) { setError(requestError.response?.data?.message || "Không đổi được vai trò."); } }}><option>ADMIN</option><option>OPERATOR</option><option>CUSTOMER</option></select></td><td>{dateTime(account.createdAt)}</td></tr>)}</tbody></table></div></article>
      </section>}
      <footer className="ops-footer">Telemetry được đẩy qua event stream bảo mật; giao diện có REST polling dự phòng. Trạng thái sức khỏe thiết bị được quyết định từ phép đo mới nhất.</footer>
    </main>
  );
}

export default Operations;
