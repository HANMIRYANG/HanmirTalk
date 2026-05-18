import path from "path";

export const config = {
  port: Number(process.env.PORT ?? 4000),
  apiPrefix: process.env.API_PREFIX ?? "/api/v1",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  defaultPassword: process.env.DEFAULT_PASSWORD ?? "hanmir1234",
  databaseUrl: process.env.DATABASE_URL?.trim() ? process.env.DATABASE_URL.trim() : undefined,
  // Where multer writes uploaded files. Path-resolve against process cwd so
  // the location is stable regardless of where node was launched from.
  // Override with UPLOAD_DIR for prod (e.g. a docker volume mount).
  uploadDir: path.resolve(
    process.env.UPLOAD_DIR?.trim() || path.join(process.cwd(), "server", "uploads")
  ),
  // Max upload size in bytes (default 25 MB).
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024)
};
