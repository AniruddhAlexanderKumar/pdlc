"use client";

import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";

interface HealthResponse {
  status: "ok" | "error";
  timestamp: string;
  checks: { database: string };
  latencyMs?: number;
}

/**
 * Calls the real `/api/health` route on mount and renders its result.
 * Reports "unreachable" (not a crash) when no database is configured —
 * this panel reflects actual infrastructure state, not stub data.
 */
function SystemHealthCard() {
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    fetch("/api/health")
      .then(async (res) => {
        const body = (await res.json()) as HealthResponse;
        if (!cancelled) setHealth(body);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Health</CardTitle>
        <CardDescription>Live status from /api/health</CardDescription>
      </CardHeader>
      <CardContent>
        {!health && !failed && <LoadingState inline label="Checking database connectivity…" />}
        {failed && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="size-4" aria-hidden="true" />
            Health endpoint unreachable
          </div>
        )}
        {health && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              {health.status === "ok" ? (
                <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              ) : (
                <XCircle className="size-4 text-destructive" aria-hidden="true" />
              )}
              <Badge variant={health.status === "ok" ? "success" : "destructive"}>
                {health.status === "ok" ? "Operational" : "Degraded"}
              </Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              Database:{" "}
              <span className="font-mono text-foreground">{health.checks.database}</span>
            </div>
            {typeof health.latencyMs === "number" && (
              <div className="text-sm text-muted-foreground">
                Latency: <span className="font-mono text-foreground">{health.latencyMs}ms</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { SystemHealthCard };
