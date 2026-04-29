"use client";

import { PropsWithChildren } from "react";
import { createConfig, http, WagmiProvider, useAccount } from "wagmi";
import { injected, metaMask, coinbaseWallet } from "wagmi/connectors";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider } from "connectkit";
import { ogChain } from "@/lib/og-chain";
import { sepolia } from "viem/chains";

export function useInterwovenKit() {
  const account = useAccount();
  return {
    address: account.address ?? null,
    walletAddress: account.address ?? null,
    isConnected: account.isConnected,
  };
}

const connectors = [
  injected(),
  metaMask(),
  coinbaseWallet({ appName: "Talos Protocol" }),
];

export const wagmiConfig = createConfig({
  connectors,
  chains: [ogChain, sepolia],
  transports: {
    [ogChain.id]: http(ogChain.rpcUrls.default.http[0]),
    [sepolia.id]: http("https://ethereum-sepolia-rpc.publicnode.com"),
  },
});

const queryClient = new QueryClient();

// ConnectKit custom theme matching Talos design (light pinkish, monospace)
const connectKitTheme = {
  "--ck-font-family": "'ui-monospace', 'Cascadia Code', 'Source Code Pro', monospace",
  "--ck-border-radius": "0px",
  "--ck-overlay-background": "rgba(252, 248, 248, 0.85)",
  "--ck-body-background": "#FCF8F8",
  "--ck-body-background-secondary": "#FBEFEF",
  "--ck-body-background-tertiary": "#F9DFDF",
  "--ck-body-color": "#2D2D2D",
  "--ck-body-color-muted": "#8E8383",
  "--ck-body-color-muted-hover": "#2D2D2D",
  "--ck-primary-button-background": "#F5AFAF",
  "--ck-primary-button-hover-background": "#2D2D2D",
  "--ck-primary-button-color": "#2D2D2D",
  "--ck-primary-button-hover-color": "#FCF8F8",
  "--ck-secondary-button-background": "#FBEFEF",
  "--ck-secondary-button-hover-background": "#F9DFDF",
  "--ck-secondary-button-color": "#2D2D2D",
  "--ck-focus-color": "#F5AFAF",
  "--ck-body-divider": "#F9DFDF",
  "--ck-tooltip-background": "#FCF8F8",
  "--ck-tooltip-color": "#2D2D2D",
  "--ck-modal-box-shadow": "0 0 0 1px #F9DFDF",
  "--ck-qr-dot-color": "#2D2D2D",
  "--ck-qr-background": "#FCF8F8",
} as Record<string, string>;

export function Providers({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={wagmiConfig}>
        <ConnectKitProvider
          customTheme={connectKitTheme}
          options={{
            initialChainId: 0,
            enforceSupportedChains: false,
            embedGoogleFonts: false,
            hideTooltips: false,
            hideQuestionMarkCTA: true,
            hideNoWalletCTA: false,
            walletConnectCTA: "link",
            avoidLayoutShift: true,
          }}
        >
          {children}
        </ConnectKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  );
}
