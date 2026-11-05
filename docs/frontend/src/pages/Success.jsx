import { useLocation, useNavigate } from "react-router-dom";

function Success() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const transactionIds = state?.transactionIds || [];
  const deliveredIds = state?.deliveredIds || transactionIds;
  const jammedIds = state?.jammedIds || [];
  const createdAt = state?.createdAt ? new Date(state.createdAt).toLocaleString("vi-VN") : "—";

  if (!transactionIds.length) {
    return <main className="container text-center mt-5"><h1>Không tìm thấy hóa đơn</h1><button className="btn btn-success mt-3" onClick={() => navigate("/")}>Mở trang bán hàng</button></main>;
  }

  return (
    <main className="container mt-5" style={{ maxWidth: 680 }}>
      <section className="card shadow-sm p-4">
        <h1 className={jammedIds.length ? "text-warning" : "text-success"}>{jammedIds.length ? "Đơn hàng cần hỗ trợ" : "Thanh toán demo thành công"}</h1>
        <p>Thời gian: {createdAt}</p>
        <p>Tổng tiền mô phỏng: <strong>{Number(state?.total || 0).toLocaleString("vi-VN")} ₫</strong></p>
        {state?.items?.map((item) => <p key={item.columnId}>{item.name} × {item.quantity}</p>)}
        {deliveredIds.length > 0 && <div className="alert alert-success">Đã giao mô phỏng thành công {deliveredIds.length} sản phẩm.</div>}
        {jammedIds.length > 0 && <div className="alert alert-warning">{jammedIds.length} sản phẩm bị kẹt sau 2 lần thử lại mô phỏng. Vui lòng liên hệ nhân viên để đối soát/hoàn tiền; hệ thống chưa kết nối cổng hoàn tiền thật.</div>}
        <h2 className="h5 mt-2">Mã giao dịch</h2>
        <ul>{transactionIds.map((id) => <li key={id}><code>{id}</code> {jammedIds.includes(id) && <strong>· Cần xử lý</strong>}</li>)}</ul>
        <div className="d-flex gap-2 flex-wrap mt-3"><button className="btn btn-outline-success" onClick={() => window.print()}>In / lưu biên nhận</button><button className="btn btn-success" onClick={() => navigate("/")}>Tiếp tục mua hàng</button></div>
        <small className="text-secondary mt-3">Biên nhận này ghi nhận kết quả demo, không phải chứng từ thanh toán từ ngân hàng.</small>
      </section>
    </main>
  );
}

export default Success;
