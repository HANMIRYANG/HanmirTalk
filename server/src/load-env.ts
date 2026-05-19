// Loads .env into process.env. Side-effect module — must be the very
// first import in server/src/index.ts so it runs before any other module
// reads process.env at evaluation time.
//
// Why a separate file: ESM evaluates all `import` statements before the
// importing module's body runs. If we called dotenv() inline at the top
// of index.ts, `./config` and friends would still evaluate first and
// see an empty process.env. Putting dotenv in its own module makes it a
// proper import — the module's body runs as part of the import chain.
//
// We try multiple paths because `npm --workspace @hanmir/server run dev`
// may set cwd to either repo root or server/. dotenv defaults to
// override=false so the first hit wins per-key.
import path from "path";
import { config as loadEnv } from "dotenv";

loadEnv(); // <cwd>/.env
loadEnv({ path: path.resolve(process.cwd(), "..", ".env") });
loadEnv({ path: path.resolve(process.cwd(), "..", "..", ".env") });

if (process.env.DEBUG_ENV === "1") {
  // eslint-disable-next-line no-console
  console.log("[hanmir-server] env debug:", {
    cwd: process.cwd(),
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    keyPrefix: process.env.ANTHROPIC_API_KEY?.slice(0, 7),
    hasDbUrl: Boolean(process.env.DATABASE_URL),
    smtpHost: process.env.SMTP_HOST
  });
}
