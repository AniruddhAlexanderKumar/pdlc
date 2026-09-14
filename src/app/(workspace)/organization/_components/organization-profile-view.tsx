"use client";

import * as React from "react";
import { AlertTriangle, Building2, RefreshCw } from "lucide-react";
import { ENGINEERING_INDUSTRIES, type EngineeringIndustry, engineeringIndustryLabel } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type OrganizationProfileDto,
  setOrganizationIndustry,
  useOrganizationProfile,
} from "@/lib/api/organization";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { formatIsoDate } from "@/lib/utils";

/**
 * The organization's industry — a selection, not a personalization engine.
 *
 * Setting this changes what appears on this one page and nothing else in
 * the product: no readiness verdict, no Sentinel signal, and no
 * Change-Impact finding reads it. See `organization.service.ts`'s own doc
 * comment for why that boundary is deliberate.
 */
export function OrganizationProfileView({ isOwner }: { isOwner: boolean }) {
  const { state, set, reload } = useOrganizationProfile();

  if (state.phase === "loading") {
    return <LoadingState label="Loading organization profile…" />;
  }

  if (state.phase === "error") {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
      >
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{describeApiError(state.error)}</span>
        </p>
        <Button variant="outline" size="sm" onClick={reload}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }

  const profile = state.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4" aria-hidden="true" />
          Engineering industry
        </CardTitle>
        <CardDescription>
          Which real-world engineering discipline this organization works in. A selection only —
          it changes nothing about how any engineering result is computed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isOwner ? (
          <IndustryForm profile={profile} onSaved={set} />
        ) : (
          <IndustryReadOnly profile={profile} />
        )}
      </CardContent>
    </Card>
  );
}

function IndustryReadOnly({ profile }: { profile: OrganizationProfileDto }) {
  if (!profile.industry) {
    return (
      <p className="text-sm text-muted-foreground">
        Not set. Only an organization owner can set it.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Badge variant="outline">
        {profile.industry === "OTHER_ENGINEERING" && profile.industryOtherDetail
          ? profile.industryOtherDetail
          : engineeringIndustryLabel(profile.industry)}
      </Badge>
      {profile.industrySetBy && profile.industrySetAt && (
        <p className="text-xs text-muted-foreground">
          Set by {profile.industrySetBy.name} on{" "}
          <span className="font-mono">{formatIsoDate(profile.industrySetAt)}</span>.
        </p>
      )}
    </div>
  );
}

function IndustryForm({
  profile,
  onSaved,
}: {
  profile: OrganizationProfileDto;
  onSaved: (profile: OrganizationProfileDto) => void;
}) {
  const [industry, setIndustry] = React.useState<EngineeringIndustry | "">(profile.industry ?? "");
  const [otherDetail, setOtherDetail] = React.useState(profile.industryOtherDetail ?? "");
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isDirty =
    industry !== (profile.industry ?? "") ||
    (industry === "OTHER_ENGINEERING" && otherDetail !== (profile.industryOtherDetail ?? ""));

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!industry || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await setOrganizationIndustry({
        industry,
        otherDetail: industry === "OTHER_ENGINEERING" ? otherDetail.trim() : undefined,
      });
      onSaved(saved);
    } catch (saveError) {
      setError(describeApiError(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4" noValidate>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1.5 sm:max-w-sm">
        <Label htmlFor="organization-industry">Industry</Label>
        <Select
          id="organization-industry"
          value={industry}
          onChange={(event) => setIndustry(event.target.value as EngineeringIndustry | "")}
          disabled={isSaving}
        >
          <option value="">Not set</option>
          {ENGINEERING_INDUSTRIES.map((value) => (
            <option key={value} value={value}>
              {engineeringIndustryLabel(value)}
            </option>
          ))}
        </Select>
      </div>

      {industry === "OTHER_ENGINEERING" && (
        <div className="flex flex-col gap-1.5 sm:max-w-sm">
          <Label htmlFor="organization-industry-other">Describe the discipline</Label>
          <Input
            id="organization-industry-other"
            value={otherDetail}
            onChange={(event) => setOtherDetail(event.target.value)}
            disabled={isSaving}
            maxLength={200}
            required
          />
        </div>
      )}

      {profile.industrySetBy && profile.industrySetAt && (
        <p className="text-xs text-muted-foreground">
          Last set by {profile.industrySetBy.name} on{" "}
          <span className="font-mono">{formatIsoDate(profile.industrySetAt)}</span>.
        </p>
      )}

      <Button
        type="submit"
        size="sm"
        className="self-start"
        disabled={
          isSaving ||
          !industry ||
          !isDirty ||
          (industry === "OTHER_ENGINEERING" && otherDetail.trim() === "")
        }
      >
        {isSaving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
