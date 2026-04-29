-- ================================================================
-- Talos Protocol — Supabase Setup SQL (Initia edition)
-- Supabase SQL Editor'a yapıştır ve çalıştır.
-- Tüm tabloları sıfırdan oluşturur.
-- ================================================================

-- Extension: cuid2 benzeri random text id'ler için pgcrypto
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "tls_talos" (
  "id"                text PRIMARY KEY DEFAULT 'tls_' || replace(gen_random_uuid()::text, '-', ''),
  "name"              text NOT NULL,
  "category"          text NOT NULL,
  "description"       text NOT NULL,
  "status"            text NOT NULL DEFAULT 'Active',
  "tokenCode"         text,
  "tokenSymbol"       text,
  "totalSupply"       integer NOT NULL DEFAULT 1000000,
  "pulsePrice"        numeric(18,6) NOT NULL DEFAULT '0',
  "minPatronPulse"    integer,
  "creatorShare"      integer NOT NULL DEFAULT 60,
  "investorShare"     integer NOT NULL DEFAULT 25,
  "treasuryShare"     integer NOT NULL DEFAULT 15,
  "apiEndpoint"       text,
  "apiKey"            text UNIQUE,
  "persona"           text,
  "targetAudience"    text,
  "channels"          text[] DEFAULT '{"initia"}',
  "toneVoice"         text,
  "approvalThreshold" numeric(18,2) NOT NULL DEFAULT '10',
  "gtmBudget"         numeric(18,2) NOT NULL DEFAULT '200',
  "agentOnline"       boolean NOT NULL DEFAULT false,
  "agentLastSeen"     timestamp(3),
  "walletPublicKey"   text,
  "creatorPublicKey"  text,
  "investorPublicKey" text,
  "treasuryPublicKey" text,
  "onChainId"         integer UNIQUE,
  "agentName"         text UNIQUE,
  "agentWalletId"     text,
  "agentWalletAddress" text,
  "createdAt"         timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "tls_patrons" (
  "id"          text PRIMARY KEY DEFAULT 'pat_' || replace(gen_random_uuid()::text, '-', ''),
  "talosId"     text NOT NULL REFERENCES "tls_talos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "walletAddress" text NOT NULL,
  "role"        text NOT NULL,
  "share"       numeric(5,2) NOT NULL,
  "pulseAmount" integer NOT NULL DEFAULT 0,
  "status"      text NOT NULL DEFAULT 'active',
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "tls_activities" (
  "id"        text PRIMARY KEY DEFAULT 'act_' || replace(gen_random_uuid()::text, '-', ''),
  "talosId"   text NOT NULL REFERENCES "tls_talos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type"      text NOT NULL,
  "content"   text NOT NULL,
  "channel"   text NOT NULL,
  "status"    text NOT NULL DEFAULT 'completed',
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "tls_approvals" (
  "id"          text PRIMARY KEY DEFAULT 'apr_' || replace(gen_random_uuid()::text, '-', ''),
  "talosId"     text NOT NULL REFERENCES "tls_talos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type"        text NOT NULL,
  "title"       text NOT NULL,
  "description" text,
  "amount"      numeric(18,6),
  "status"      text NOT NULL DEFAULT 'pending',
  "decidedAt"   timestamp(3),
  "decidedBy"   text,
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "tls_revenues" (
  "id"        text PRIMARY KEY DEFAULT 'rev_' || replace(gen_random_uuid()::text, '-', ''),
  "talosId"   text NOT NULL REFERENCES "tls_talos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "amount"    numeric(18,6) NOT NULL,
  "currency"  text NOT NULL DEFAULT 'INIT',
  "source"    text NOT NULL,
  "txHash"    text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "tls_commerce_services" (
  "id"              text PRIMARY KEY DEFAULT 'svc_' || replace(gen_random_uuid()::text, '-', ''),
  "talosId"         text NOT NULL REFERENCES "tls_talos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "serviceName"     text NOT NULL,
  "description"     text,
  "price"           numeric(18,6) NOT NULL,
  "currency"        text NOT NULL DEFAULT 'INIT',
  "walletAddress"   text NOT NULL,
  "chains"          text[] DEFAULT '{"initia"}',
  "fulfillmentMode" text NOT NULL DEFAULT 'async',
  "createdAt"       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "tls_commerce_jobs" (
  "id"               text PRIMARY KEY DEFAULT 'job_' || replace(gen_random_uuid()::text, '-', ''),
  "talosId"          text NOT NULL REFERENCES "tls_talos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "requesterTalosId" text NOT NULL,
  "serviceName"      text NOT NULL,
  "payload"          jsonb,
  "result"           jsonb,
  "status"           text NOT NULL DEFAULT 'pending',
  "paymentSig"       text,
  "txHash"           text,
  "amount"           numeric(18,6) NOT NULL,
  "createdAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "tls_playbooks" (
  "id"             text PRIMARY KEY DEFAULT 'plb_' || replace(gen_random_uuid()::text, '-', ''),
  "talosId"        text NOT NULL REFERENCES "tls_talos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "title"          text NOT NULL,
  "category"       text NOT NULL,
  "channel"        text NOT NULL,
  "description"    text NOT NULL,
  "price"          numeric(18,6) NOT NULL,
  "currency"       text NOT NULL DEFAULT 'INIT',
  "version"        integer NOT NULL DEFAULT 1,
  "tags"           text[] DEFAULT '{}',
  "status"         text NOT NULL DEFAULT 'active',
  "impressions"    integer NOT NULL DEFAULT 0,
  "engagementRate" numeric(5,2) NOT NULL DEFAULT '0',
  "conversions"    integer NOT NULL DEFAULT 0,
  "periodDays"     integer NOT NULL DEFAULT 30,
  "content"        jsonb,
  "createdAt"      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "tls_playbook_purchases" (
  "id"             text PRIMARY KEY DEFAULT 'pbp_' || replace(gen_random_uuid()::text, '-', ''),
  "playbookId"     text NOT NULL REFERENCES "tls_playbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "buyerPublicKey" text NOT NULL,
  "appliedAt"      timestamp(3),
  "txHash"         text,
  "createdAt"      timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "tls_api_audit_logs" (
  "id"         text PRIMARY KEY DEFAULT 'log_' || replace(gen_random_uuid()::text, '-', ''),
  "talosId"    text NOT NULL REFERENCES "tls_talos"("id") ON DELETE CASCADE,
  "method"     text NOT NULL,
  "path"       text NOT NULL,
  "statusCode" integer NOT NULL,
  "ipAddress"  text,
  "createdAt"  timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Indexes ─────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "tls_talos_apiKey_key"
  ON "tls_talos" ("apiKey");

CREATE UNIQUE INDEX IF NOT EXISTS "tls_patrons_talosId_walletAddress_key"
  ON "tls_patrons" ("talosId", "walletAddress");

CREATE INDEX IF NOT EXISTS "tls_activities_talosId_createdAt_idx"
  ON "tls_activities" ("talosId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "tls_commerce_services_talosId_key"
  ON "tls_commerce_services" ("talosId");

CREATE INDEX IF NOT EXISTS "tls_commerce_jobs_talosId_status_idx"
  ON "tls_commerce_jobs" ("talosId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "tls_commerce_jobs_paymentSig_unique"
  ON "tls_commerce_jobs" ("paymentSig")
  WHERE "paymentSig" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "tls_approvals_talosId_status_idx"
  ON "tls_approvals" ("talosId", "status");

CREATE INDEX IF NOT EXISTS "tls_revenues_talosId_createdAt_idx"
  ON "tls_revenues" ("talosId", "createdAt");

CREATE INDEX IF NOT EXISTS "tls_playbooks_talosId_idx"
  ON "tls_playbooks" ("talosId");

CREATE UNIQUE INDEX IF NOT EXISTS "tls_playbook_purchases_playbookId_buyerPublicKey_key"
  ON "tls_playbook_purchases" ("playbookId", "buyerPublicKey");

CREATE INDEX IF NOT EXISTS "tls_api_audit_logs_talosId_createdAt_idx"
  ON "tls_api_audit_logs" ("talosId", "createdAt");

-- ─── updatedAt auto-update trigger ──────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tls_talos','tls_patrons','tls_approvals',
    'tls_revenues','tls_commerce_services',
    'tls_commerce_jobs','tls_playbooks'
  ] LOOP
    EXECUTE format('
      CREATE TRIGGER set_updated_at_%s
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t);
  END LOOP;
END$$;

-- ─── Row Level Security ──────────────────────────────────────────

ALTER TABLE "tls_talos"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tls_patrons"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tls_activities"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tls_approvals"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tls_revenues"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tls_commerce_services"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tls_commerce_jobs"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tls_playbooks"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tls_playbook_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tls_api_audit_logs"     ENABLE ROW LEVEL SECURITY;

-- Public read (anon)
CREATE POLICY "anon_read_talos"             ON "tls_talos"             FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_patrons"           ON "tls_patrons"           FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_activities"        ON "tls_activities"        FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_revenues"          ON "tls_revenues"          FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_commerce_services" ON "tls_commerce_services" FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_playbooks"         ON "tls_playbooks"         FOR SELECT TO anon USING (true);

-- Authenticated full access
CREATE POLICY "auth_all_talos"              ON "tls_talos"             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_patrons"            ON "tls_patrons"           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_activities"         ON "tls_activities"        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_approvals"          ON "tls_approvals"         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_revenues"           ON "tls_revenues"          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_commerce_services"  ON "tls_commerce_services" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_commerce_jobs"      ON "tls_commerce_jobs"     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_playbooks"          ON "tls_playbooks"         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_playbook_purchases" ON "tls_playbook_purchases" FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_read_api_audit_logs"    ON "tls_api_audit_logs"    FOR SELECT TO authenticated USING (true);

-- postgres role (server-side API — bypasses RLS for direct DB operations)
CREATE POLICY "pg_all_talos"              ON "tls_talos"             FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "pg_all_patrons"            ON "tls_patrons"           FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "pg_all_activities"         ON "tls_activities"        FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "pg_all_approvals"          ON "tls_approvals"         FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "pg_all_revenues"           ON "tls_revenues"          FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "pg_all_commerce_services"  ON "tls_commerce_services" FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "pg_all_commerce_jobs"      ON "tls_commerce_jobs"     FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "pg_all_playbooks"          ON "tls_playbooks"         FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "pg_all_playbook_purchases" ON "tls_playbook_purchases" FOR ALL TO postgres USING (true) WITH CHECK (true);
CREATE POLICY "pg_all_api_audit_logs"     ON "tls_api_audit_logs"    FOR ALL TO postgres USING (true) WITH CHECK (true);
