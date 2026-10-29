import { Routes, Route } from "react-router-dom";

import Products from "./pages/Products";
import Payment from "./pages/Payment";
import Success from "./pages/Success";
import Receive from "./pages/Receive";

function App() {
  return (
    <Routes>

      <Route
        path="/"
        element={<Products />}
      />

      <Route
        path="/payment"
        element={<Payment />}
      />

      <Route
        path="/success"
        element={<Success />}
      />

      <Route
        path="/receive"
        element={<Receive />}
      />

    </Routes>
  );
}

export default App;