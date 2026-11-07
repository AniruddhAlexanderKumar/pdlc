"use client";

import { ShieldAlert } from "lucide-react";
import { ModuleProjectPicker } from "../_components/module-project-picker";

export default function RisksProjectPicker() {
  return (
    <ModuleProjectPicker
      title="Risks"
      description="Risks belong to a project. Choose one to open its risk register."
      modulePath="/risks"
      actionLabel="Open risks"
      icon={ShieldAlert}
    />
  );
}
