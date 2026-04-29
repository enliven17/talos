/**
 * GET /api/axl/peers
 *
 * Returns the full list of peers visible on the AXL mesh, derived from
 * the /topology endpoint on the local AXL node.
 */

import { NextResponse } from "next/server";
import { getTopology } from "@/lib/axl";

export const dynamic = "force-dynamic";

export async function GET() {
  const topo = await getTopology();

  if (!topo) {
    return NextResponse.json({ available: false, peers: [], count: 0 });
  }

  const our = topo.our_public_key;
  const active = topo.peers.filter((p) => p.up).map((p) => p.public_key);
  const tree = topo.tree.map((t) => t.public_key);
  const all = [...new Set([...active, ...tree])].filter((pk) => pk !== our);

  return NextResponse.json({
    available: true,
    our_peer_id: our,
    our_ipv6: topo.our_ipv6,
    peers: all,
    active_count: active.length,
    count: all.length,
  });
}
