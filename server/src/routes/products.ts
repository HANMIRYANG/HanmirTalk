import { Router } from "express";
import type {
  CreateProductInput,
  SalesStatus,
  UpdateProductInput
} from "@hanmir/shared";
import type { Repositories } from "../repositories/types";
import { requireRole } from "../auth/middleware";

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
    res.status(201).json(product);
  });

  router.patch("/:id", writers, async (req, res) => {
    const parsed = parseUpdate(req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    const updated = await repos.products.update(req.params.id, parsed);
    if (!updated) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(updated);
  });

  router.delete("/:id", writers, async (req, res) => {
    const ok = await repos.products.delete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
