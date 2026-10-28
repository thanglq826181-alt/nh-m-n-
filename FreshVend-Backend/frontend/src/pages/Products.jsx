import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAvailableCatalog } from "../services/productService";
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

const imageFor = (name) => {
  const normalized = name.toLocaleLowerCase("vi");
  if (normalized.includes("dứa") || normalized.includes("thơm") || normalized.includes("pineapple")) return pineapple;
  if (normalized.includes("dưa hấu")) return duahau;
  if (normalized.includes("nho")) return nhomy;
  if (normalized.includes("xoài")) return xoai;
  if (normalized.includes("dưa lưới")) return dualuoi;
  if (normalized.includes("cam")) return cam;
  if (normalized.includes("táo")) return tao;
  if (normalized.includes("lê")) return le;
  if (normalized.includes("kiwi")) return kiwi;
  if (normalized.includes("dâu")) return dau;
  return pineapple;
};

function Products() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getAvailableCatalog()
      .then(({ data }) => setCatalog(data.data))
      .catch((err) => setError(err.response?.data?.message || "Không kết nối được Backend. Kiểm tra server và URL API."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => catalog.filter((item) => item.name.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi"))), [catalog, search]);
  const total = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);

  const addToCart = (product) => {
    setCart((current) => {
      const existing = current.find((item) => item.columnId === product.columnId);
      if (existing) {
        if (existing.quantity >= product.availableStock) return current;
        return current.map((item) => item.columnId === product.columnId ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...current, { ...product, quantity: 1 }];
    });
  };

  const changeQuantity = (columnId, delta) => setCart((current) => current
    .map((item) => item.columnId === columnId ? { ...item, quantity: Math.min(item.availableStock, item.quantity + delta) } : item)
    .filter((item) => item.quantity > 0));

  return (
    <main className="container py-4">
      <h1 className="text-center text-success mb-4">🍍 FreshVend</h1>
      <p className="text-center text-secondary">Danh mục lấy trực tiếp từ các máy đang hoạt động</p>
      <input className="form-control mb-4" placeholder="Tìm trái cây..." value={search} onChange={(event) => setSearch(event.target.value)} />

      {loading && <div className="alert alert-info">Đang tải sản phẩm...</div>}
      {error && <div className="alert alert-danger">{error}</div>}
      {!loading && !error && catalog.length === 0 && <div className="alert alert-warning">Chưa có sản phẩm còn hàng trên máy ONLINE. Nhờ Admin bật máy, gán sản phẩm vào cột và restock hàng.</div>}

      <div className="row">
        {filtered.map((product) => (
          <div key={product.columnId} className="col-md-6 col-lg-4 mb-4">
            <article className="card p-3 shadow h-100">
              <img src={imageFor(product.name)} alt={product.name} style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 10 }} />
              <h4 className="mt-3">{product.name}</h4>
              <h5 className="text-danger">{Number(product.price).toLocaleString("vi-VN")} đ</h5>
              <p className="text-secondary mb-1">📦 Còn {product.availableStock} hộp · Máy {product.machineCode} · Cột {product.columnNumber}</p>
              {product.lowStock && <small className="text-warning mb-2">Sắp hết hàng</small>}
              {product.expiryWarning && <small className="text-danger mb-2">Có lô sắp hết hạn</small>}
              <button className="btn btn-success mt-auto" onClick={() => addToCart(product)}>Thêm vào giỏ</button>
            </article>
          </div>
        ))}
      </div>

      <section className="border rounded p-3 mt-2">
        <h2>🛒 Giỏ hàng ({cart.reduce((sum, item) => sum + item.quantity, 0)})</h2>
        {cart.map((item) => (
          <div key={item.columnId} className="d-flex align-items-center justify-content-between border-bottom py-2 gap-3">
            <span>{item.name} — {Number(item.price).toLocaleString("vi-VN")} đ</span>
            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-outline-secondary btn-sm" onClick={() => changeQuantity(item.columnId, -1)}>−</button>
              <span>{item.quantity}</span>
              <button className="btn btn-outline-secondary btn-sm" disabled={item.quantity >= item.availableStock} onClick={() => changeQuantity(item.columnId, 1)}>+</button>
            </div>
          </div>
        ))}
        <h3 className="text-primary mt-3">Tổng tiền: {total.toLocaleString("vi-VN")} đ</h3>
        <button className="btn btn-success" disabled={!cart.length} onClick={() => navigate("/payment", { state: { cart, total } })}>Tiếp tục thanh toán demo</button>
      </section>
    </main>
  );
}

export default Products;
