import type {
  ProductVariant,
  CreateProductVariantInput,
  UpdateProductVariantInput,
  Warehouse,
  CreateWarehouseInput,
  UpdateWarehouseInput,
  InventoryBalance,
  InventoryTransaction,
  ProductInventorySummary,
  ErpDocument,
  ErpDocumentType,
  ErpDocumentStatus,
  CreateErpDocumentInput,
  MesProductMapping,
  CreateMesProductMappingInput,
  UpdateMesProductMappingInput,
  MesSyncRun
} from "@hanmir/shared";
import { apiRequest, apiRequestOrNull } from "./api-client";

interface AuthOptions {
  token?: string;
}

export const erpService = {
  // ── 규격 ──
  async listVariants(
    opts: AuthOptions & { productId?: string } = {}
  ): Promise<ProductVariant[]> {
    const query: Record<string, string> = {};
    if (opts.productId) query.productId = opts.productId;
    return apiRequest<ProductVariant[]>("/erp/variants", { token: opts.token, query });
  },
  async createVariant(
    productId: string,
    input: CreateProductVariantInput,
    opts: AuthOptions = {}
  ): Promise<ProductVariant> {
    return apiRequest<ProductVariant>("/erp/variants", {
      method: "POST",
      body: { ...input, productId },
      token: opts.token
    });
  },
  async updateVariant(
    id: string,
    input: UpdateProductVariantInput,
    opts: AuthOptions = {}
  ): Promise<ProductVariant> {
    return apiRequest<ProductVariant>(`/erp/variants/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
      token: opts.token
    });
  },

  // ── 창고 ──
  async listWarehouses(opts: AuthOptions = {}): Promise<Warehouse[]> {
    return apiRequest<Warehouse[]>("/erp/warehouses", { token: opts.token });
  },
  async createWarehouse(input: CreateWarehouseInput, opts: AuthOptions = {}): Promise<Warehouse> {
    return apiRequest<Warehouse>("/erp/warehouses", {
      method: "POST",
      body: input,
      token: opts.token
    });
  },
  async updateWarehouse(
    id: string,
    input: UpdateWarehouseInput,
    opts: AuthOptions = {}
  ): Promise<Warehouse> {
    return apiRequest<Warehouse>(`/erp/warehouses/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
      token: opts.token
    });
  },

  // ── 재고 ──
  async listInventory(
    opts: AuthOptions & { productId?: string; warehouseId?: string } = {}
  ): Promise<InventoryBalance[]> {
    const query: Record<string, string> = {};
    if (opts.productId) query.productId = opts.productId;
    if (opts.warehouseId) query.warehouseId = opts.warehouseId;
    return apiRequest<InventoryBalance[]>("/erp/inventory", { token: opts.token, query });
  },
  async getInventorySummary(
    productId: string,
    opts: AuthOptions = {}
  ): Promise<ProductInventorySummary | undefined> {
    return apiRequestOrNull<ProductInventorySummary>("/erp/inventory/summary", {
      token: opts.token,
      query: { productId }
    });
  },
  async listTransactions(
    opts: AuthOptions & {
      productId?: string;
      productVariantId?: string;
      warehouseId?: string;
      from?: string;
      to?: string;
      limit?: number;
    } = {}
  ): Promise<InventoryTransaction[]> {
    const { token, ...rest } = opts;
    const query: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) query[k] = v as string | number;
    }
    return apiRequest<InventoryTransaction[]>("/erp/inventory/transactions", { token, query });
  },
  async importInventory(
    rows: {
      productVariantId: string;
      warehouseId: string;
      quantity: number;
      direction?: "in" | "out" | "adjust";
      note?: string;
    }[],
    opts: AuthOptions = {}
  ): Promise<{ applied: number }> {
    return apiRequest<{ applied: number }>("/erp/inventory/import", {
      method: "POST",
      body: { rows },
      token: opts.token
    });
  },

  // ── 전표 ──
  async listDocuments(
    opts: AuthOptions & {
      from?: string;
      to?: string;
      type?: ErpDocumentType;
      customer?: string;
      status?: ErpDocumentStatus;
      limit?: number;
    } = {}
  ): Promise<ErpDocument[]> {
    const { token, ...rest } = opts;
    const query: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) query[k] = v as string | number;
    }
    return apiRequest<ErpDocument[]>("/erp/documents", { token, query });
  },
  async getDocument(id: string, opts: AuthOptions = {}): Promise<ErpDocument | undefined> {
    return apiRequestOrNull<ErpDocument>(`/erp/documents/${encodeURIComponent(id)}`, {
      token: opts.token
    });
  },
  async createDocument(
    input: CreateErpDocumentInput,
    opts: AuthOptions = {}
  ): Promise<ErpDocument> {
    return apiRequest<ErpDocument>("/erp/documents", {
      method: "POST",
      body: input,
      token: opts.token
    });
  },
  async cancelDocument(id: string, opts: AuthOptions = {}): Promise<ErpDocument> {
    return apiRequest<ErpDocument>(`/erp/documents/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      token: opts.token
    });
  },

  // ── MES 매핑(골격) ──
  async listMesMappings(
    opts: AuthOptions & { productId?: string } = {}
  ): Promise<MesProductMapping[]> {
    const query: Record<string, string> = {};
    if (opts.productId) query.productId = opts.productId;
    return apiRequest<MesProductMapping[]>("/erp/mes/mappings", { token: opts.token, query });
  },
  async createMesMapping(
    input: CreateMesProductMappingInput,
    opts: AuthOptions = {}
  ): Promise<MesProductMapping> {
    return apiRequest<MesProductMapping>("/erp/mes/mappings", {
      method: "POST",
      body: input,
      token: opts.token
    });
  },
  async updateMesMapping(
    id: string,
    input: UpdateMesProductMappingInput,
    opts: AuthOptions = {}
  ): Promise<MesProductMapping> {
    return apiRequest<MesProductMapping>(`/erp/mes/mappings/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
      token: opts.token
    });
  },
  async listMesSyncRuns(
    opts: AuthOptions & { limit?: number } = {}
  ): Promise<MesSyncRun[]> {
    const query: Record<string, number> = {};
    if (opts.limit) query.limit = opts.limit;
    return apiRequest<MesSyncRun[]>("/erp/mes/sync-runs", { token: opts.token, query });
  }
};
