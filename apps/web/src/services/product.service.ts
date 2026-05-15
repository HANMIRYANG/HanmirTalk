import type { Product } from "@hanmir/shared";
import { apiRequest, apiRequestOrNull } from "./api-client";

interface AuthOptions {
  token?: string;
}

export const productService = {
  async listProducts(opts: AuthOptions = {}): Promise<Product[]> {
    return apiRequest<Product[]>("/products", { token: opts.token });
  },
  async getProduct(id: string, opts: AuthOptions = {}): Promise<Product | undefined> {
    return apiRequestOrNull<Product>(`/products/${encodeURIComponent(id)}`, { token: opts.token });
  }
};
