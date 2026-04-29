"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { WalletGate, useWallet } from "@/components/wallet-gate";
import { isNameAvailableOnChain } from "@/lib/cosmwasm";
import { useWriteContract, usePublicClient, useSwitchChain, useChainId } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS, ogChain } from "@/lib/og-chain";
import { parseAbiItem, decodeEventLog } from "viem";

const STEPS = [
  "Product",
  "Patron",
  "Mitos",
  "Kernel",
  "Agent",
  "Review",
] as const;

const CHANNELS = ["X (Twitter)", "LinkedIn", "Reddit", "Product Hunt"];

export default function LaunchPage() {
  return (
    <WalletGate
      title="Connect Wallet to Launch"
      description="Creating a TALOS requires an EVM wallet on 0G Chain. Your address will be registered as the Creator."
    >
      <LaunchForm />
    </WalletGate>
  );
}

function LaunchForm() {
  const { address } = useWallet();
  const router = useRouter();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: ogChain.id });
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    productName: "",
    productDesc: "",
    category: "marketing",
    tokenName: "",
    tokenSymbol: "",
    totalSupply: "1000000",
    initialPrice: "0.01",
    approvalThreshold: "10",
    gtmBudget: "100",
    persona: "",
    targetAudience: "",
    tone: "professional",
    creatorWallet: "",
    channels: ["X (Twitter)"] as string[],
    agentName: "",
    serviceName: "",
    serviceDescription: "",
    servicePrice: "",
    serviceCurrency: "A0GI" as const,
  });
  const [nameAvailable, setNameAvailable] = useState<boolean | null>(null);
  const [nameChecking, setNameChecking] = useState(false);
  const [deployStep, setDeployStep] = useState<string | null>(null);
  const [deployProgress, setDeployProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [genesisResult, setGenesisResult] = useState<{
    talosId: string;
    apiKey: string;
    onChainId: number | null;
    agentName: string;
  } | null>(null);

  const update = (key: string, value: string | number | string[]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkNameAvailability = useCallback((name: string) => {
    if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current);
    if (!name || name.length < 3) {
      setNameAvailable(null);
      setNameChecking(false);
      return;
    }
    setNameChecking(true);
    nameCheckTimer.current = setTimeout(async () => {
      try {
        const [onChainAvailable, dbResult] = await Promise.all([
          isNameAvailableOnChain(name),
          fetch(`/api/talos/check-name?name=${encodeURIComponent(name)}`)
            .then((r) => r.json())
            .then((d) => d.available as boolean)
            .catch(() => true),
        ]);
        setNameAvailable(onChainAvailable && dbResult);
      } catch {
        const valid = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name) && !/--/.test(name);
        setNameAvailable(valid);
      } finally {
        setNameChecking(false);
      }
    }, 400);
  }, []);

  const canNext = () => {
    switch (step) {
      case 0:
        return form.productName && form.productDesc;
      case 1:
        return true;
      case 2: {
        const sym = form.tokenSymbol.trim();
        const supply = Number(form.totalSupply);
        const price = Number(form.initialPrice);
        return (
          form.tokenName.trim().length > 0 &&
          sym.length >= 2 && sym.length <= 8 &&
          /^[A-Za-z][A-Za-z0-9]*$/.test(sym) &&
          supply > 0 && supply <= 100_000_000 &&
          price > 0 && price <= 1_000_000
        );
      }
      case 3:
        return form.approvalThreshold && form.gtmBudget;
      case 4:
        return form.persona && form.targetAudience && form.channels.length > 0
          && form.agentName.length >= 3 && nameAvailable === true;
      default:
        return true;
    }
  };

  const handleLaunch = async () => {
    if (!address) return;
    setSubmitting(true);
    setError(null);
    setDeployStep(null);
    setDeployProgress(0);

    try {
      const creatorAddr = form.creatorWallet || address!;

      // 1. Add + switch to 0G Galileo (wallet_addEthereumChain handles both)
      setDeployStep("Adding 0G Galileo to wallet...");
      setDeployProgress(1);
      if (chainId !== ogChain.id) {
        const eth = (window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }).ethereum;
        if (eth) {
          const chainHex = "0x" + ogChain.id.toString(16);
          try {
            // Try switch first (faster if already added)
            await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainHex }] });
          } catch {
            // Not added yet — add and switch
            await eth.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: chainHex,
                chainName: ogChain.name,
                nativeCurrency: ogChain.nativeCurrency,
                rpcUrls: [ogChain.rpcUrls.default.http[0]],
                blockExplorerUrls: [ogChain.blockExplorers?.default.url ?? ""],
              }],
            });
          }
        } else {
          await switchChainAsync({ chainId: ogChain.id });
        }
      }

      // 2. User signs createTalos() on 0G Chain
      setDeployStep("Sign the transaction in your wallet...");
      setDeployProgress(2);

      const minPulse = Math.floor(Number(form.totalSupply) / 1000);
      const txHash = await writeContractAsync({
        address: REGISTRY_ADDRESS as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: "createTalos",
        args: [
          form.productName,
          form.category.charAt(0).toUpperCase() + form.category.slice(1),
          form.productDesc,
          {
            creatorShare: 0,
            investorShare: 0,
            treasuryShare: 100,
            creatorAddr,
            investorAddr: "",
            treasuryAddr: "",
          },
          {
            approvalThreshold: BigInt(Math.floor(Number(form.approvalThreshold))),
            gtmBudget: BigInt(Math.floor(Number(form.gtmBudget))),
            minPatronPulse: BigInt(minPulse),
          },
          {
            totalSupply: BigInt(Number(form.totalSupply)),
            priceA0gi: BigInt(0),
            tokenSymbol: form.tokenSymbol?.toUpperCase() || "",
          },
        ],
        chainId: ogChain.id,
      });

      // 3. Wait for confirmation, extract onChainId from TalosCreated event
      setDeployStep("Waiting for 0G Chain confirmation...");
      setDeployProgress(3);

      let onChainId: number | null = null;
      if (publicClient) {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 60_000 });
          for (const log of receipt.logs) {
            try {
              const decoded = decodeEventLog({
                abi: REGISTRY_ABI,
                eventName: "TalosCreated",
                data: log.data,
                topics: log.topics,
              });
              onChainId = Number((decoded.args as { talosId: bigint }).talosId);
              break;
            } catch { /* not this log */ }
          }
          // Fallback: read nextId
          if (onChainId === null) {
            const nextId = await publicClient.readContract({
              address: REGISTRY_ADDRESS as `0x${string}`,
              abi: REGISTRY_ABI,
              functionName: "nextId",
            });
            onChainId = Number(nextId as bigint) - 1;
          }
        } catch {
          // Receipt timeout — continue without onChainId, will be resolved later
        }
      }

      // 4. Save to DB (backend will register name + ENS async)
      setDeployStep("Saving to database...");
      setDeployProgress(4);

      const res = await fetch("/api/talos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.productName,
          category: form.category.charAt(0).toUpperCase() + form.category.slice(1),
          description: form.productDesc,
          totalSupply: Number(form.totalSupply),
          persona: form.persona,
          targetAudience: form.targetAudience,
          channels: form.channels,
          toneVoice: form.tone,
          approvalThreshold: Number(form.approvalThreshold),
          gtmBudget: Number(form.gtmBudget),
          initialPrice: Number(form.initialPrice),
          minPatronPulse: minPulse,
          creatorPublicKey: creatorAddr,
          walletPublicKey: address,
          onChainId,               // already registered by user
          onChainTxHash: txHash,   // user's tx hash
          agentName: form.agentName,
          tokenCode: form.tokenSymbol.toUpperCase() || undefined,
          tokenSymbol: form.tokenSymbol,
          ...(form.serviceName && form.servicePrice
            ? {
                serviceName: form.serviceName,
                serviceDescription: form.serviceDescription || undefined,
                servicePrice: Number(form.servicePrice),
              }
            : {}),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to save TALOS");
      }

      const dbData = await res.json();

      // 5. NameService registration (operator — backend async)
      setDeployStep("Registering on 0G NameService...");
      setDeployProgress(5);
      await new Promise(r => setTimeout(r, 1200));

      // 6. ENS identity (operator mints + transfers to agent wallet)
      setDeployStep("Minting ENS identity: " + (form.agentName ? `${form.agentName}.talos.eth` : "agent.talos.eth") + "...");
      setDeployProgress(6);
      await new Promise(r => setTimeout(r, 1500));

      setGenesisResult({
        talosId: dbData.id,
        apiKey: dbData.apiKeyOnce,
        onChainId: dbData.onChainId ?? null,
        agentName: form.agentName,
      });
    } catch (err) {
      console.error("[Launch] Error:", err);
      const raw = err instanceof Error ? err.message : "Deployment failed";
      let message = raw;
      if (raw.includes("User declined") || raw.includes("user rejected") || raw.includes("rejected the request"))
        message = "Transaction cancelled. Please approve it in your wallet.";
      else if (raw.includes("insufficient") || raw.includes("balance"))
        message = "Insufficient A0GI balance. Get testnet tokens from the 0G faucet.";
      else if (raw.length > 200)
        message = "Deployment failed. Please try again or contact support.";
      setError(message);
    } finally {
      setSubmitting(false);
      setDeployStep(null);
      setDeployProgress(0);
    }
  };

  if (genesisResult) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="text-xs text-accent font-bold mb-2">[GENESIS COMPLETE]</div>
          <h1 className="text-2xl font-bold text-accent">TALOS Launched Successfully</h1>
        </div>

        <div className="bg-surface border border-accent/30 p-8 mb-6 space-y-6">
          {genesisResult.onChainId !== null && (
            <div className="flex items-center gap-3 text-accent font-bold">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span className="text-sm font-medium">On-chain registration confirmed (ID: {genesisResult.onChainId})</span>
            </div>
          )}

          <div>
            <div className="text-xs text-muted mb-2">Agent Identity</div>
            <div className="text-foreground font-mono text-sm">{genesisResult.agentName}.talos.eth</div>
          </div>

          <div>
            <div className="text-xs text-accent font-bold mb-2">API Key (shown only once — save it now)</div>
            <div className="bg-background border border-border p-3 font-mono text-xs text-accent break-all select-all">
              {genesisResult.apiKey}
            </div>
          </div>

          <div>
            <div className="text-xs text-muted mb-4">Run your Prime Agent</div>
            <div className="bg-background border border-border p-4 text-xs text-foreground space-y-1 overflow-x-auto">
              <div className="text-muted"># 1. Install the agent CLI</div>
              <div>pip install talos-agent</div>
              <div className="text-muted mt-3"># 2. Set your API key</div>
              <div>export TALOS_API_KEY=&quot;{genesisResult.apiKey}&quot;</div>
              <div className="text-muted mt-3"># 3. (Optional) Use 0G Compute for decentralised AI inference</div>
              <div className="text-green-400"># Get your key at compute.0g.ai → replace Groq with verifiable on-chain AI</div>
              <div>export OG_COMPUTE_API_KEY=&quot;your-0g-compute-key&quot;</div>
              <div className="text-muted mt-3"># 4. Start your Prime Agent</div>
              <div>talos-agent start --talos-id {genesisResult.talosId}</div>
            </div>
          </div>

          <div className="border border-border p-4 text-xs space-y-2">
            <div className="text-accent font-bold mb-1">[0G COMPUTE] Decentralised AI Inference</div>
            <div className="text-muted">Your agent runs on <span className="text-foreground">Groq</span> by default (free). Upgrade to <span className="text-accent">0G Compute</span> for verifiable, sealed AI inference on-chain.</div>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-muted">Default LLM</span><span className="text-foreground">Groq — llama-3.3-70b (free)</span></div>
              <div className="flex justify-between"><span className="text-muted">0G Compute</span><span className="text-foreground">qwen3-235b-a22b · GLM-4-9B · Qwen2.5-72B</span></div>
              <div className="flex justify-between"><span className="text-muted">Get API key</span><a href="https://compute.0g.ai" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">compute.0g.ai →</a></div>
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <button
            onClick={() => {
              navigator.clipboard.writeText(genesisResult.apiKey).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            className={`px-6 py-2.5 text-sm border transition-colors ${
              copied ? "border-accent text-accent font-bold" : "border-border text-foreground hover:bg-surface-hover"
            }`}
          >
            {copied ? "Copied!" : "Copy API Key"}
          </button>
          <button
            onClick={() => router.push(`/agents/${genesisResult.talosId}`)}
            className="px-8 py-2.5 text-sm bg-accent text-background font-medium hover:bg-foreground transition-colors"
          >
            View TALOS &rarr;
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <div className="text-xs text-muted mb-2">[TALOS GENESIS]</div>
          <h1 className="text-2xl font-bold text-accent">Launch your TALOS</h1>
        </div>
        <button
          onClick={() => {
            setForm({
              productName: "Nexus",
              productDesc: "AI-powered payment agent that automates invoicing, subscription billing, and cross-border settlements. Integrates with major payment rails and provides real-time treasury analytics for Web3 businesses.",
              category: "finance",
              tokenName: "Nexus Mitos",
              tokenSymbol: "NEXUS",
              totalSupply: "1000000",
              initialPrice: "0.50",
              approvalThreshold: "100",
              gtmBudget: "500",
              persona: "A sharp, data-driven fintech strategist who speaks with authority on payments infrastructure. Combines deep technical knowledge with clear, actionable insights. Always backs claims with numbers.",
              targetAudience: "Web3 founders, CFOs, and treasury managers who need automated payment operations and real-time financial visibility.",
              tone: "professional",
              creatorWallet: "",
              channels: ["X (Twitter)", "LinkedIn"],
              agentName: "nexus",
              serviceName: "Payment Automation",
              serviceDescription: "Automates invoice generation, payment routing, and settlement reconciliation. Send a payment request and receive a fully processed transaction with compliance checks.",
              servicePrice: "2.50",
              serviceCurrency: "A0GI",
            });
            checkNameAvailability("nexus");
            setStep(0);
          }}
          className="px-4 py-2 text-xs border border-accent/30 text-accent hover:bg-surface-hover transition-colors"
        >
          Demo: Nexus
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-10 overflow-x-auto">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => i <= step && setStep(i)}
            className={`px-3 py-1.5 text-xs border transition-colors whitespace-nowrap ${
              i === step
                ? "border-accent text-accent bg-surface"
                : i < step
                ? "border-border text-foreground bg-surface cursor-pointer hover:bg-surface-hover"
                : "border-border text-muted bg-background cursor-default"
            }`}
          >
            {String(i + 1).padStart(2, "0")} {s}
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="bg-surface border border-border p-8 mb-6">
        {step === 0 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-accent mb-1">Product Input</h2>
            <p className="text-sm text-muted mb-6">
              Register your product. Your Prime Agent will handle GTM and service delivery.
            </p>
            <Field label="Product Name" value={form.productName} onChange={(v) => update("productName", v)} placeholder="e.g. ImageGen Pro" />
            <Field label="Description" value={form.productDesc} onChange={(v) => update("productDesc", v)} placeholder="What does your product do? Who is it for?" multiline />
            <div>
              <label className="block text-xs text-muted mb-2">Category</label>
              <select
                value={form.category}
                onChange={(e) => update("category", e.target.value)}
                className="w-full bg-background border border-border px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent"
              >
                <option value="marketing">Marketing</option>
                <option value="development">Development</option>
                <option value="research">Research</option>
                <option value="design">Design</option>
                <option value="finance">Finance</option>
                <option value="analytics">Analytics</option>
                <option value="operations">Operations</option>
                <option value="sales">Sales</option>
                <option value="support">Support</option>
                <option value="education">Education</option>
              </select>
            </div>

            <div className="pt-4 mt-2 border-t border-border">
              <div className="text-xs text-accent mb-1">[COMMERCE SERVICE]</div>
              <p className="text-xs text-muted mb-4">
                Define the paid service your agent offers to other agents via the x402 protocol. Optional — you can add this later.
              </p>
              <div className="space-y-4">
                <Field label="Service Name" value={form.serviceName} onChange={(v) => update("serviceName", v)} placeholder="e.g. SEO Content Generation" />
                <Field label="Service Description" value={form.serviceDescription} onChange={(v) => update("serviceDescription", v)} placeholder="What does this service do? What input/output should callers expect?" multiline />
                <div>
                  <label className="block text-xs text-muted mb-2">Price per Request (A0GI)</label>
                  <input
                    type="number"
                    value={form.servicePrice}
                    onChange={(e) => update("servicePrice", e.target.value)}
                    placeholder="e.g. 5.00"
                    className="w-full bg-background border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-accent mb-1">Patron Configuration</h2>
            <p className="text-sm text-muted mb-6">
              The Creator is your EVM wallet address. It is permanently linked to this TALOS and cannot be changed.
            </p>
            <div>
              <label className="block text-xs text-muted mb-2">Creator Address (0G Chain)</label>
              <div className="w-full bg-background border border-border px-4 py-2.5 text-sm text-foreground/70 font-mono select-all break-all">
                {form.creatorWallet || address || "—"}
              </div>
              <p className="text-xs text-muted mt-1">This EVM address will be registered as the TALOS Creator on 0G Chain.</p>
            </div>
            <div className="p-4 border border-border bg-background">
              <div className="text-xs text-accent mb-2">[REVENUE MODEL]</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Agent Treasury</span>
                  <span className="text-foreground font-medium">100%</span>
                </div>
              </div>
              <p className="text-xs text-muted mt-3">All A0GI revenue flows to the Agent Treasury controlled by the Creator.</p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-accent mb-1">Mitos Configuration</h2>
            <p className="text-sm text-muted mb-6">
              Configure your TALOS&apos;s Mitos token on 0G Chain.
            </p>
            <Field label="Token Name" value={form.tokenName} onChange={(v) => update("tokenName", v)} placeholder="e.g. ImageGen Mitos" />
            <div>
              <Field label="Token Symbol" value={form.tokenSymbol} onChange={(v) => update("tokenSymbol", v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="e.g. IMGS" />
              <p className="text-xs text-muted mt-1">2-8 characters, letters and numbers only.</p>
            </div>
            <div>
              <Field label="Total Supply" value={form.totalSupply} onChange={(v) => update("totalSupply", v)} type="number" />
              <p className="text-xs text-muted mt-1">Max 100,000,000</p>
            </div>
            <div>
              <Field label="Initial Price (A0GI)" value={form.initialPrice} onChange={(v) => update("initialPrice", v)} type="number" />
              <p className="text-xs text-muted mt-1">Price per Mitos token in A0GI on 0G Chain</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-accent mb-1">Kernel Policy</h2>
            <p className="text-sm text-muted mb-6">
              Set the governance rules for your agent.
            </p>
            <Field label="Approval Threshold (A0GI)" value={form.approvalThreshold} onChange={(v) => update("approvalThreshold", v)} type="number" placeholder="Transactions above this require approval" />
            <Field label="GTM Budget (A0GI/month)" value={form.gtmBudget} onChange={(v) => update("gtmBudget", v)} type="number" placeholder="Monthly budget for GTM activities" />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-accent mb-1">Prime Agent Setup</h2>
            <p className="text-sm text-muted mb-6">
              Configure your AI agent&apos;s identity and personality.
            </p>
            <div>
              <label className="block text-xs text-muted mb-2">Agent Identity (immutable)</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={form.agentName}
                  onChange={(e) => {
                    const v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                    update("agentName", v);
                    checkNameAvailability(v);
                  }}
                  placeholder="e.g. marketbot"
                  className="flex-1 bg-background border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent"
                />
                <span className="text-sm text-muted">.talos.eth</span>
              </div>
              <div className="mt-1.5 text-xs">
                {nameChecking && <span className="text-muted">Checking...</span>}
                {!nameChecking && nameAvailable === true && form.agentName.length >= 3 && (
                  <span className="text-accent font-bold">{form.agentName}.talos.eth is available</span>
                )}
                {!nameChecking && nameAvailable === false && (
                  <span className="text-red-600 font-bold">{form.agentName}.talos.eth is taken</span>
                )}
                {!nameChecking && nameAvailable === null && form.agentName.length > 0 && form.agentName.length < 3 && (
                  <span className="text-muted">Minimum 3 characters</span>
                )}
              </div>
              <p className="text-xs text-muted mt-1">Your agent&apos;s ENS identity on Ethereum Sepolia. Cannot be changed after registration.</p>
            </div>
            <Field label="Persona" value={form.persona} onChange={(v) => update("persona", v)} placeholder="e.g. A sharp, witty tech commentator" multiline />
            <Field label="Target Audience" value={form.targetAudience} onChange={(v) => update("targetAudience", v)} placeholder="e.g. Indie developers building SaaS products" />
            <div>
              <label className="block text-xs text-muted mb-2">Tone</label>
              <select
                value={form.tone}
                onChange={(e) => update("tone", e.target.value)}
                className="w-full bg-background border border-border px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent"
              >
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="witty">Witty</option>
                <option value="technical">Technical</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted mb-2">GTM Channels</label>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => {
                      const channels = form.channels.includes(ch)
                        ? form.channels.filter((c) => c !== ch)
                        : [...form.channels, ch];
                      update("channels", channels);
                    }}
                    className={`px-3 py-1.5 text-xs border transition-colors ${
                      form.channels.includes(ch)
                        ? "border-accent text-accent bg-surface"
                        : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-accent mb-1">Review & Deploy</h2>
            <p className="text-sm text-muted mb-6">
              Confirm your TALOS configuration before deployment on 0G Chain.
            </p>
            <div className="space-y-4 text-sm">
              <ReviewRow label="Product" value={form.productName} />
              <ReviewRow label="Category" value={form.category} />
              <ReviewRow label="Token" value={`${form.tokenName} (${form.tokenSymbol})`} />
              <ReviewRow label="Supply" value={Number(form.totalSupply).toLocaleString()} />
              <ReviewRow label="Price" value={`${form.initialPrice} A0GI`} />
              <ReviewRow label="Agent Identity" value={`${form.agentName}.talos.eth`} />
              <ReviewRow label="Revenue Model" value="100% Agent Treasury (no external distribution)" />
              <ReviewRow label="Creator (0G Chain)" value={form.creatorWallet || address || ""} />
              <ReviewRow label="Approval" value={`> ${form.approvalThreshold} A0GI`} />
              <ReviewRow label="Budget" value={`${form.gtmBudget} A0GI/mo`} />
              <ReviewRow label="Persona" value={form.persona} />
              <ReviewRow label="Audience" value={form.targetAudience} />
              <ReviewRow label="Channels" value={form.channels.join(", ")} />
              {form.serviceName && (
                <>
                  <ReviewRow label="Service" value={form.serviceName} />
                  <ReviewRow label="Service Price" value={form.servicePrice ? `${form.servicePrice} A0GI` : "—"} />
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {submitting && (
        <div className="mb-6 border border-accent/30 bg-surface p-6">
          <div className="flex items-center gap-3 mb-4">
            <svg className="animate-spin h-4 w-4 text-accent shrink-0" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm text-accent font-mono">{deployStep || "Preparing..."}</span>
          </div>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 transition-all duration-500 ${
                  s < deployProgress
                    ? "bg-accent"
                    : s === deployProgress
                    ? "bg-accent animate-pulse"
                    : "bg-border"
                }`}
              />
            ))}
          </div>
          <div className="grid grid-cols-6 mt-1.5 text-[9px] text-muted font-mono tracking-tight">
            <span>Network</span>
            <span className="text-center">Sign</span>
            <span className="text-center">Confirm</span>
            <span className="text-center">Save</span>
            <span className="text-center">NameSvc</span>
            <span className="text-right">ENS</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 border border-red-600 bg-red-100/50 px-4 py-3 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="px-6 py-2.5 text-sm border border-border text-foreground hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-default"
        >
          Back
        </button>
        {step < 5 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext()}
            className="px-6 py-2.5 text-sm bg-accent text-background font-medium hover:bg-foreground transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleLaunch}
            disabled={submitting}
            className="px-8 py-2.5 text-sm bg-accent text-background font-medium hover:bg-foreground transition-colors disabled:opacity-50"
          >
            {submitting ? (deployStep || "Deploying...") : "Launch TALOS"}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
}) {
  const cls =
    "w-full bg-background border border-border px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent";
  return (
    <div>
      <label className="block text-xs text-muted mb-2">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${cls} resize-none`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-border">
      <span className="text-muted">{label}</span>
      <span className="text-foreground text-right max-w-[60%] break-all">{value || "—"}</span>
    </div>
  );
}
