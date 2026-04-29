-- Rename Stellar-specific columns to chain-agnostic names
-- tls_talos: stellarAssetCode → tokenCode, default chains stellar → initia
ALTER TABLE "tls_talos" RENAME COLUMN "stellarAssetCode" TO "tokenCode";
ALTER TABLE "tls_talos" ALTER COLUMN "channels" SET DEFAULT '{"initia"}';

-- tls_patrons: stellarPublicKey → walletAddress, update unique index
ALTER TABLE "tls_patrons" RENAME COLUMN "stellarPublicKey" TO "walletAddress";
DROP INDEX IF EXISTS "tls_patrons_talosId_stellarPublicKey_key";
CREATE UNIQUE INDEX "tls_patrons_talosId_walletAddress_key" ON "tls_patrons" USING btree ("talosId","walletAddress");

-- tls_revenues: default currency USDC → INIT
ALTER TABLE "tls_revenues" ALTER COLUMN "currency" SET DEFAULT 'INIT';

-- tls_commerce_services: stellarPublicKey → walletAddress, chains stellar → initia, currency USDC → INIT
ALTER TABLE "tls_commerce_services" RENAME COLUMN "stellarPublicKey" TO "walletAddress";
ALTER TABLE "tls_commerce_services" ALTER COLUMN "chains" SET DEFAULT '{"initia"}';
ALTER TABLE "tls_commerce_services" ALTER COLUMN "currency" SET DEFAULT 'INIT';

-- tls_playbooks: default currency USDC → INIT
ALTER TABLE "tls_playbooks" ALTER COLUMN "currency" SET DEFAULT 'INIT';
