import { useState, useEffect } from "react";
import { getProducts } from "../services/productService";
import { useNavigate } from "react-router-dom";
import cam from "../fruits/cam.webp";
import dau from "../fruits/dâu.jpg";
import duahau from "../fruits/dưa hấu.webp";
import dualuoi from "../fruits/dưa lưới.jpg";
import kiwi from "../fruits/kiwi.webp";
import le from "../fruits/lê.webp";
import nhomy from "../fruits/nho mỹ.webp";
import pineapple from "../fruits/pngtree-pineapple-png-image_13219356.png";
import tao from "../fruits/táo.webp";
import xoai from "../fruits/xoài.webp";
function Products() {

  const navigate = useNavigate();

  const [cartCount, setCartCount] = useState(0);
  const [cart, setCart] = useState([]);
const [search, setSearch] = useState("");
const [products, setProducts] = useState([]);
const loadProducts = async () => {

  try {

    const response = await getProducts();

    console.log(response.data);

    setProducts(response.data.data);

  } catch (error) {

    console.log(error);

  }

};
useEffect(() => {
  loadProducts();
}, []);
 const fakeProducts = [
  {
    id: 1,
    name: "🍍 Dứa Mix",
    price: 30000,
    image: pineapple,
    stock: 12,
    expiry: "30/1/2027"
  },
  {
    id: 2,
    name: "🍉 Dưa Hấu",
    price: 25000,
    image: duahau,
    stock: 15,
    expiry: "31/1/2027"
  },
  {
    id: 3,
    name: "🍇 Nho Mỹ",
    price: 40000,
    image: nhomy,
    stock: 8,
    expiry: "20/1/2027"
  },
  {
    id: 4,
    name: "🥭 Xoài Chín",
    price: 35000,
    image: xoai,
    stock: 10,
    expiry: "10/1/2027"
  },
  {
    id: 5,
    name: "🍈 Dưa Lưới",
    price: 45000,
    image: dualuoi,
    stock: 6,
    expiry: "15/1/2027"
  },
  {
    id: 6,
    name: "🍊 Cam Vàng",
    price: 30000,
    image: cam,
    stock: 18,
    expiry: "26/1/2027"
  },
  {
    id: 7,
    name: "🍎 Táo Envy",
    price: 35000,
    image: tao,
    stock: 14,
    expiry: "14/1/2027"
  },
  {
    id: 8,
    name: "🍐 Lê Hàn Quốc",
    price: 40000,
    image: le,
    stock: 9,
    expiry: "17/1/2027"
  },
  {
    id: 9,
    name: "🥝 Kiwi Xanh",
    price: 45000,
    image: kiwi,
    stock: 7,
    expiry: "30/1/2027"
  },
  {
    id: 10,
    name: "🍓 Dâu Tây",
    price: 50000,
    image: dau,
    stock: 5,
    expiry: "30/1/2027"
  }
];

  const addToCart = (product) => {
    setCart([...cart, product]);
    setCartCount(cartCount + 1);
  };

  const removeFromCart = (indexToRemove) => {

    const newCart = cart.filter(
      (_, index) => index !== indexToRemove
    );

    setCart(newCart);
    setCartCount(newCart.length);
  };

  const totalPrice = cart.reduce(
    (total, item) => total + item.price,
    0
  );

  return (
    <div className="container mt-4">

      <h1 className="text-center text-success mb-4">
        🍍 FreshVend
      </h1>

      <div className="alert alert-success">
        🛒 Đã chọn: {cartCount}
      </div>
<input
  type="text"
  className="form-control mb-3"
  placeholder="🔍 Tìm trái cây..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
/>
      <div className="row">

        {fakeProducts.filter(product =>
          product.name.toLowerCase().includes(search.toLowerCase())
        ).map(product => (

          <div
            key={product.id}
            className="col-md-6 mb-4"
          >

            <div className="card p-3 shadow h-100">

              <img
  src={product.image}
  alt={product.name}
  style={{
    width: "100%",
    height: "220px",
    objectFit: "cover",
    borderRadius: "10px"
  }}
/>

              <h4>{product.name}</h4>

              <h5 className="text-danger">
                {product.price.toLocaleString()} đ
              </h5>

              <p className="text-secondary">
                📦 Còn lại: {product.stock}
              </p>

              <button
  className="btn btn-success w-100"
  disabled={product.stock === 0}
  onClick={() => addToCart(product)}
>
  {product.stock === 0
    ? "❌ Hết hàng"
    : "🛒 Thêm vào giỏ"}
</button>

            </div>

          </div>

        ))}

      </div>

      <hr />

      <h2>
        🛒 Giỏ hàng
      </h2>

      {cart.map((item, index) => (

        <div
          key={index}
          className="d-flex justify-content-between mb-2"
        >

          <span>
            {item.name}
          </span>

          <button
            className="btn btn-danger btn-sm"
            onClick={() => removeFromCart(index)}
          >
            Xóa
          </button>

        </div>

      ))}

      <h3 className="text-primary mt-3">
        Tổng tiền:
        {" "}
        {totalPrice.toLocaleString()} đ
      </h3>

      <button
        className="btn btn-success mt-3"
        onClick={() => navigate("/payment")}
      >
        Thanh toán
      </button>

    </div>
  );
}

export default Products;