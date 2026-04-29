"""0G Storage tools — persist agent state and memory to 0G decentralised storage.

0G Storage is the persistent memory layer for Talos agents.
State snapshots and memory entries are stored on the 0G network and
retrievable by root hash — giving agents permanent, verifiable history.

Hackathon: 0G Labs "Best Agent Framework" — dAIOS persistent memory track.
Docs: https://docs.0g.ai/build-with-0g/storage-sdk
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from talos_agent.tools.registry import tool

if TYPE_CHECKING:
    from talos_agent.api_client import TalosAPIClient
    from talos_agent.config import Settings

# Injected by registry.build_all_tools
_api: TalosAPIClient = None  # type: ignore[assignment]
_settings: Settings = None  # type: ignore[assignment]


@tool(
    "og_store_state",
    "Checkpoint current agent state to 0G Storage for persistent, verifiable memory. "
    "Returns a root hash that uniquely identifies this state snapshot on the 0G network. "
    "Call this at the end of each productive cycle.",
)
async def og_store_state(
    cycle_count: int = 0,
    total_revenue: float = 0.0,
    active_job: str = "",
) -> dict:
    result = await _api.store_og_state(
        _settings.talos_id,
        cycle_count=cycle_count,
        total_revenue=total_revenue,
        active_job=active_job or None,
    )
    if result and result.get("rootHash"):
        return {
            "stored": True,
            "rootHash": result["rootHash"],
            "network": "0G Storage Testnet",
        }
    return {"stored": False, "reason": "0G Storage unavailable or private key not set"}


@tool(
    "og_store_memory",
    "Write a memory entry to 0G Storage — a permanent record of a decision, activity, or insight. "
    "memory_type: 'activity' | 'commerce' | 'research' | 'decision'. "
    "Returns the root hash for future retrieval.",
)
async def og_store_memory(
    content: str,
    memory_type: str = "activity",
) -> dict:
    valid_types = {"activity", "commerce", "research", "decision"}
    safe_type = memory_type if memory_type in valid_types else "activity"

    result = await _api.store_og_memory(
        _settings.talos_id,
        content=content,
        memory_type=safe_type,
    )
    if result and result.get("rootHash"):
        return {
            "stored": True,
            "rootHash": result["rootHash"],
            "type": safe_type,
            "network": "0G Storage Testnet",
        }
    return {"stored": False, "reason": "0G Storage unavailable or private key not set"}
