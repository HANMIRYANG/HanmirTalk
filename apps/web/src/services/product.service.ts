import type {
  CreateProductDocumentInput,
  CreateProductInput,
  CreateProductSpecInput,
  Product,
  ProductDocument,
  ProductDocumentType,
  ProductSpec,
  SalesStatusEvent,
  UpdateProductInput,
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

  // ── Phase 7 J-2 — specs / sales-history ────────────────────

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

  async listSalesHistory(
    productId: string,
    opts: AuthOptions = {}
  ): Promise<SalesStatusEvent[]> {
    return apiRequest<SalesStatusEvent[]>(
      `/products/${encodeURIComponent(productId)}/sales-history`,
      { token: opts.token }
    );
  },

  // ── Phase 7 J-2 — product documents ───────────────────────────────

  async listDocuments(
    productId: string,
    opts: AuthOptions & { type?: ProductDocumentType } = {}
  ): Promise<ProductDocument[]> {
    const query: Record<string, string> = {};
    if (opts.type) query.type = opts.type;
    return apiRequest<ProductDocument[]>(
      `/products/${encodeURIComponent(productId)}/documents`,
      { token: opts.token, query }
    );
  },
  async createDocument(
    productId: string,
    input: CreateProductDocumentInput,
    opts: AuthOptions = {}
  ): Promise<ProductDocument> {
    return apiRequest<ProductDocument>(
      `/products/${encodeURIComponent(productId)}/documents`,
      { method: "POST", body: input, token: opts.token }
    );
  },
  async deleteDocument(
    productId: string,
    docId: string,
    opts: AuthOptions = {}
  ): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>(
      `/products/${encodeURIComponent(productId)}/documents/${encodeURIComponent(docId)}`,
      { method: "DELETE", token: opts.token }
    );
  }
};
