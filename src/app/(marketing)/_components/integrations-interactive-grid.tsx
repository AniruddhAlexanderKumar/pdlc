"use client";

import * as React from "react";
import {
  ShoppingCart,
  Cpu,
  Building2,
  Layers,
  FileText,
  Server,
  CheckCircle2,
  Zap,
  Filter
} from "lucide-react";
import { cn } from "@/lib/utils";

interface IntegrationItem {
  id: string;
  name: string;
  category: "store" | "plm" | "req";
  syncType: string;
  status: "LIVE CONNECTED" | "READY";
  icon: React.ElementType;
  color: string;
}

const INITIAL_INTEGRATIONS: IntegrationItem[] = [
  { id: "amz", name: "AMAZON STORE API", category: "store", syncType: "ASIN & Part Availability Sync", status: "LIVE CONNECTED", icon: ShoppingCart, color: "text-amber-400" },
  { id: "dk", name: "DIGIKEY API", category: "store", syncType: "IC Electrical Specs & Stock", status: "LIVE CONNECTED", icon: Cpu, color: "text-red-400" },
  { id: "ms", name: "MOUSER ELECTRONICS", category: "store", syncType: "Component Datasheets & Price", status: "LIVE CONNECTED", icon: Building2, color: "text-cyan-400" },
  { id: "mc", name: "MCMASTER-CARR", category: "store", syncType: "Hardware CAD Models & Stock", status: "LIVE CONNECTED", icon: Layers, color: "text-emerald-400" },
  { id: "doors", name: "IBM DOORS", category: "req", syncType: "Legacy Requirement Spec Import", status: "READY", icon: FileText, color: "text-indigo-400" },
  { id: "jira", name: "JIRA / CONFLUENCE", category: "req", syncType: "Issue & Change Ticket Graph", status: "READY", icon: FileText, color: "text-blue-400" },
  { id: "siemens", name: "SIEMENS PLM / TEAMCENTER", category: "plm", syncType: "Assembly Tree Graph Sync", status: "READY", icon: Server, color: "text-purple-400" },
  { id: "ansys", name: "ANSYS SIMULATION", category: "plm", syncType: "FEA Test Result Data Link", status: "READY", icon: Server, color: "text-amber-400" },
];

export function IntegrationsInteractiveGrid() {
  const [filter, setFilter] = React.useState<"all" | "store" | "plm" | "req">("all");
  const [items, setItems] = React.useState<IntegrationItem[]>(INITIAL_INTEGRATIONS);

  const toggleConnect = (id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          status: item.status === "LIVE CONNECTED" ? "READY" : "LIVE CONNECTED",
        };
      })
    );
  };

  const filteredIntegrations = items.filter(
    (item) => filter === "all" || item.category === filter
  );

  return (
    <div className="w-full flex flex-col gap-6 font-mono text-xs">
      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-4">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-2 flex items-center gap-1.5">
          <Filter className="size-3 text-cyan-400" /> FILTER CONNECTORS:
        </span>
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "px-3.5 py-1.5 font-bold uppercase transition-all border",
            filter === "all"
              ? "border-white bg-white text-black"
              : "border-white/15 bg-zinc-950 text-slate-400 hover:text-white"
          )}
        >
          ALL CONNECTORS ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("store")}
          className={cn(
            "px-3.5 py-1.5 font-bold uppercase transition-all border",
            filter === "store"
              ? "border-amber-400 bg-amber-400 text-black"
              : "border-white/15 bg-zinc-950 text-slate-400 hover:text-white"
          )}
        >
          STORE APIs (4)
        </button>
        <button
          type="button"
          onClick={() => setFilter("plm")}
          className={cn(
            "px-3.5 py-1.5 font-bold uppercase transition-all border",
            filter === "plm"
              ? "border-purple-400 bg-purple-400 text-black"
              : "border-white/15 bg-zinc-950 text-slate-400 hover:text-white"
          )}
        >
          CAD &amp; PLM (2)
        </button>
        <button
          type="button"
          onClick={() => setFilter("req")}
          className={cn(
            "px-3.5 py-1.5 font-bold uppercase transition-all border",
            filter === "req"
              ? "border-indigo-400 bg-indigo-400 text-black"
              : "border-white/15 bg-zinc-950 text-slate-400 hover:text-white"
          )}
        >
          LEGACY REQS (2)
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredIntegrations.map((item) => {
          const Icon = item.icon;
          const isConnected = item.status === "LIVE CONNECTED";
          return (
            <div
              key={item.id}
              className="group flex flex-col justify-between items-start gap-3 border border-white/15 bg-zinc-950 p-5 hover:border-cyan-400 transition-all duration-300 shadow-sm"
            >
              <div className="flex flex-col gap-2 w-full">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-white flex items-center gap-2">
                    <Icon className={cn("size-4", item.color)} />
                    <span className="truncate">{item.name}</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 font-normal leading-tight">
                  {item.syncType}
                </span>
              </div>

              <div className="w-full pt-3 border-t border-white/10 flex items-center justify-between">
                <span
                  className={cn(
                    "text-[9px] font-bold px-2 py-0.5 border uppercase tracking-wider",
                    isConnected
                      ? "bg-emerald-950 text-emerald-400 border-emerald-800"
                      : "bg-blue-950 text-blue-400 border-blue-800"
                  )}
                >
                  {item.status}
                </span>
                <button
                  type="button"
                  onClick={() => toggleConnect(item.id)}
                  className="text-[10px] text-cyan-400 font-bold hover:underline uppercase"
                >
                  {isConnected ? "CONNECTED ✓" : "1-CLICK CONNECT →"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
