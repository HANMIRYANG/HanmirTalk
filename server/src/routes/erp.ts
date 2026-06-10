import { Router, type Response } from "express";
import type {
  CreateProductVariantInput,
  UpdateProductVariantInput,
  CreateWarehouseInput,
  UpdateWarehouseInput,
  InventoryDirection,
  CreateErpDocumentInput,
  CreateErpDocumentLineInput,
  ErpDocumentType,
  ErpDocumentStatus,
  ErpDocumentQuery
} from "@hanmir/shared";
import type { Repositories, InventoryAdjustmentRow } from "../repositories/types";
import { requireRole } from "../auth/middleware";
import { auditLog } from "../audit";

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// Phase 12 — ERP 재고/전표 라우터.
//   읽기(재고/규격/창고 조회): 인증 사용자 전체.
//   쓰기(규격/창고 관리, 초기 재고): admin / super_admin.
// 전표 저장/취소는 slice 3 에서 추가.
export function createErpRouter(repos: Repositories): Router {
  const router = Router();
  const admins = requireRole("admin", "super_admin");

  // ── 규격(product_variants) ──
  // GET /erp/variants?productId= — 미지정 시 전체.
  router.get("/variants", async (req, res) => {
    const productId = isString(req.query.productId) ? req.query.productId : undefined;
    const variants = productId
      ? await repos.erp.listVariants(productId)
      : await repos.erp.listAllVariants();
    res.json(variants);
  });

  router.post("/variants", admins, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isString(b.productId) || !b.productId.trim()) {
      res.status(400).json({ error: "productId_required" });
      return;
    }
    if (!isString(b.code) || !b.code.trim()) {
      res.status(400).json({ error: "code_required" });
      return;
    }
    if (!isString(b.name) || !b.name.trim()) {
      res.status(400).json({ error: "name_required" });
      return;
    }
    if (!isString(b.unitLabel) || !b.unitLabel.trim()) {
      res.status(400).json({ error: "unitLabel_required" });
      return;
    }
    if (b.kgPerUnit !== undefined && !isFiniteNumber(b.kgPerUnit)) {
      res.status(400).json({ error: "kgPerUnit_invalid" });
      return;
    }
    const product = await repos.products.findById(b.productId);
    if (!product) {
      res.status(404).json({ error: "product_not_found" });
      return;
    }
    const input: CreateProductVariantInput = {
      code: b.code.trim(),
      name: b.name.trim(),
      unitLabel: b.unitLabel.trim(),
      kgPerUnit: isFiniteNumber(b.kgPerUnit) ? b.kgPerUnit : undefined,
      sortOrder: isFiniteNumber(b.sortOrder) ? b.sortOrder : undefined,
      isActive: typeof b.isActive === "boolean" ? b.isActive : undefined
    };
    const variant = await repos.erp.createVariant(b.productId, input);
    await auditLog(repos, req, {
      action: "erp.variant.create",
      targetType: "product_variant",
      targetId: variant.id,
      targetLabel: `${product.name} / ${variant.name}`,
      meta: { productId: b.productId, code: variant.code, kgPerUnit: variant.kgPerUnit }
    });
    res.status(201).json(variant);
  });

  router.patch("/variants/:id", admins, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (b.kgPerUnit !== undefined && !isFiniteNumber(b.kgPerUnit)) {
      res.status(400).json({ error: "kgPerUnit_invalid" });
      return;
    }
    const input: UpdateProductVariantInput = {
      code: isString(b.code) ? b.code : undefined,
      name: isString(b.name) ? b.name : undefined,
      unitLabel: isString(b.unitLabel) ? b.unitLabel : undefined,
      kgPerUnit: isFiniteNumber(b.kgPerUnit) ? b.kgPerUnit : undefined,
      sortOrder: isFiniteNumber(b.sortOrder) ? b.sortOrder : undefined,
      isActive: typeof b.isActive === "boolean" ? b.isActive : undefined
    };
    const updated = await repos.erp.updateVariant(req.params.id, input);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "erp.variant.update",
      targetType: "product_variant",
      targetId: updated.id,
      targetLabel: updated.name,
      meta: input
    });
    res.json(updated);
  });

  // ── 창고(warehouses) ──
  router.get("/warehouses", async (_req, res) => {
    res.json(await repos.erp.listWarehouses());
  });

  router.post("/warehouses", admins, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isString(b.code) || !b.code.trim()) {
      res.status(400).json({ error: "code_required" });
      return;
    }
    if (!isString(b.name) || !b.name.trim()) {
      res.status(400).json({ error: "name_required" });
      return;
    }
    const input: CreateWarehouseInput = {
      code: b.code.trim(),
      name: b.name.trim(),
      isActive: typeof b.isActive === "boolean" ? b.isActive : undefined
    };
    const warehouse = await repos.erp.createWarehouse(input);
    await auditLog(repos, req, {
      action: "erp.warehouse.create",
      targetType: "warehouse",
      targetId: warehouse.id,
      targetLabel: warehouse.name,
      meta: { code: warehouse.code }
    });
    res.status(201).json(warehouse);
  });

  router.patch("/warehouses/:id", admins, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const input: UpdateWarehouseInput = {
      code: isString(b.code) ? b.code : undefined,
      name: isString(b.name) ? b.name : undefined,
      isActive: typeof b.isActive === "boolean" ? b.isActive : undefined
    };
    const updated = await repos.erp.updateWarehouse(req.params.id, input);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "erp.warehouse.update",
      targetType: "warehouse",
      targetId: updated.id,
      targetLabel: updated.name,
      meta: input
    });
    res.json(updated);
  });

  // ── 재고(inventory) ──
  // GET /erp/inventory?productId=&warehouseId= — 규격×창고 현재고.
  router.get("/inventory", async (req, res) => {
    const productId = isString(req.query.productId) ? req.query.productId : undefined;
    const warehouseId = isString(req.query.warehouseId) ? req.query.warehouseId : undefined;
    res.json(await repos.erp.listInventory({ productId, warehouseId }));
  });

  // GET /erp/inventory/summary?productId= — 제품 단위 규격별 + 총 kg 요약.
  router.get("/inventory/summary", async (req, res) => {
    const productId = isString(req.query.productId) ? req.query.productId : undefined;
    if (!productId) {
      res.status(400).json({ error: "productId_required" });
      return;
    }
    res.json(await repos.erp.getProductInventorySummary(productId));
  });

  // GET /erp/inventory/transactions?productId=&productVariantId=&warehouseId=&from=&to=&limit=
  router.get("/inventory/transactions", async (req, res) => {
    const q = req.query;
    const limit = isString(q.limit) ? Number(q.limit) : undefined;
    res.json(
      await repos.erp.listTransactions({
        productId: isString(q.productId) ? q.productId : undefined,
        productVariantId: isString(q.productVariantId) ? q.productVariantId : undefined,
        warehouseId: isString(q.warehouseId) ? q.warehouseId : undefined,
        from: isString(q.from) ? q.from : undefined,
        to: isString(q.to) ? q.to : undefined,
        limit: Number.isFinite(limit) ? limit : undefined
      })
    );
  });

  // POST /erp/inventory/import — 관리자 초기 재고/조정 일괄 등록.
  router.post("/inventory/import", admins, async (req, res) => {
    const me = req.currentUser!;
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!Array.isArray(b.rows) || b.rows.length === 0) {
      res.status(400).json({ error: "rows_required" });
      return;
    }
    const rows: InventoryAdjustmentRow[] = [];
    for (const raw of b.rows as Record<string, unknown>[]) {
      if (!isString(raw.productVariantId) || !isString(raw.warehouseId)) {
        res.status(400).json({ error: "row_invalid" });
        return;
      }
      if (!isFiniteNumber(raw.quantity)) {
        res.status(400).json({ error: "quantity_invalid" });
        return;
      }
      const direction: InventoryDirection | undefined =
        raw.direction === "in" || raw.direction === "out" || raw.direction === "adjust"
          ? raw.direction
          : undefined;
      rows.push({
        productVariantId: raw.productVariantId,
        warehouseId: raw.warehouseId,
        quantity: raw.quantity,
        direction,
        note: isString(raw.note) ? raw.note : undefined
      });
    }
    const result = await repos.erp.importInventory(rows, { id: me.id });
    await auditLog(repos, req, {
      action: "erp.inventory.import",
      targetType: "inventory",
      targetId: me.id,
      targetLabel: `초기재고 ${result.applied}건`,
      meta: { applied: result.applied }
    });
    res.json(result);
  });

  // ── 전표(erp_documents) ──
  // GET /erp/documents?from=&to=&type=&customer=&status=&limit=
  router.get("/documents", async (req, res) => {
    const q = req.query;
    const type =
      q.type === "sale" || q.type === "use" ? (q.type as ErpDocumentType) : undefined;
    const status =
      q.status === "active" || q.status === "cancelled"
        ? (q.status as ErpDocumentStatus)
        : undefined;
    const limit = isString(q.limit) ? Number(q.limit) : undefined;
    const query: ErpDocumentQuery = {
      from: isString(q.from) ? q.from : undefined,
      to: isString(q.to) ? q.to : undefined,
      type,
      status,
      customer: isString(q.customer) ? q.customer : undefined,
      limit: Number.isFinite(limit) ? limit : undefined
    };
    res.json(await repos.erp.listDocuments(query));
  });

  router.get("/documents/:id", async (req, res) => {
    const doc = await repos.erp.findDocumentById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(doc);
  });

  // POST /erp/documents — 전표 저장 + 즉시 재고 차감(단일 트랜잭션).
  // 재고 부족 시 일반 사용자는 409 차단, admin/super_admin 은 allowNegative
  // 로 음수 재고를 허용해 저장 가능(Phase 12-H 결정).
  router.post("/documents", async (req, res) => {
    const me = req.currentUser!;
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isString(b.documentDate) || !b.documentDate.trim()) {
      res.status(400).json({ error: "documentDate_required" });
      return;
    }
    if (!Array.isArray(b.lines) || b.lines.length === 0) {
      res.status(400).json({ error: "lines_required" });
      return;
    }
    const lines: CreateErpDocumentLineInput[] = [];
    for (const raw of b.lines as Record<string, unknown>[]) {
      if (!isFiniteNumber(raw.quantity)) {
        res.status(400).json({ error: "line_quantity_invalid" });
        return;
      }
      if (raw.unitPrice !== undefined && !isFiniteNumber(raw.unitPrice)) {
        res.status(400).json({ error: "line_unitPrice_invalid" });
        return;
      }
      if (raw.supplyAmount !== undefined && !isFiniteNumber(raw.supplyAmount)) {
        res.status(400).json({ error: "line_supplyAmount_invalid" });
        return;
      }
      if (raw.vatAmount !== undefined && !isFiniteNumber(raw.vatAmount)) {
        res.status(400).json({ error: "line_vatAmount_invalid" });
        return;
      }
      lines.push({
        productId: isString(raw.productId) ? raw.productId : undefined,
        productVariantId: isString(raw.productVariantId) ? raw.productVariantId : undefined,
        warehouseId: isString(raw.warehouseId) ? raw.warehouseId : undefined,
        itemCode: isString(raw.itemCode) ? raw.itemCode : undefined,
        itemName: isString(raw.itemName) ? raw.itemName : undefined,
        specLabel: isString(raw.specLabel) ? raw.specLabel : undefined,
        quantity: raw.quantity,
        unitPrice: isFiniteNumber(raw.unitPrice) ? raw.unitPrice : undefined,
        supplyAmount: isFiniteNumber(raw.supplyAmount) ? raw.supplyAmount : undefined,
        vatAmount: isFiniteNumber(raw.vatAmount) ? raw.vatAmount : undefined,
        note: isString(raw.note) ? raw.note : undefined,
        serialLot: isString(raw.serialLot) ? raw.serialLot : undefined
      });
    }
    const isAdmin = me.role === "admin" || me.role === "super_admin";
    const input: CreateErpDocumentInput = {
      documentType: b.documentType === "use" ? "use" : "sale",
      documentDate: b.documentDate.trim(),
      managerId: isString(b.managerId) ? b.managerId : undefined,
      customerName: isString(b.customerName) ? b.customerName : undefined,
      warehouseId: isString(b.warehouseId) ? b.warehouseId : undefined,
      transactionType: isString(b.transactionType) ? b.transactionType : undefined,
      currency: isString(b.currency) ? b.currency : undefined,
      contact: isString(b.contact) ? b.contact : undefined,
      address: isString(b.address) ? b.address : undefined,
      note: isString(b.note) ? b.note : undefined,
      lines,
      // 음수 재고 허용은 관리자가 명시적으로 요청한 경우에만.
      allowNegative: isAdmin && b.allowNegative === true
    };
    const result = await repos.erp.createDocument(input, { id: me.id });
    if (!result.ok) {
      if (result.error === "insufficient_stock") {
        res.status(409).json({ error: "insufficient_stock", shortages: result.shortages });
        return;
      }
      res.status(400).json({ error: result.error });
      return;
    }
    await auditLog(repos, req, {
      action: "erp.document.create",
      targetType: "erp_document",
      targetId: result.document.id,
      targetLabel: result.document.documentNo,
      level: input.allowNegative ? "warn" : "info",
      meta: {
        documentType: result.document.documentType,
        totalAmount: result.document.totalAmount,
        lineCount: result.document.lines.length,
        allowNegative: input.allowNegative
      }
    });
    res.status(201).json(result.document);
  });

  // POST /erp/documents/:id/cancel — 취소 원장 생성 + 재고 복원.
  router.post("/documents/:id/cancel", async (req, res) => {
    const me = req.currentUser!;
    const cancelled = await repos.erp.cancelDocument(req.params.id, { id: me.id });
    if (!cancelled) {
      // 미존재 또는 이미 취소됨.
      const exists = await repos.erp.findDocumentById(req.params.id);
      res.status(exists ? 409 : 404).json({
        error: exists ? "already_cancelled" : "not_found"
      });
      return;
    }
    await auditLog(repos, req, {
      action: "erp.document.cancel",
      targetType: "erp_document",
      targetId: cancelled.id,
      targetLabel: cancelled.documentNo,
      level: "warn",
      meta: { documentType: cancelled.documentType, totalAmount: cancelled.totalAmount }
    });
    res.json(cancelled);
  });

  // ── MES 매핑 / 동기화 이력(Phase 12-F 골격) ──
  router.get("/mes/mappings", async (req, res) => {
    const productId = isString(req.query.productId) ? req.query.productId : undefined;
    res.json(await repos.erp.listMesMappings(productId));
  });

  router.post("/mes/mappings", admins, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isString(b.productId) || !b.productId.trim()) {
      res.status(400).json({ error: "productId_required" });
      return;
    }
    const mapping = await repos.erp.createMesMapping({
      productId: b.productId,
      productVariantId: isString(b.productVariantId) ? b.productVariantId : undefined,
      mesProductId: isString(b.mesProductId) ? b.mesProductId : undefined,
      mesItemCode: isString(b.mesItemCode) ? b.mesItemCode : undefined,
      mesUnitLabel: isString(b.mesUnitLabel) ? b.mesUnitLabel : undefined,
      isActive: typeof b.isActive === "boolean" ? b.isActive : undefined
    });
    await auditLog(repos, req, {
      action: "erp.mes.mapping.create",
      targetType: "mes_mapping",
      targetId: mapping.id,
      targetLabel: mapping.mesItemCode ?? mapping.mesProductId ?? mapping.id,
      meta: { productId: mapping.productId }
    });
    res.status(201).json(mapping);
  });

  router.patch("/mes/mappings/:id", admins, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const updated = await repos.erp.updateMesMapping(req.params.id, {
      productVariantId: isString(b.productVariantId) ? b.productVariantId : undefined,
      mesProductId: isString(b.mesProductId) ? b.mesProductId : undefined,
      mesItemCode: isString(b.mesItemCode) ? b.mesItemCode : undefined,
      mesUnitLabel: isString(b.mesUnitLabel) ? b.mesUnitLabel : undefined,
      isActive: typeof b.isActive === "boolean" ? b.isActive : undefined
    });
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "erp.mes.mapping.update",
      targetType: "mes_mapping",
      targetId: updated.id,
      targetLabel: updated.mesItemCode ?? updated.id
    });
    res.json(updated);
  });

  router.get("/mes/sync-runs", async (req, res) => {
    const limit = isString(req.query.limit) ? Number(req.query.limit) : undefined;
    res.json(await repos.erp.listMesSyncRuns(Number.isFinite(limit) ? limit : undefined));
  });

  // ── Excel(CSV) 출력 ──
  // 의존성 추가를 피하기 위해 UTF-8 BOM 을 붙인 CSV 로 내려준다(Excel 에서
  // 한글이 깨지지 않고 바로 열린다). 추후 정식 xlsx 가 필요하면 exceljs 등을
  // 도입해 같은 라우트에서 Accept 로 분기.
  const sendCsv = (res: Response, filename: string, rows: (string | number)[][]) => {
    const escape = (v: string | number) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = rows.map((r) => r.map(escape).join(",")).join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("﻿" + body);
  };

  // GET /erp/exports/inventory — 현재고 요약 CSV.
  router.get("/exports/inventory", async (req, res) => {
    const productId = isString(req.query.productId) ? req.query.productId : undefined;
    const warehouseId = isString(req.query.warehouseId) ? req.query.warehouseId : undefined;
    const inv = await repos.erp.listInventory({ productId, warehouseId });
    const rows: (string | number)[][] = [
      ["제품", "규격코드", "규격", "단위", "창고코드", "창고", "수량", "kg"]
    ];
    for (const b of inv) {
      rows.push([
        b.productName ?? "",
        b.variantCode ?? "",
        b.variantName ?? "",
        b.unitLabel ?? "",
        b.warehouseCode ?? "",
        b.warehouseName ?? "",
        b.quantity,
        b.quantityKg
      ]);
    }
    sendCsv(res, "inventory.csv", rows);
  });

  // GET /erp/exports/documents?period=month|year&from=&to= — 전표 목록 CSV.
  router.get("/exports/documents", async (req, res) => {
    const q = req.query;
    const docs = await repos.erp.listDocuments({
      from: isString(q.from) ? q.from : undefined,
      to: isString(q.to) ? q.to : undefined,
      type: q.type === "use" ? "use" : q.type === "sale" ? "sale" : undefined,
      limit: 5000
    });
    const rows: (string | number)[][] = [
      ["전표번호", "일자", "유형", "상태", "거래처", "공급가액", "부가세", "합계"]
    ];
    for (const d of docs) {
      rows.push([
        d.documentNo,
        d.documentDate,
        d.documentType === "use" ? "사용" : "판매",
        d.status === "cancelled" ? "취소" : "정상",
        d.customerName ?? "",
        d.supplyAmount,
        d.vatAmount,
        d.totalAmount
      ]);
    }
    sendCsv(res, "documents.csv", rows);
  });

  return router;
}
