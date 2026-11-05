import api from "./api";

export const getProducts = () => {
  return api.get("/products");
};

export const getAvailableCatalog = () => api.get("/products/catalog");
