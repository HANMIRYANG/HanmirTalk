-- Migration: 006_users_bcrypt_password
-- Replace the placeholder password_hash for seed users with a real bcryptjs
-- hash of the dev shared password ("hanmir1234").
--
-- Hash generated via:
--   node -e "console.log(require('bcryptjs').hashSync('hanmir1234', 10))"
--
-- Idempotent: only updates rows still carrying the placeholder marker. Real
-- user-generated hashes (added via POST /users) are left alone.
--
-- After this migration the server uses bcryptjs.compareSync against the
-- stored hash. The DEFAULT_PASSWORD env var is no longer used at runtime;
-- it remains in .env.example only as documentation of the seed value.
--
-- Apply with:
--   psql "$DATABASE_URL" -f server/src/db/migrations/006_users_bcrypt_password.sql

BEGIN;

UPDATE users
   SET password_hash = '$2a$10$ekXSbq29fAWA5upTG1jEyuO3r7rQqVE5e1oSAAteXbD1bgomikaq6'
 WHERE password_hash = 'pending-bcrypt-migration';

COMMIT;
