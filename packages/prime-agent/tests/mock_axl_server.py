"""
Mock AXL HTTP server — simulates the Gensyn AXL node API on localhost:9002.

Real AXL API (from docs):
  GET  /topology  → our_public_key, peers[], tree[]
  POST /send      → X-Destination-Peer-Id header + raw body → 200 OK
  GET  /recv      → next message or 204 if empty
  POST /mcp/{peer_id}/{service}  → JSON-RPC forwarded
  POST /a2a/{peer_id}            → Google A2A JSON-RPC

Usage:
  python tests/mock_axl_server.py        # runs on port 9002
  python tests/mock_axl_server.py 9003   # custom port
"""

import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from collections import deque

# ── State ──────────────────────────────────────────────────────────────────────

OUR_KEY = "a" * 64   # fake ed25519 public key (hex)
PEER_A   = "b" * 64  # simulated remote peer A
PEER_B   = "c" * 64  # simulated remote peer B

TOPOLOGY = {
    "our_public_key": OUR_KEY,
    "our_ipv6": "fd00::1",
    "peers": [
        {"public_key": PEER_A, "up": True,  "addr": "tls://10.0.0.1:9001"},
        {"public_key": PEER_B, "up": True,  "addr": "tls://10.0.0.2:9001"},
    ],
    "tree": [
        {"public_key": PEER_A},
        {"public_key": PEER_B},
    ],
}

# Inbound message queue (simulates messages from peers)
_inbound: deque = deque()
_sent: list = []
_lock = threading.Lock()


def _seed_inbound():
    """Pre-populate queue with some simulated incoming messages."""
    _inbound.append({
        "sender": PEER_A,
        "body": json.dumps({
            "proto": 1,
            "type": "hello",
            "talos_id": "peer-agent-vega",
            "sender_peer_id": PEER_A,
            "timestamp": int(time.time()),
            "payload": {
                "name": "Vega",
                "category": "Analytics",
                "wallet_address": "0x654eF102944ACed9939778072C298Ab725989204",
            },
        }).encode(),
    })
    _inbound.append({
        "sender": PEER_B,
        "body": json.dumps({
            "proto": 1,
            "type": "service_offer",
            "talos_id": "peer-agent-atlas",
            "sender_peer_id": PEER_B,
            "timestamp": int(time.time()),
            "payload": {
                "service_name": "trend_research",
                "price": 0.005,
                "description": "Research latest trends for a given market.",
                "wallet_address": "0xE1781Ab1866542Ea4e53389A037C12112743BAfD",
                "api_url": "https://talos-0g.vercel.app/api/talos/atlas/service",
            },
        }).encode(),
    })


# ── HTTP Handler ──────────────────────────────────────────────────────────────

class AXLHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        try:
            sys.stdout.buffer.write(f"[axl-mock] {fmt % args}\n".encode('utf-8'))
            sys.stdout.flush()
        except Exception:
            pass

    def _json(self, code: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _empty(self, code: int):
        self.send_response(code)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", "2")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        self.wfile.write(b"OK")

    def do_GET(self):
        if self.path == "/topology":
            self._json(200, TOPOLOGY)

        elif self.path == "/recv":
            with _lock:
                if _inbound:
                    msg = _inbound.popleft()
                    sender = msg["sender"]
                    body = msg["body"]
                    self.send_response(200)
                    self.send_header("Content-Type", "application/octet-stream")
                    self.send_header("Content-Length", str(len(body)))
                    self.send_header("X-From-Peer-Id", sender)
                    self.end_headers()
                    self.wfile.write(body)
                else:
                    self._empty(204)  # queue empty

        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        # Always read body fully before responding (prevents RemoteDisconnected)
        length = int(self.headers.get("Content-Length", 0))
        body = b""
        if length > 0:
            body = self.rfile.read(length)

        if self.path == "/send":
            dest = self.headers.get("X-Destination-Peer-Id", "unknown")
            try:
                msg = json.loads(body)
            except Exception:
                msg = {"raw": body.decode(errors="replace")}
            with _lock:
                _sent.append({"to": dest[:16], "msg": msg})
            sys.stdout.buffer.write(f"[axl-mock] send to {dest[:16]}... type={msg.get('type','?')}\n".encode('utf-8'))
            sys.stdout.flush()
            self._json(200, {"ok": True})

        elif self.path.startswith("/mcp/"):
            # /mcp/{peer_id}/{service}
            parts = self.path.split("/")
            peer = parts[2] if len(parts) > 2 else "?"
            service = parts[3] if len(parts) > 3 else "?"
            try:
                req = json.loads(body)
            except Exception:
                req = {}
            print(f"[axl-mock] MCP call to {peer[:16]}…/{service}: {req.get('method','?')}")
            self._json(200, {"jsonrpc": "2.0", "id": req.get("id", 1), "result": {"ok": True, "mock": True}})

        elif self.path.startswith("/a2a/"):
            peer = self.path.split("/")[2] if len(self.path.split("/")) > 2 else "?"
            print(f"[axl-mock] A2A call to {peer[:16]}…")
            self._json(200, {"jsonrpc": "2.0", "id": 1, "result": {"ok": True}})

        else:
            self._json(404, {"error": "not found"})


# ── Entry point ───────────────────────────────────────────────────────────────

def run(port: int = 9002):
    _seed_inbound()
    server = HTTPServer(("127.0.0.1", port), AXLHandler)
    print(f"[axl-mock] Mock AXL node running on http://127.0.0.1:{port}")
    print(f"[axl-mock] Our peer ID: {OUR_KEY[:16]}…")
    print(f"[axl-mock] Simulated peers: {PEER_A[:8]}… and {PEER_B[:8]}…")
    print(f"[axl-mock] {len(_inbound)} messages pre-loaded in inbound queue")
    print(f"[axl-mock] Ctrl+C to stop\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\n[axl-mock] Stopped. {len(_sent)} messages sent during session.")
        for s in _sent:
            print(f"  → {s['to']}… : {s['msg'].get('type','?')}")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9002
    run(port)
