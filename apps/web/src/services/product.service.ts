import type {
  CreateProductInput,
  CreateProductLotInput,
  CreateProductSpecInput,
  Product,
  ProductLot,
  ProductSpec,
  SalesStatusEvent,
  UpdateProductInput,
  UpdateProductLotInput,
  UpdateProductSpecInput
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
    input: UpdateProductInput & { salesReason?: string },
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
  },

  // ── Phase 7 J-2 — specs / lots / sales-history ────────────────────

  async listSpecs(productId: string, opts: AuthOptions = {}): Promise<ProductSpec[]> {
    return apiRequest<ProductSpec[]>(
      `/products/${encodeURIComponent(productId)}/specs`,
      { token: opts.token }
    );
  },
  async createSpec(
    productId: string,
    input: CreateProductSpecInput,
    opts: AuthOptions = {}
  ): Promise<ProductSpec> {
    return apiRequest<ProductSpec>(`/products/${encodeURIComponent(productId)}/specs`, {
      method: "POST",
      body: input,
      token: opts.token
    });
  },
  async updateSpec(
    productId: string,
    specId: string,
    input: UpdateProductSpecInput,
    opts: AuthOptions = {}
  ): Promise<ProductSpec> {
    return apiRequest<ProductSpec>(
      `/products/${encodeURIComponent(productId)}/specs/${encodeURIComponent(specId)}`,
      { method: "PATCH", body: input, token: opts.token }
    );
  },
  async deleteSpec(
    productId: string,
    specId: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(
      `/products/${encodeURIComponent(productId)}/specs/${encodeURIComponent(specId)}`,
      { method: "DELETE", token: opts.token }
    );
  },

  async listLots(productId: string, opts: AuthOptions = {}): Promise<ProductLot[]> {
    return apiRequest<ProductLot[]>(
      `/products/${encodeURIComponent(productId)}/lots`,
      { token: opts.token }
    );
  },
  async createLot(
    productId: string,
    input: CreateProductLotInput,
    opts: AuthOptions = {}
  ): Promise<ProductLot> {
    return apiRequest<ProductLot>(`/products/${encodeURIComponent(productId)}/lots`, {
      method: "POST",
      body: input,
      token: opts.token
    });
  },
  async updateLot(
    productId: string,
    lotId: string,
    input: UpdateProductLotInput,
    opts: AuthOptions = {}
  ): Promise<ProductLot> {
    return apiRequest<ProductLot>(
      `/products/${encodeURIComponent(productId)}/lots/${encodeURIComponent(lotId)}`,
      { method: "PATCH", body: input, token: opts.token }
    );
  },
  async deleteLot(
    productId: string,
    lotId: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(
      `/products/${encodeURIComponent(productId)}/lots/${encodeURIComponent(lotId)}`,
      { method: "DELETE", token: opts.token }
    );
  },

  async listSalesHistory(
    productId: string,
    opts: AuthOptions = {}
  ): Promise<SalesStatusEvent[]> {
    return apiRequest<SalesStatusEvent[]>(
      `/products/${encodeURIComponent(productId)}/sales-history`,
      { token: opts.token }
    );
  }
};
