import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Receive() {

  const navigate = useNavigate();

  useEffect(() => {
    setTimeout(() => {
      navigate("/");
    }, 5000);
  }, [navigate]);

  return (
    <div className="container text-center mt-5">

      <h1>
        🍍 Vui lòng nhận trái cây
      </h1>

      <h3>
        Cảm ơn bạn đã sử dụng FreshVend
      </h3>

    </div>
  );
}

export default Receive;