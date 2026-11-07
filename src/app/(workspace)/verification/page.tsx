"use client";

import { ShieldCheck } from "lucide-react";
import { ModuleProjectPicker } from "../_components/module-project-picker";

export default function VerificationProjectPicker() {
  return (
    <ModuleProjectPicker
      title="Verification"
      description="Verification activities belong to a project. Choose one to open its activities."
      modulePath="/verification"
      actionLabel="Open verification"
      icon={ShieldCheck}
    />
  );
}
