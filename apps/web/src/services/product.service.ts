import type {
  CreateProductInput,
  Product,
  UpdateProductInput
} from "@hanmir/shared";
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
  },
  async createProduct(input: CreateProductInput, opts: AuthOptions = {}): Promise<Product> {
    return apiRequest<Product>("/products", { method: "POST", body: input, token: opts.token });
  },
  async updateProduct(
    id: string,
    input: UpdateProductInput,
    opts: AuthOptions = {}
  ): Promise<Product> {
    return apiRequest<Product>(`/products/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
      token: opts.token
    });
  },
  async deleteProduct(id: string, opts: AuthOptions = {}): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(`/products/${encodeURIComponent(id)}`, {
      method: "DELETE",
      token: opts.token
    });
  }
};
