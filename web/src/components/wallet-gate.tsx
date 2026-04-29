"use client";

import { useAccount, useDisconnect } from "wagmi";
import { ConnectKitButton, useModal } from "connectkit";

interface WalletGateProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export function WalletGate({
  children,
  title = "Connect Wallet to Continue",
  description = "This feature requires a connected EVM wallet on 0G Chain.",
}: WalletGateProps) {
  const { isConnected } = useAccount();
  const { setOpen } = useModal();

  if (isConnected) return <>{children}</>;

  return (
    <div className="max-w-lg mx-auto px-6 py-32 text-center">
      <div className="bg-surface border border-border p-10">
        <div className="text-muted text-xs mb-6 tracking-wider">[WALLET REQUIRED]</div>
        <div className="w-12 h-12 mx-auto mb-6 border border-border flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
            <path d="M18 12a2 2 0 0 0 0 4h4v-4h-4z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-accent mb-2">{title}</h2>
        <p className="text-sm text-muted mb-8 leading-relaxed">{description}</p>
        <button
          onClick={() => setOpen(true)}
          className="bg-accent text-background px-8 py-2.5 text-sm font-medium hover:bg-foreground transition-colors"
        >
          Connect Wallet
        </button>
        <p className="text-xs text-muted mt-6">
          MetaMask · Coinbase Wallet · WalletConnect · and more
        </p>
      </div>
    </div>
  );
}

// Compact connect button for header / inline use
export function ConnectButton({
  label = "Connect Wallet",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, isConnecting, show, address, truncatedAddress }) => {
        if (isConnected && address) {
          return (
            <button
              onClick={show}
              className={`border border-border px-3 py-1.5 text-xs text-foreground font-mono hover:bg-surface-hover transition-colors ${className}`}
            >
              {truncatedAddress}
            </button>
          );
        }
        return (
          <button
            onClick={show}
            disabled={isConnecting}
            className={`border border-border px-4 py-2 text-sm text-foreground hover:bg-surface-hover transition-colors disabled:opacity-50 ${className}`}
          >
            {isConnecting ? "Connecting..." : label}
          </button>
        );
      }}
    </ConnectKitButton.Custom>
  );
}

export function useWallet() {
  const { isConnected, address } = useAccount();
  const { disconnect } = useDisconnect();
  const { setOpen } = useModal();
  return {
    isConnected,
    address: address ?? null,
    connect: () => setOpen(true),
    disconnect,
  };
}
