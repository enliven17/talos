-- Add missing txHash column to tls_approvals
ALTER TABLE "tls_approvals" ADD COLUMN IF NOT EXISTS "txHash" text;
