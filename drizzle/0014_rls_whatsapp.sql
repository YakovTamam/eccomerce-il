GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_accounts TO app_rls;
--> statement-breakpoint
ALTER TABLE whatsapp_accounts ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON whatsapp_accounts
  USING (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid)
  WITH CHECK (store_id = NULLIF(current_setting('app.store_id', true), '')::uuid);
