import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

type Attempt = { name: string; url: string };

function normalizeUrl(url: string): string {
  const supabase = /supabase\.(co|com)/i.test(url);
  if (supabase) {
    return url.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
  }
  if (url.includes("sslmode=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}sslmode=require`;
}

function poolFromUrl(connectionString: string): Pool {
  const supabase = /supabase\.(co|com)/i.test(connectionString);
  return new Pool({
    connectionString,
    ...(supabase ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

async function tryConnect({ name, url }: Attempt): Promise<boolean> {
  const pool = poolFromUrl(normalizeUrl(url));
  try {
    const { rows } = await pool.query(
      "SELECT 1 AS ok, current_database() AS db",
    );
    console.log(`\n[${name}] OK`, rows[0]);
    return true;
  } catch (e) {
    console.error(`\n[${name}] FAILED`, (e as Error).message || e);
    return false;
  } finally {
    await pool.end();
  }
}

async function main() {
  const attempts: Attempt[] = [];
  if (process.env.DIRECT_URL) {
    attempts.push({ name: "DIRECT_URL (5432, migrations / debug)", url: process.env.DIRECT_URL });
  }
  if (process.env.DATABASE_URL) {
    attempts.push({ name: "DATABASE_URL (pooler 6543)", url: process.env.DATABASE_URL });
  }

  if (attempts.length === 0) {
    console.error("Set DIRECT_URL and/or DATABASE_URL in .env.local");
    process.exit(1);
  }

  console.log("Testing DATABASE_URL / DIRECT_URL…\n");

  let anyOk = false;
  for (const a of attempts) {
    if (await tryConnect(a)) anyOk = true;
  }

  if (!anyOk) {
    console.error(
      "\n---\nHepsi başarısız. Supabase Dashboard → Database → Connection string:\n" +
        "- Pooler host bölgesi (aws-0-REGION) projeyle aynı olmalı; stringi kopyala-yapıştır.\n" +
        "- Şifre: Database settings → Reset password ile yenile, .env ile aynı olsun.\n" +
        "- Önce DIRECT (port 5432) çalışmalı; pooler ondan sonra.\n",
    );
    process.exit(1);
  }
}

void main();
