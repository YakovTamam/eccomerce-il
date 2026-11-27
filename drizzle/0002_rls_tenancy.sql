-- Row Level Security for tenant tables (ADR 0002).
-- `app_rls` is a NOLOGIN role without BYPASSRLS; withStore() does SET LOCAL ROLE app_rls.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_rls') THEN
    CREATE ROLE app_rls NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
GRANT app_rls TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_rls;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON stores, store_members, store_domains TO app_rls;
--> statement-breakpoint
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE store_domains ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON stores
  USING (id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.store_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON store_members
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON store_domains
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
