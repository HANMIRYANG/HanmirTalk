export const config = {
  port: Number(process.env.PORT ?? 4000),
  apiPrefix: process.env.API_PREFIX ?? "/api/v1",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  defaultPassword: process.env.DEFAULT_PASSWORD ?? "hanmir1234",
  databaseUrl: process.env.DATABASE_URL?.trim() ? process.env.DATABASE_URL.trim() : undefined
};
