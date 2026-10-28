import { useNavigate } from "react-router-dom";

function Payment() {

  const navigate = useNavigate();

  return (
    <div className="container mt-4 text-center">

      <h1>💳 Thanh toán</h1>

      <h3>Vui lòng quét mã QR</h3>

      <img
        src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=FreshVend"
        alt="QR Code"
      />

      <h4 className="mt-3">
        Số tiền: 65.000 đ
      </h4>

      <button
        className="btn btn-success mt-3"
        onClick={() => navigate("/success")}
      >
        Tôi đã thanh toán
      </button>

    </div>
  );
}

export default Payment;