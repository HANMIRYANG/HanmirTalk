import { Router } from "express";
import type { Repositories } from "../repositories/types";

export function createProductsRouter(repos: Repositories): Router {
  const router = Router();

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

  return router;
}
