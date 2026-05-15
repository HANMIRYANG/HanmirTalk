import { Router } from "express";
import type { Repositories } from "../repositories/types";

export function createFilesRouter(repos: Repositories): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    const files = await repos.files.listFiles();
    res.json(files);
  });

  router.get("/folders", async (_req, res) => {
    const folders = await repos.files.listFolders();
    res.json(folders);
  });

  router.get("/:id", async (req, res) => {
    const file = await repos.files.findById(req.params.id);
    if (!file) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json(file);
  });

  return router;
}
