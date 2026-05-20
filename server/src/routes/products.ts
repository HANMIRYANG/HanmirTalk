import { Router } from "express";
import fs from "fs/promises";
import path from "path";
import type {
  CreateProductInput,
  CreateProductLotInput,
  CreateProductSpecInput,
  ProductDocumentType,
  SalesStatus,
  UpdateProductInput,
  UpdateProductLotInput,
  UpdateProductSpecInput
} from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireRole } from "../auth/middleware";
import { auditLog } from "../audit";
import { config } from "../config";

const VALID_VERDICT = ["pass", "hold", "retest"] as const;

// Phase 7 J-2 — 8 product document types from docs/06_PRODUCT_INFO_SPEC.
const VALID_DOCUMENT_TYPE: ProductDocumentType[] = [
  "catalog",
  "test_report",
  "proposal",
  "price_sheet",
  "install_guide",
  "faq",
  "certificate",
  "image"
];

const VALID_SALES_STATUS: SalesStatus[] = [
  "unavailable",
  "preparing",
  "internal",
  "conditional",
  "available"
];

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function parseCreate(body: unknown): CreateProductInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (!isString(b.name) || !b.name.trim()) return { error: "name_required" };
  if (b.salesStatus !== undefined) {
    if (!isString(b.salesStatus) || !VALID_SALES_STATUS.includes(b.salesStatus as SalesStatus))
      return { error: "salesStatus_invalid" };
  }
  if (b.features !== undefined && !isStringArray(b.features))
    return { error: "features_invalid" };
  if (b.applications !== undefined && !isStringArray(b.applications))
    return { error: "applications_invalid" };
  if (b.cautions !== undefined && !isStringArray(b.cautions))
    return { error: "cautions_invalid" };
  return {
    name: b.name.trim(),
    category: isString(b.category) ? b.category : undefined,
    description: isString(b.description) ? b.description : undefined,
    features: isStringArray(b.features) ? b.features : undefined,
    applications: isStringArray(b.applications) ? b.applications : undefined,
    cautions: isStringArray(b.cautions) ? b.cautions : undefined,
    salesStatus: isString(b.salesStatus) ? (b.salesStatus as SalesStatus) : undefined,
    salesNote: isString(b.salesNote) ? b.salesNote : undefined,
    ownerId: isString(b.ownerId) ? b.ownerId : undefined
  };
}

function parseUpdate(body: unknown): UpdateProductInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const out: UpdateProductInput = {};
  if (b.name !== undefined) {
    if (!isString(b.name) || !b.name.trim()) return { error: "name_invalid" };
    out.name = b.name.trim();
  }
  if (b.category !== undefined) {
    if (!isString(b.category)) return { error: "category_invalid" };
    out.category = b.category;
  }
  if (b.description !== undefined) {
    if (!isString(b.description)) return { error: "description_invalid" };
    out.description = b.description;
  }
  if (b.features !== undefined) {
    if (!isStringArray(b.features)) return { error: "features_invalid" };
    out.features = b.features;
  }
  if (b.applications !== undefined) {
    if (!isStringArray(b.applications)) return { error: "applications_invalid" };
    out.applications = b.applications;
  }
  if (b.cautions !== undefined) {
    if (!isStringArray(b.cautions)) return { error: "cautions_invalid" };
    out.cautions = b.cautions;
  }
  if (b.salesStatus !== undefined) {
    if (!isString(b.salesStatus) || !VALID_SALES_STATUS.includes(b.salesStatus as SalesStatus))
      return { error: "salesStatus_invalid" };
    out.salesStatus = b.salesStatus as SalesStatus;
  }
  if (b.salesNote !== undefined) {
    if (!isString(b.salesNote)) return { error: "salesNote_invalid" };
    out.salesNote = b.salesNote;
  }
  if (b.ownerId !== undefined) {
    if (!isString(b.ownerId)) return { error: "ownerId_invalid" };
    out.ownerId = b.ownerId;
  }
  return out;
}

export function createProductsRouter(repos: Repositories): Router {
  const router = Router();

  // Writer guard mirrors projects/tasks: any of these roles can mutate.
  // TODO(per-product): scope down to product owner once owners are wired.
  const writers = requireRole(
    "admin",
    "super_admin",
    "manager",
    "project_owner"
  );

  router.get("/", async (_req, res) => {
    const products = await repos.products.list();
    res.json(products);
  });

  router.get("/:id", async (req, res) => {
    const product = await repos.products.findById(req.params.id);
    if (!product) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(product);
  });

  router.post("/", writers, async (req, res) => {
    const parsed = parseCreate(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const product = await repos.products.create(parsed);
    await auditLog(repos, req, {
      action: "product.create",
      targetType: "product",
      targetId: product.id,
      targetLabel: product.name,
      meta: { category: product.category, salesStatus: product.salesStatus }
    });
    res.status(201).json(product);
  });

  router.patch("/:id", writers, async (req, res) => {
    const parsed = parseUpdate(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    // Phase 7 J-1 — salesStatus 변경 감지를 위해 before 값을 미리 보관.
    const before = await repos.products.findById(req.params.id);
    const updated = await repos.products.update(req.params.id, parsed);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "product.update",
      targetType: "product",
      targetId: updated.id,
      targetLabel: updated.name,
      meta: parsed
    });
    // Phase 7 J-1 — salesStatus가 실제로 바뀐 경우 sales_status_events에
    // append. 이유는 body의 salesNote 또는 별도 reason 필드에서 추출.
    if (
      parsed.salesStatus &&
      before &&
      before.salesStatus !== updated.salesStatus
    ) {
      const reasonInput = (req.body as { salesReason?: unknown })?.salesReason;
      const reason = typeof reasonInput === "string" && reasonInput.trim()
        ? reasonInput.trim()
        : parsed.salesNote || undefined;
      await repos.products
        .appendSalesEvent({
          productId: updated.id,
          fromStatus: before.salesStatus,
          toStatus: updated.salesStatus,
          reason,
          changedBy: { id: req.currentUser!.id }
        })
        .catch(() => undefined);
    }
    res.json(updated);
  });

  router.delete("/:id", writers, async (req, res) => {
    // Capture label before delete for the audit row.
    const before = await repos.products.findById(req.params.id);
    const ok = await repos.products.delete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "product.delete",
      targetType: "product",
      targetId: req.params.id,
      targetLabel: before?.name ?? req.params.id,
      level: "warn"
    });
    res.json({ ok: true });
  });

  // ── Phase 7 J-2 — specs / lots / sales-history ──────────────────

  router.get("/:id/specs", async (req, res) => {
    const product = await repos.products.findById(req.params.id);
    if (!product) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const specs = await repos.products.listSpecs(req.params.id);
    res.json(specs);
  });

  router.post("/:id/specs", writers, async (req, res) => {
    const parsed = parseSpec(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const product = await repos.products.findById(req.params.id);
    if (!product) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const spec = await repos.products.createSpec(req.params.id, parsed);
    await auditLog(repos, req, {
      action: "product.spec.upsert",
      targetType: "product",
      targetId: req.params.id,
      targetLabel: `${product.name} — ${spec.key}`,
      meta: { specId: spec.id, key: spec.key }
    });
    res.status(201).json(spec);
  });

  router.patch("/:id/specs/:specId", writers, async (req, res) => {
    const parsed = parseSpecUpdate(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const updated = await repos.products.updateSpec(req.params.id, req.params.specId, parsed);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  });

  router.delete("/:id/specs/:specId", writers, async (req, res) => {
    const ok = await repos.products.deleteSpec(req.params.id, req.params.specId);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "product.spec.delete",
      targetType: "product",
      targetId: req.params.id,
      targetLabel: req.params.specId,
      level: "warn"
    });
    res.json({ ok: true });
  });

  router.get("/:id/lots", async (req, res) => {
    const product = await repos.products.findById(req.params.id);
    if (!product) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const lots = await repos.products.listLots(req.params.id);
    res.json(lots);
  });

  router.post("/:id/lots", writers, async (req, res) => {
    const parsed = parseLot(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const product = await repos.products.findById(req.params.id);
    if (!product) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    try {
      const lot = await repos.products.createLot(req.params.id, parsed);
      await auditLog(repos, req, {
        action: "product.lot.create",
        targetType: "product",
        targetId: req.params.id,
        targetLabel: `${product.name} LOT ${lot.number}`,
        meta: { lotId: lot.id, verdict: lot.verdict }
      });
      res.status(201).json(lot);
    } catch (err) {
      if (err instanceof Error && err.message === "duplicate_lot_number") {
        res.status(409).json({ error: "duplicate_lot_number" });
        return;
      }
      throw err;
    }
  });

  router.patch("/:id/lots/:lotId", writers, async (req, res) => {
    const parsed = parseLotUpdate(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const updated = await repos.products.updateLot(req.params.id, req.params.lotId, parsed);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  });

  router.delete("/:id/lots/:lotId", writers, async (req, res) => {
    const ok = await repos.products.deleteLot(req.params.id, req.params.lotId);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "product.lot.delete",
      targetType: "product",
      targetId: req.params.id,
      targetLabel: req.params.lotId,
      level: "warn"
    });
    res.json({ ok: true });
  });

  router.get("/:id/sales-history", async (req, res) => {
    const product = await repos.products.findById(req.params.id);
    if (!product) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const events = await repos.products.listSalesEvents(req.params.id);
    res.json(events);
  });

  // ── Phase 7 J-2 — product documents (attachments + product_documents) ──

  router.get("/:id/documents", async (req, res) => {
    const product = await repos.products.findById(req.params.id);
    if (!product) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    if (type && !(VALID_DOCUMENT_TYPE as string[]).includes(type)) {
      res.status(400).json({ error: "type_invalid" });
      return;
    }
    const documents = await repos.products.listDocuments(req.params.id, type);
    res.json(documents);
  });

  // Links an already-uploaded attachment (POST /files/upload?productId=) to
  // the product under one of the 8 document types.
  router.post("/:id/documents", writers, async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (!isString(b.attachmentId) || !b.attachmentId.trim()) {
      res.status(400).json({ error: "attachmentId_required" });
      return;
    }
    if (
      !isString(b.documentType) ||
      !(VALID_DOCUMENT_TYPE as string[]).includes(b.documentType)
    ) {
      res.status(400).json({ error: "documentType_invalid" });
      return;
    }
    const product = await repos.products.findById(req.params.id);
    if (!product) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const document = await repos.products.createDocument(
      req.params.id,
      b.attachmentId.trim(),
      b.documentType as ProductDocumentType
    );
    if (!document) {
      res.status(404).json({ error: "attachment_not_found" });
      return;
    }
    await auditLog(repos, req, {
      action: "product.document.add",
      targetType: "product",
      targetId: req.params.id,
      targetLabel: `${product.name} — ${document.fileName}`,
      meta: {
        documentId: document.id,
        documentType: document.documentType,
        attachmentId: document.attachmentId
      }
    });
    res.status(201).json(document);
  });

  router.delete("/:id/documents/:docId", writers, async (req, res) => {
    const removed = await repos.products.deleteDocument(
      req.params.id,
      req.params.docId
    );
    if (!removed) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    // The attachment was uploaded specifically as this product document, so
    // drop the file row + on-disk bytes too rather than leaving an orphan.
    const storage = await repos.files.findStorage(removed.attachmentId);
    await repos.files.delete(removed.attachmentId);
    if (storage) {
      const abs = path.resolve(config.uploadDir, storage.fileUrl);
      if (abs.startsWith(config.uploadDir)) {
        await fs.unlink(abs).catch(() => undefined);
      }
    }
    await auditLog(repos, req, {
      action: "product.document.delete",
      targetType: "product",
      targetId: req.params.id,
      targetLabel: req.params.docId,
      level: "warn"
    });
    res.json({ ok: true });
  });

  return router;
}

function parseSpec(body: unknown): CreateProductSpecInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (!isString(b.key) || !b.key.trim()) return { error: "key_required" };
  if (!isString(b.value) || !b.value.trim()) return { error: "value_required" };
  return {
    key: b.key.trim(),
    value: b.value.trim(),
    sortOrder: typeof b.sortOrder === "number" ? b.sortOrder : undefined
  };
}

function parseSpecUpdate(body: unknown): UpdateProductSpecInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const out: UpdateProductSpecInput = {};
  if (b.key !== undefined) {
    if (!isString(b.key) || !b.key.trim()) return { error: "key_invalid" };
    out.key = b.key.trim();
  }
  if (b.value !== undefined) {
    if (!isString(b.value) || !b.value.trim()) return { error: "value_invalid" };
    out.value = b.value.trim();
  }
  if (b.sortOrder !== undefined) {
    if (typeof b.sortOrder !== "number") return { error: "sortOrder_invalid" };
    out.sortOrder = b.sortOrder;
  }
  return out;
}

function parseLot(body: unknown): CreateProductLotInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  if (!isString(b.number) || !b.number.trim()) return { error: "number_required" };
  if (b.verdict !== undefined) {
    if (
      !isString(b.verdict) ||
      !(VALID_VERDICT as readonly string[]).includes(b.verdict)
    )
      return { error: "verdict_invalid" };
  }
  return {
    number: b.number.trim(),
    producedAt: isString(b.producedAt) ? b.producedAt : undefined,
    quantity: isString(b.quantity) ? b.quantity : undefined,
    verdict: isString(b.verdict) ? (b.verdict as CreateProductLotInput["verdict"]) : undefined,
    testedAt: isString(b.testedAt) ? b.testedAt : undefined,
    note: isString(b.note) ? b.note : undefined
  };
}

function parseLotUpdate(body: unknown): UpdateProductLotInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const out: UpdateProductLotInput = {};
  if (b.number !== undefined) {
    if (!isString(b.number) || !b.number.trim()) return { error: "number_invalid" };
    out.number = b.number.trim();
  }
  if (b.producedAt !== undefined) {
    if (!isString(b.producedAt)) return { error: "producedAt_invalid" };
    out.producedAt = b.producedAt;
  }
  if (b.quantity !== undefined) {
    if (!isString(b.quantity)) return { error: "quantity_invalid" };
    out.quantity = b.quantity;
  }
  if (b.verdict !== undefined) {
    if (
      !isString(b.verdict) ||
      !(VALID_VERDICT as readonly string[]).includes(b.verdict)
    )
      return { error: "verdict_invalid" };
    out.verdict = b.verdict as UpdateProductLotInput["verdict"];
  }
  if (b.testedAt !== undefined) {
    if (!isString(b.testedAt)) return { error: "testedAt_invalid" };
    out.testedAt = b.testedAt;
  }
  if (b.note !== undefined) {
    if (!isString(b.note)) return { error: "note_invalid" };
    out.note = b.note;
  }
  return out;
}
