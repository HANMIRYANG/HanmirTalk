-- Migration: 007_users_must_change_password
-- Forces seed users to change the shared DEFAULT_PASSWORD on first login.
-- New users created via POST /api/v1/users also get must_change_password=true
-- until they call POST /api/v1/auth/change-password.
--
-- The frontend layout guard reads me.mustChangePassword and redirects to
-- /account/password so other pages stay inaccessible until the change.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. The UPDATE only touches seed users
-- still carrying the old single-shared bcrypt hash (from migration 006).
--
-- Apply with:
--   psql "$DATABASE_URL" -f server/src/db/migrations/007_users_must_change_password.sql

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

UPDATE users
   SET must_change_password = true
 WHERE password_hash = '$2a$10$ekXSbq29fAWA5upTG1jEyuO3r7rQqVE5e1oSAAteXbD1bgomikaq6';

COMMIT;
