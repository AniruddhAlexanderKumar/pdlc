"use client";

import React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  Key,
  Layers,
  RefreshCw,
  Server,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/common/page-header";
import { OFFICIAL_INTEGRATIONS_CATALOG, type IntegrationProvider } from "@/domain/integration";
import { useOfficialIntegrations } from "@/lib/api/integrations";
import { formatIsoDate } from "@/lib/utils";

export function IntegrationsView() {
  const { integrations, activeCatalogItems, toggleConnection, syncStoreCatalog } = useOfficialIntegrations();
  const [selectedProvider, setSelectedProvider] = React.useState<IntegrationProvider | null>(null);
  const [apiKeyInput, setApiKeyInput] = React.useState("");
  const [partnerIdInput, setPartnerIdInput] = React.useState("");
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const handleOpenConnectModal = (provider: IntegrationProvider) => {
    setSelectedProvider(provider);
    setApiKeyInput("");
    setPartnerIdInput(provider === "AMAZON_STORE" ? "AMZN-BUS-90412" : "");
    setIsModalOpen(true);
  };

  const handleSaveConnection = () => {
    if (selectedProvider) {
      const intObj = integrations.find((i) => i.provider === selectedProvider);
      if (intObj) {
        toggleConnection(intObj.id, apiKeyInput);
      }
    }
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Official Integrations & Store Connectors"
        description="Connect Amazon Store & Business API, DigiKey, Mouser, McMaster-Carr, and enterprise ERP store gateways to map component procurement directly into your relational product graph."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncStoreCatalog("AMAZON_STORE")}
            className="gap-1.5"
          >
            <RefreshCw className="size-3.5" /> Sync Amazon Store API
          </Button>
        }
      />

      {/* Hero Integration Highlight */}
      <Card className="border-primary/30 bg-gradient-to-r from-primary/5 via-card to-card">
        <CardContent className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-6">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShoppingCart className="size-6" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-foreground">Amazon Store & Business API Connected</h3>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-mono">
                  Active Sync
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground max-w-2xl">
                ASIN hardware lookup, stock verification, and price tracking synced live. 14 items currently linked to requirements & supplied item artifacts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="default"
              size="sm"
              onClick={() => handleOpenConnectModal("AMAZON_STORE")}
              className="gap-1.5"
            >
              <Key className="size-3.5" /> Configure Amazon API Keys
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Catalog of Official Store & Supplier Integrations */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Available Official Integrations</h2>
          <span className="text-xs font-mono text-muted-foreground">{integrations.filter((i) => i.status === "CONNECTED").length} / {integrations.length} Active</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {OFFICIAL_INTEGRATIONS_CATALOG.map((catalogItem) => {
            const state = integrations.find((i) => i.provider === catalogItem.provider);
            const isConnected = state?.status === "CONNECTED";
            const isSyncing = state?.status === "SYNCING";

            return (
              <Card key={catalogItem.provider} className="flex flex-col justify-between transition-colors hover:border-primary/50">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      {catalogItem.category}
                    </Badge>
                    <Badge
                      variant={isConnected ? "outline" : "secondary"}
                      className={isConnected ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[10px]" : "text-[10px]"}
                    >
                      {isConnected ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>
                  <CardTitle className="mt-2 text-sm font-bold flex items-center gap-1.5">
                    {catalogItem.provider === "AMAZON_STORE" && <ShoppingBag className="size-4 text-amber-500" />}
                    {catalogItem.name}
                  </CardTitle>
                  <CardDescription className="text-xs line-clamp-2">
                    {catalogItem.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0 flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-mono pt-2 border-t border-border">
                    <span>Mapped Items: <strong className="text-foreground">{state?.itemsMappedCount ?? 0}</strong></span>
                    <span>{state?.lastSyncAt ? `Synced ${formatIsoDate(state.lastSyncAt.toISOString())}` : "Never"}</span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Button
                      variant={isConnected ? "outline" : "default"}
                      size="sm"
                      disabled={isSyncing}
                      onClick={() => handleOpenConnectModal(catalogItem.provider)}
                      className="w-full text-xs gap-1.5"
                    >
                      {isSyncing ? (
                        <>
                          <RefreshCw className="size-3 animate-spin" /> Syncing...
                        </>
                      ) : isConnected ? (
                        "Manage Credentials"
                      ) : (
                        "Connect Integration"
                      )}
                    </Button>
                    {isConnected && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => syncStoreCatalog(catalogItem.provider)}
                        title="Sync now"
                        className="px-2"
                      >
                        <RefreshCw className="size-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Live Synced Amazon & Store Catalog Preview */}
      <section className="flex flex-col gap-4">
        <h2 className="text-base font-semibold tracking-tight text-foreground">Live Synced Store Catalog Items</h2>
        
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-1 divide-y divide-border">
            {activeCatalogItems.map((item) => (
              <div key={item.asinOrSku} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary font-mono text-xs font-bold">
                    {item.asinOrSku.slice(0, 4)}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                      {item.title}
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {item.asinOrSku}
                      </Badge>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {item.manufacturer} • Category: {item.category}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 sm:self-center">
                  <div className="flex flex-col text-right">
                    <span className="text-sm font-mono font-bold text-foreground">{item.price}</span>
                    <span className="text-[10px] text-emerald-600 font-semibold uppercase">{item.availability.replace("_", " ")}</span>
                  </div>

                  <Button asChild variant="outline" size="sm" className="gap-1 text-xs">
                    <a href={item.storeUrl} target="_blank" rel="noopener noreferrer">
                      Store Link <ExternalLink className="size-3" />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* API Credential Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="size-4 text-primary" />
              Configure {selectedProvider ? OFFICIAL_INTEGRATIONS_CATALOG.find((c) => c.provider === selectedProvider)?.name : "Integration"}
            </DialogTitle>
            <DialogDescription>
              Enter API credentials, Seller Partner ID, or Private API keys to enable automated store sync.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">API Access Key / Bearer Token</label>
              <Input
                type="password"
                placeholder="amzn.sp-api.token.xxxxxxxxx..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
            </div>

            {selectedProvider === "AMAZON_STORE" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-foreground">Amazon Seller / Business Partner ID</label>
                <Input
                  type="text"
                  placeholder="AMZN-BUS-US-XXXXX"
                  value={partnerIdInput}
                  onChange={(e) => setPartnerIdInput(e.target.value)}
                />
              </div>
            )}

            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground flex items-center gap-1">
                <ShieldCheck className="size-3.5 text-emerald-500" /> Air-Gapped Key Storage
              </span>
              Credentials are saved securely in your self-hosted instance and never transmitted to external third parties.
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveConnection}>
              Save Connection
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
