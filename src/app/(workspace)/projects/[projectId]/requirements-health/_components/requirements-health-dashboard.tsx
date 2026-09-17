"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  FileCheck,
  Users,
  GitGraph,
  ArrowRight,
  HelpCircle,
  FileCode,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface HealthMetric {
  id: string;
  label: string;
  value: string;
  subtext: string;
  status: "RED" | "AMBER" | "GREEN";
  drillDownHref: string;
}

interface RequirementsHealthDashboardProps {
  projectId: string;
}

export function RequirementsHealthDashboard({ projectId }: RequirementsHealthDashboardProps) {
  const metrics: HealthMetric[] = [
    {
      id: "completeness",
      label: "Requirements Completeness",
      value: "92%",
      subtext: "2 requirements missing measurable criteria",
      status: "AMBER",
      drillDownHref: `/projects/${projectId}/requirements`,
    },
    {
      id: "approval",
      label: "Stakeholder Approval Coverage",
      value: "78%",
      subtext: "4 requirements pending Chief Engineer sign-off",
      status: "AMBER",
      drillDownHref: `/projects/${projectId}/requirements`,
    },
    {
      id: "conflicts",
      label: "Open Disagreements & Conflicts",
      value: "1",
      subtext: "Thermal vs Avionics margin conflict on REQ-004",
      status: "RED",
      drillDownHref: `/projects/${projectId}/requirements`,
    },
    {
      id: "unverified",
      label: "Unverified Requirements",
      value: "3",
      subtext: "Requirements without linked passed tests",
      status: "AMBER",
      drillDownHref: `/projects/${projectId}/verification`,
    },
    {
      id: "evidenceGaps",
      label: "Evidence Gaps",
      value: "2",
      subtext: "Decisions relying on unbacked assumptions",
      status: "RED",
      drillDownHref: `/projects/${projectId}/evidence`,
    },
    {
      id: "changedPostApproval",
      label: "Changed After Approval",
      value: "0",
      subtext: "All approved baselines remain intact",
      status: "GREEN",
      drillDownHref: `/projects/${projectId}/requirements`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <Card className="border-primary/40 bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="size-5 text-primary" />
              <CardTitle className="text-base font-semibold">Requirements & Gatekeeper Health Dashboard</CardTitle>
            </div>
            <span className="rounded bg-amber-500/10 px-2.5 py-0.5 text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
              Overall System Status: AMBER WARNING
            </span>
          </div>
          <CardDescription>
            Monitors requirements quality, stakeholder agreement coverage, unverified specifications, and evidence gaps in real time.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* RAG Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => (
          <Card
            key={metric.id}
            className={`border transition-all hover:shadow-md ${
              metric.status === "RED"
                ? "border-red-500/40 bg-red-500/5"
                : metric.status === "AMBER"
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-emerald-500/40 bg-emerald-500/5"
            }`}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
                {metric.status === "RED" && <XCircle className="size-4 text-red-500" />}
                {metric.status === "AMBER" && <AlertTriangle className="size-4 text-amber-500" />}
                {metric.status === "GREEN" && <CheckCircle2 className="size-4 text-emerald-500" />}
              </div>
              <CardTitle className="text-2xl font-bold font-mono text-foreground">{metric.value}</CardTitle>
            </CardHeader>

            <CardContent className="flex flex-col gap-3 pt-0">
              <p className="text-xs text-muted-foreground">{metric.subtext}</p>
              <div className="border-t border-border/40 pt-2 flex justify-end">
                <Button asChild variant="ghost" size="sm" className="gap-1 text-xs text-primary hover:text-primary">
                  <Link href={metric.drillDownHref}>
                    Drill Down <ArrowRight className="size-3" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gatekeeper Prevention Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Active Gatekeeper Prevention Summary</CardTitle>
          <CardDescription className="text-xs">
            How the software actively protects engineering work from premature or flawed execution.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
          <div className="rounded border border-border bg-muted/30 p-3 flex flex-col gap-1">
            <strong className="text-foreground flex items-center gap-1.5">
              <FileCheck className="size-4 text-primary" /> 1. Quality Control
            </strong>
            Blocks unquantified subjective terms like &quot;adequate&quot; or &quot;fast&quot; from reaching APPROVED state without numeric bounds and units.
          </div>

          <div className="rounded border border-border bg-muted/30 p-3 flex flex-col gap-1">
            <strong className="text-foreground flex items-center gap-1.5">
              <Users className="size-4 text-primary" /> 2. Stakeholder Agreement
            </strong>
            Flags design decisions that rely on unapproved or post-approval-modified requirements, generating formal conflict records.
          </div>

          <div className="rounded border border-border bg-muted/30 p-3 flex flex-col gap-1">
            <strong className="text-foreground flex items-center gap-1.5">
              <HelpCircle className="size-4 text-primary" /> 3. Question Definition
            </strong>
            Intercepts vague analysis queries (&quot;make engine better&quot;) and requires formal metric, condition, and constraint parameters before analysis begins.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
