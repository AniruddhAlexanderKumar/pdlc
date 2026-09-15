"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Building2, RefreshCw, Type as TypeIcon } from "lucide-react";
import {
  ENGINEERING_INDUSTRIES,
  type EngineeringIndustry,
  TERMINOLOGY_LABEL_DEFAULTS,
  TERMINOLOGY_LABEL_KEYS,
  type TerminologyLabelKey,
  engineeringIndustryLabel,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type OrganizationProfileDto,
  setOrganizationIndustry,
  setOrganizationTerminology,
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
 * The organization's industry and terminology — a selection, not a
 * personalization *engine*, exactly the distinction `organization.service.ts`
 * draws in its own doc comment: setting either changes what a sidebar link
 * or a page header says, never how any engineering result is computed. No
 * readiness verdict, no Sentinel signal, and no Change-Impact finding reads
 * either field.
 *
 * `router.refresh()` after a successful save on either form: `WorkspaceLayout`
 * (a Server Component) is what actually seeds the sidebar and every module
 * header with these values, so a plain client-state update here would leave
 * everywhere else on the page showing the old label until the next full
 * navigation. Refreshing re-runs that server render with the value just
 * saved, which is what makes the sidebar update immediately, on this same
 * page, without a hard reload.
 */
export function OrganizationProfileView({ isOwner }: { isOwner: boolean }) {
  const router = useRouter();
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

  function handleSaved(saved: OrganizationProfileDto) {
    set(saved);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
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
            <IndustryForm profile={profile} onSaved={handleSaved} />
          ) : (
            <IndustryReadOnly profile={profile} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TypeIcon className="size-4" aria-hidden="true" />
            Terminology
          </CardTitle>
          <CardDescription>
            Rename any of these fourteen terms to match how your organization already talks about
            its own work — shown in the sidebar and on each module&apos;s own page. Leave a field
            blank to use this product&apos;s own default. Nothing here is presented as a
            regulatory or industry-standard term; it is your organization&apos;s own choice of
            words.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isOwner ? (
            <TerminologyForm profile={profile} onSaved={handleSaved} />
          ) : (
            <TerminologyReadOnly profile={profile} />
          )}
        </CardContent>
      </Card>
    </div>
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

function TerminologyReadOnly({ profile }: { profile: OrganizationProfileDto }) {
  const overridden = TERMINOLOGY_LABEL_KEYS.filter((key) => profile.labelOverrides[key]);

  if (overridden.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No terms have been renamed. Only an organization owner can rename them.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1 text-sm">
        {overridden.map((key) => (
          <li key={key} className="flex items-center gap-2">
            <span className="text-muted-foreground line-through">{TERMINOLOGY_LABEL_DEFAULTS[key]}</span>
            <span aria-hidden="true">→</span>
            <span className="font-medium text-foreground">{profile.labelOverrides[key]}</span>
          </li>
        ))}
      </ul>
      {profile.labelOverridesSetBy && profile.labelOverridesSetAt && (
        <p className="text-xs text-muted-foreground">
          Set by {profile.labelOverridesSetBy.name} on{" "}
          <span className="font-mono">{formatIsoDate(profile.labelOverridesSetAt)}</span>.
        </p>
      )}
    </div>
  );
}

function TerminologyForm({
  profile,
  onSaved,
}: {
  profile: OrganizationProfileDto;
  onSaved: (profile: OrganizationProfileDto) => void;
}) {
  const [values, setValues] = React.useState<Record<TerminologyLabelKey, string>>(() =>
    Object.fromEntries(
      TERMINOLOGY_LABEL_KEYS.map((key) => [key, profile.labelOverrides[key] ?? ""]),
    ) as Record<TerminologyLabelKey, string>,
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isDirty = TERMINOLOGY_LABEL_KEYS.some(
    (key) => values[key] !== (profile.labelOverrides[key] ?? ""),
  );

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving || !isDirty) return;
    setIsSaving(true);
    setError(null);
    try {
      const saved = await setOrganizationTerminology(values);
      onSaved(saved);
      setValues(
        Object.fromEntries(
          TERMINOLOGY_LABEL_KEYS.map((key) => [key, saved.labelOverrides[key] ?? ""]),
        ) as Record<TerminologyLabelKey, string>,
      );
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TERMINOLOGY_LABEL_KEYS.map((key) => (
          <div key={key} className="flex flex-col gap-1.5">
            <Label htmlFor={`terminology-${key}`}>{TERMINOLOGY_LABEL_DEFAULTS[key]}</Label>
            <Input
              id={`terminology-${key}`}
              value={values[key]}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, [key]: event.target.value }))
              }
              placeholder={TERMINOLOGY_LABEL_DEFAULTS[key]}
              disabled={isSaving}
              maxLength={60}
            />
          </div>
        ))}
      </div>

      {profile.labelOverridesSetBy && profile.labelOverridesSetAt && (
        <p className="text-xs text-muted-foreground">
          Last changed by {profile.labelOverridesSetBy.name} on{" "}
          <span className="font-mono">{formatIsoDate(profile.labelOverridesSetAt)}</span>.
        </p>
      )}

      <Button type="submit" size="sm" className="self-start" disabled={isSaving || !isDirty}>
        {isSaving ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
