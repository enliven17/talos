"""AXL P2P tools — agent-to-agent communication via Gensyn AXL mesh.

Exposes the AXL node to the LLM as callable tools so agents can:
- Discover other Talos agents on the decentralised mesh
- Send direct encrypted messages to specific peers
- Broadcast service announcements network-wide
- Drain the inbound message queue

Injected dependency: _axl (AXLClient | None) — set by registry.build_all_tools.
If AXL is not enabled all tools return a descriptive error instead of crashing.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from talos_agent.axl.messages import TalosMessage
from talos_agent.tools.registry import tool

if TYPE_CHECKING:
    from talos_agent.axl.client import AXLClient

# Injected by registry.build_all_tools — None when AXL_ENABLED=false
_axl: "AXLClient | None" = None

_AXL_OFF = {"error": "AXL not enabled. Set AXL_ENABLED=true to use P2P networking."}


@tool(
    "axl_get_peers",
    "Discover Talos agents currently reachable on the Gensyn P2P mesh. "
    "Returns our peer ID plus a list of active peer IDs.",
)
async def axl_get_peers() -> dict:
    if not _axl:
        return _AXL_OFF
    peers = _axl.active_peers()
    return {
        "our_peer_id": _axl.peer_id,
        "peers": peers,
        "count": len(peers),
    }


@tool(
    "axl_send_message",
    "Send an encrypted P2P message to a specific Talos agent by peer ID. "
    "Use message_type: 'service_offer' | 'job_request' | 'job_result' | 'activity_share' | 'hello'. "
    "Get peer IDs from axl_get_peers first.",
)
async def axl_send_message(peer_id: str, message_type: str, content: str) -> dict:
    if not _axl:
        return _AXL_OFF
    msg = TalosMessage(
        type=message_type,
        talos_id=_axl.talos_id,
        payload={"content": content},
    )
    ok = _axl.send(peer_id, msg)
    return {
        "sent": ok,
        "peer_id": peer_id[:16] + "…",
        "type": message_type,
    }


@tool(
    "axl_broadcast",
    "Broadcast a message to ALL Talos agents on the P2P mesh at once. "
    "Use for service announcements, discovery queries, or network-wide alerts.",
)
async def axl_broadcast(message_type: str, content: str) -> dict:
    if not _axl:
        return _AXL_OFF
    msg = TalosMessage(
        type=message_type,
        talos_id=_axl.talos_id,
        payload={"content": content},
    )
    count = _axl.broadcast(msg)
    return {"broadcast_to": count, "type": message_type}


@tool(
    "axl_recv_messages",
    "Drain the inbound P2P message queue. "
    "Returns all pending messages from other Talos agents on the mesh. "
    "Call this at the start of each cycle to process incoming service requests.",
)
async def axl_recv_messages() -> dict:
    if not _axl:
        return _AXL_OFF
    received = _axl.recv_all()
    messages = [
        {
            "from_peer": sender[:16] + "…",
            "type": msg.type,
            "talos_id": msg.talos_id,
            "payload": msg.payload,
            "timestamp": msg.timestamp,
        }
        for sender, msg in received
    ]
    return {"messages": messages, "count": len(messages)}


@tool(
    "axl_announce_service",
    "Broadcast this agent's x402 service offering to the entire P2P mesh. "
    "Other agents can discover and purchase it without going through the central API.",
)
async def axl_announce_service(
    service_name: str,
    price: float,
    description: str,
    wallet_address: str = "",
) -> dict:
    if not _axl:
        return _AXL_OFF
    result = await _axl.announce_service(
        service_name=service_name,
        price=price,
        description=description,
        wallet_address=wallet_address,
    )
    return result


@tool(
    "axl_call_mcp",
    "Call an MCP service on a remote Talos agent via AXL. "
    "The request travels end-to-end encrypted over the P2P mesh. "
    "Returns the JSON-RPC response from the remote agent.",
)
async def axl_call_mcp(peer_id: str, service: str, method: str, params: str = "{}") -> dict:
    if not _axl:
        return _AXL_OFF
    import json as _json
    try:
        params_dict = _json.loads(params)
    except Exception:
        params_dict = {}
    try:
        return _axl.call_mcp(peer_id=peer_id, service=service, method=method, params=params_dict)
    except Exception as exc:
        return {"error": str(exc)}
