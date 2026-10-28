import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Success() {

  const navigate = useNavigate();

  useEffect(() => {
    setTimeout(() => {
      navigate("/receive");
    }, 3000);
  }, [navigate]);

  return (
    <div className="container text-center mt-5">

      <h1>
        ✅ Thanh toán thành công
      </h1>

      <h3>
        Đang xuất trái cây...
      </h3>

    </div>
  );
}

export default Success;