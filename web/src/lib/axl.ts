/**
 * AXL (Agent Exchange Layer) — Gensyn P2P mesh integration for Talos.
 *
 * Server-side: wraps the localhost AXL node HTTP API.
 * Client-side: types only (browser never talks to 9002 directly).
 *
 * Hackathon: Gensyn "Best Application of AXL" — $5,000
 * Docs: https://docs.gensyn.ai/tech/agent-exchange-layer
 */

// ── Config ────────────────────────────────────────────────────────────────────

const AXL_BASE = process.env.AXL_NODE_URL ?? "http://127.0.0.1:9002";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AXLPeer {
  public_key: string;
  up: boolean;
}

export interface AXLTopology {
  our_ipv6: string;
  our_public_key: string;
  peers: AXLPeer[];
  tree: Array<{ public_key: string }>;
}

export interface TalosMessage {
  proto: number;
  type: string;
  talos_id: string;
  sender_peer_id: string;
  timestamp: number;
  payload: Record<string, unknown>;
}

export interface AXLStatus {
  available: boolean;
  peer_id: string | null;
  active_peers: number;
  our_ipv6: string | null;
}

// ── Server-side helpers ───────────────────────────────────────────────────────

/**
 * Fetch topology from the local AXL node.
 * Returns null if the node is not running.
 */
export async function getTopology(): Promise<AXLTopology | null> {
  try {
    const res = await fetch(`${AXL_BASE}/topology`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as AXLTopology;
  } catch {
    return null;
  }
}

/**
 * Get AXL node status summary — safe to call from server components / API routes.
 */
export async function getAXLStatus(): Promise<AXLStatus> {
  const topo = await getTopology();
  if (!topo) {
    return { available: false, peer_id: null, active_peers: 0, our_ipv6: null };
  }
  const activePeers = topo.peers.filter((p) => p.up).length;
  return {
    available: true,
    peer_id: topo.our_public_key || null,
    active_peers: activePeers,
    our_ipv6: topo.our_ipv6 || null,
  };
}

/**
 * Send a TalosMessage to a specific peer via the local AXL node.
 */
export async function axlSend(
  peerPublicKey: string,
  message: Omit<TalosMessage, "sender_peer_id">,
): Promise<boolean> {
  try {
    const body = JSON.stringify({ ...message, sender_peer_id: "" });
    const res = await fetch(`${AXL_BASE}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Destination-Peer-Id": peerPublicKey,
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Drain the inbound AXL message queue.
 * Returns all pending TalosMessages (empty array if none or node unreachable).
 */
export async function axlRecvAll(): Promise<Array<{ sender: string; message: TalosMessage }>> {
  const results: Array<{ sender: string; message: TalosMessage }> = [];
  while (true) {
    try {
      const res = await fetch(`${AXL_BASE}/recv`, {
        signal: AbortSignal.timeout(10000),
      });
      if (res.status === 204) break;
      if (!res.ok) break;

      const sender = res.headers.get("x-from-peer-id") ?? "unknown";
      const data = (await res.json()) as TalosMessage;
      results.push({ sender, message: data });
    } catch {
      break;
    }
  }
  return results;
}

/**
 * Broadcast a TalosMessage to all active peers.
 * Returns number of successful sends.
 */
export async function axlBroadcast(
  message: Omit<TalosMessage, "sender_peer_id">,
): Promise<number> {
  const topo = await getTopology();
  if (!topo) return 0;

  const our = topo.our_public_key;
  const peers = [
    ...topo.peers.filter((p) => p.up).map((p) => p.public_key),
    ...topo.tree.map((t) => t.public_key),
  ].filter((pk) => pk && pk !== our);

  const unique = [...new Set(peers)];
  const results = await Promise.allSettled(unique.map((pk) => axlSend(pk, message)));
  return results.filter((r) => r.status === "fulfilled" && r.value).length;
}

/**
 * Announce a Talos service to the entire AXL mesh.
 */
export async function announceServiceOnAXL(params: {
  talosId: string;
  serviceName: string;
  price: number;
  description: string;
  walletAddress: string;
  apiUrl?: string;
}): Promise<{ announced_to: number }> {
  const count = await axlBroadcast({
    proto: 1,
    type: "service_offer",
    talos_id: params.talosId,
    timestamp: Date.now() / 1000,
    payload: {
      service_name: params.serviceName,
      price: params.price,
      description: params.description,
      wallet_address: params.walletAddress,
      api_url: params.apiUrl ?? "",
    },
  });
  return { announced_to: count };
}
