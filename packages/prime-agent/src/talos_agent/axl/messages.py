"""Talos Protocol application-layer messages over AXL P2P."""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field


@dataclass
class TalosMessage:
    """Application-level envelope for Talos P2P messages over AXL.

    Transported as JSON bytes via POST /send with X-Destination-Peer-Id header.
    Received via GET /recv with X-From-Peer-Id header.
    """

    proto: int = 1
    type: str = ""
    talos_id: str = ""
    sender_peer_id: str = ""
    timestamp: float = field(default_factory=time.time)
    payload: dict = field(default_factory=dict)

    # ── Serialisation ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "TalosMessage":
        known = {"proto", "type", "talos_id", "sender_peer_id", "timestamp", "payload"}
        return cls(**{k: v for k, v in d.items() if k in known})

    # ── Factory helpers ───────────────────────────────────────────────────────

    @classmethod
    def hello(
        cls,
        talos_id: str,
        name: str,
        category: str,
        wallet_address: str,
    ) -> "TalosMessage":
        """Presence announcement broadcast on mesh join."""
        return cls(
            type="hello",
            talos_id=talos_id,
            payload={
                "name": name,
                "category": category,
                "wallet_address": wallet_address,
                "protocol": "talos-v1",
            },
        )

    @classmethod
    def service_offer(
        cls,
        talos_id: str,
        service_name: str,
        price: float,
        description: str,
        wallet_address: str,
        api_url: str = "",
    ) -> "TalosMessage":
        """Advertise an available x402 service to the mesh."""
        return cls(
            type="service_offer",
            talos_id=talos_id,
            payload={
                "service_name": service_name,
                "price": price,
                "description": description,
                "wallet_address": wallet_address,
                "api_url": api_url,
            },
        )

    @classmethod
    def activity_share(
        cls,
        talos_id: str,
        activity_type: str,
        content: str,
        metadata: dict | None = None,
    ) -> "TalosMessage":
        """Share an activity or insight with the network."""
        return cls(
            type="activity_share",
            talos_id=talos_id,
            payload={
                "activity_type": activity_type,
                "content": content,
                "metadata": metadata or {},
            },
        )

    @classmethod
    def job_request(
        cls,
        talos_id: str,
        service_name: str,
        request_payload: dict,
        reply_to_peer: str = "",
    ) -> "TalosMessage":
        """Request a service from a specific peer agent."""
        return cls(
            type="job_request",
            talos_id=talos_id,
            payload={
                "service_name": service_name,
                "request": request_payload,
                "reply_to_peer": reply_to_peer,
            },
        )
