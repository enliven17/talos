"""AXL (Agent Exchange Layer) client — Gensyn P2P mesh for Talos agents.

AXL is a local sidecar binary that provides end-to-end encrypted peer-to-peer
messaging via a Yggdrasil mesh. Your app talks to localhost; AXL handles
encryption, routing, and peer discovery.

Real HTTP API (verified from gensyn-ai/axl docs):
  GET  /topology                 — peer list + our public key
  POST /send                     — X-Destination-Peer-Id header + raw bytes body
  GET  /recv                     — drain inbound queue; 204 = empty
  POST /mcp/{peer_id}/{service}  — JSON-RPC forwarded to remote peer's MCP service
  POST /a2a/{peer_id}            — Google A2A JSON-RPC envelope

Peer IDs are 64-char hex-encoded ed25519 public keys.

Hackathon: Gensyn "Best Application of AXL" — $5,000
Docs:   https://docs.gensyn.ai/tech/agent-exchange-layer
GitHub: https://github.com/gensyn-ai/axl
"""

from __future__ import annotations

import asyncio
import json
import shutil
import urllib.request
from pathlib import Path

from rich.console import Console

from talos_agent.axl.messages import TalosMessage

console = Console()

# Gensyn-operated bootstrap node (from official AXL docs example config)
_GENSYN_BOOTSTRAP = "tls://34.46.48.224:9001"


class AXLClient:
    """Manages the AXL sidecar process and wraps the localhost HTTP API."""

    def __init__(
        self,
        port: int = 9002,
        binary_path: str = "axl",
        talos_id: str = "",
        config_dir: str | None = None,
    ) -> None:
        self.port = port
        self.binary_path = binary_path
        self.talos_id = talos_id
        self.base_url = f"http://127.0.0.1:{port}"
        self._config_dir = (
            Path(config_dir) if config_dir else Path.home() / ".talos-agent" / "axl"
        )
        self._process: asyncio.subprocess.Process | None = None
        self._peer_id: str | None = None

    @property
    def peer_id(self) -> str | None:
        return self._peer_id

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> bool:
        """Start the AXL node if not already reachable.

        Returns True when the node is healthy on localhost:{port}.
        Fails silently if the binary is absent — agent continues without P2P.
        """
        if await self._check_ready():
            self._peer_id = await self._fetch_peer_id()
            console.print(f"[dim][axl] Attached to existing node (port {self.port})[/dim]")
            return True

        if not shutil.which(self.binary_path) and not Path(self.binary_path).exists():
            console.print(
                f"[dim yellow][axl] '{self.binary_path}' not found — "
                "P2P mesh disabled (install AXL to enable)[/dim yellow]"
            )
            return False

        config_path = self._ensure_config()
        if config_path is None:
            return False

        try:
            self._process = await asyncio.create_subprocess_exec(
                self.binary_path,
                "-config",
                str(config_path),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            console.print(f"[dim][axl] Launched node PID {self._process.pid}[/dim]")
        except Exception as exc:
            console.print(f"[dim yellow][axl] Launch failed: {exc}[/dim yellow]")
            return False

        for _ in range(20):
            await asyncio.sleep(1)
            if await self._check_ready():
                self._peer_id = await self._fetch_peer_id()
                return True

        console.print("[dim yellow][axl] Node did not become ready in 20 s — disabling[/dim yellow]")
        return False

    async def stop(self) -> None:
        if self._process and self._process.returncode is None:
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=5)
            except asyncio.TimeoutError:
                self._process.kill()

    # ── Core HTTP API (AXL real API — see docs/api.md) ────────────────────────

    def topology(self) -> dict:
        """GET /topology — returns our_public_key, peers[], tree[]."""
        req = urllib.request.Request(f"{self.base_url}/topology", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())

    def active_peers(self) -> list[str]:
        """Return peer IDs currently reachable on the mesh."""
        try:
            topo = self.topology()
            our = topo.get("our_public_key", "")
            ids: set[str] = set()
            for p in topo.get("peers", []):
                if p.get("up") and p.get("public_key"):
                    ids.add(p["public_key"])
            for t in topo.get("tree", []):
                pk = t.get("public_key")
                if pk:
                    ids.add(pk)
            ids.discard(our)
            return list(ids)
        except Exception:
            return []

    def send(self, peer_id: str, message: TalosMessage) -> bool:
        """POST /send with X-Destination-Peer-Id header + JSON body.

        Returns True on HTTP 200.
        """
        try:
            message.sender_peer_id = self._peer_id or message.sender_peer_id
            message.talos_id = message.talos_id or self.talos_id
            data = json.dumps(message.to_dict()).encode("utf-8")

            req = urllib.request.Request(
                f"{self.base_url}/send",
                data=data,
                method="POST",
            )
            req.add_header("X-Destination-Peer-Id", peer_id)
            req.add_header("Content-Type", "application/octet-stream")
            with urllib.request.urlopen(req, timeout=15):
                return True
        except Exception as exc:
            console.print(f"[dim yellow][axl] send → {peer_id[:8]}…: {exc}[/dim yellow]")
            return False

    def broadcast(self, message: TalosMessage) -> int:
        """Send message to all active peers. Returns count of successful sends."""
        peers = self.active_peers()
        return sum(1 for pid in peers if self.send(pid, message))

    def recv_all(self) -> list[tuple[str, TalosMessage]]:
        """GET /recv in a loop until 204 (queue empty).

        Returns list of (sender_peer_id, TalosMessage).
        AXL automatically routes MCP/A2A envelopes to ports 9003/9004 — they
        will never appear here.
        """
        results: list[tuple[str, TalosMessage]] = []
        while True:
            try:
                req = urllib.request.Request(f"{self.base_url}/recv", method="GET")
                with urllib.request.urlopen(req, timeout=10) as resp:
                    code = resp.status
                    hdrs = dict(resp.headers)
                    body = resp.read()

                if code == 204:
                    break
                if code != 200:
                    break

                sender = hdrs.get("X-From-Peer-Id", hdrs.get("x-from-peer-id", "unknown"))
                try:
                    msg = TalosMessage.from_dict(json.loads(body))
                    msg.sender_peer_id = sender
                    results.append((sender, msg))
                except Exception:
                    pass  # skip non-TalosMessage binary traffic
            except Exception:
                break
        return results

    def call_mcp(self, peer_id: str, service: str, method: str, params: dict) -> dict:
        """POST /mcp/{peer_id}/{service} — JSON-RPC forwarded over AXL to remote MCP service."""
        body = json.dumps({
            "jsonrpc": "2.0",
            "method": method,
            "id": 1,
            "params": params,
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{self.base_url}/mcp/{peer_id}/{service}",
            data=body,
            method="POST",
        )
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    # ── High-level Talos helpers ───────────────────────────────────────────────

    async def announce_service(
        self,
        service_name: str,
        price: float,
        description: str,
        wallet_address: str,
        api_url: str = "",
    ) -> dict:
        """Broadcast service offer to all active peers."""
        msg = TalosMessage.service_offer(
            talos_id=self.talos_id,
            service_name=service_name,
            price=price,
            description=description,
            wallet_address=wallet_address,
            api_url=api_url,
        )
        count = self.broadcast(msg)
        return {"announced_to": count, "service": service_name}

    def send_hello(self, name: str, category: str, wallet_address: str) -> int:
        """Broadcast hello to all peers. Returns peer count reached."""
        msg = TalosMessage.hello(
            talos_id=self.talos_id,
            name=name,
            category=category,
            wallet_address=wallet_address,
        )
        return self.broadcast(msg)

    # ── Internal ──────────────────────────────────────────────────────────────

    async def _check_ready(self) -> bool:
        loop = asyncio.get_running_loop()
        try:
            topo = await loop.run_in_executor(None, self._sync_topology)
            return topo is not None
        except Exception:
            return False

    def _sync_topology(self) -> dict | None:
        try:
            req = urllib.request.Request(f"{self.base_url}/topology", method="GET")
            with urllib.request.urlopen(req, timeout=2) as resp:
                return json.loads(resp.read())
        except Exception:
            return None

    async def _fetch_peer_id(self) -> str | None:
        loop = asyncio.get_running_loop()
        topo = await loop.run_in_executor(None, self._sync_topology)
        return topo.get("our_public_key") if topo else None

    def _ensure_config(self) -> Path | None:
        """Write ~/.talos-agent/axl/node-config.json if absent."""
        try:
            self._config_dir.mkdir(parents=True, exist_ok=True)
            cfg = self._config_dir / "node-config.json"
            if not cfg.exists():
                cfg.write_text(json.dumps({
                    "PrivateKeyPath": str(self._config_dir / "private.pem"),
                    "Peers": [_GENSYN_BOOTSTRAP],
                    "api_port": self.port,
                }, indent=2))
                console.print(f"[dim][axl] Config written to {cfg}[/dim]")
            return cfg
        except Exception as exc:
            console.print(f"[dim red][axl] Config error: {exc}[/dim red]")
            return None
