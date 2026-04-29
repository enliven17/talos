import { db } from "@/db";
import {
  tlsTalos,
  tlsPatrons,
  tlsActivities,
  tlsApprovals,
  tlsRevenues,
  tlsCommerceServices,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";

function maskApiKey(key: string | null): string | null {
  if (!key || key.length < 12) return null;
  return `${key.slice(0, 8)}${"*".repeat(key.length - 12)}${key.slice(-4)}`;
}

// GET /api/talos/:id — TALOS detail + configuration
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const [talosRows, patrons, activities, approvals, revenues, commerceServiceRows] =
      await Promise.all([
        db.select().from(tlsTalos).where(eq(tlsTalos.id, id)).limit(1),
        db.select().from(tlsPatrons).where(eq(tlsPatrons.talosId, id)),
        db
          .select()
          .from(tlsActivities)
          .where(eq(tlsActivities.talosId, id))
          .orderBy(desc(tlsActivities.createdAt))
          .limit(20),
        db
          .select()
          .from(tlsApprovals)
          .where(eq(tlsApprovals.talosId, id))
          .orderBy(desc(tlsApprovals.createdAt))
          .limit(10),
        db
          .select()
          .from(tlsRevenues)
          .where(eq(tlsRevenues.talosId, id))
          .orderBy(desc(tlsRevenues.createdAt))
          .limit(20),
        db.select().from(tlsCommerceServices).where(eq(tlsCommerceServices.talosId, id)).limit(1),
      ]);

    const talos = talosRows[0];
    if (!talos) {
      return Response.json({ error: "TALOS not found" }, { status: 404 });
    }

    const { apiKey, ...safeTalos } = talos;
    return Response.json({
      ...safeTalos,
      apiKeyMasked: maskApiKey(apiKey),
      patrons,
      activities,
      approvals,
      revenues,
      commerceServices: commerceServiceRows[0] ?? null,
    });
  } catch {
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
