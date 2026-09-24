"use client";

import * as React from "react";
import { Activity, ShieldCheck, Zap, Database, Lock, Cpu } from "lucide-react";

const TICKER_ITEMS = [
  { label: "SYSTEM STATUS", val: "100% OPERATIONAL", icon: Activity },
  { label: "DECISION ENGINE LATENCY", val: "< 5MS", icon: Zap },
  { label: "AUDIT LEDGER", val: "IMMUTABLE SIGNATURES", icon: ShieldCheck },
  { label: "STORE INTEGRATIONS", val: "AMAZON / DIGIKEY / MOUSER", icon: Cpu },
  { label: "ENCRYPTION STANDARD", val: "AES-256 GCM / ITAR COMPLIANT", icon: Lock },
  { label: "DATA RETENTION", val: "ZERO LLM TRAINING", icon: Database },
];

export function TelemetryTicker() {
  return (
    <div className="w-full border-y border-white/10 bg-zinc-950/90 py-3 font-mono text-[10px] uppercase tracking-widest text-slate-300 backdrop-blur-md overflow-hidden select-none">
      <div className="flex w-full items-center justify-around gap-8 sm:gap-12 animate-pulse">
        {TICKER_ITEMS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="flex items-center gap-2 shrink-0">
              <Icon className="size-3 text-cyan-400" />
              <span className="text-slate-500 font-bold">{item.label}:</span>
              <span className="text-white font-extrabold">{item.val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
