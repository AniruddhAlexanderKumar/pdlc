"use client";

import { GitBranch } from "lucide-react";
import { ModuleProjectPicker } from "../_components/module-project-picker";

export default function ChangesProjectPicker() {
  return (
    <ModuleProjectPicker
      title="Changes"
      description="Change requests belong to a project. Choose one to open its change log."
      modulePath="/changes"
      actionLabel="Open changes"
      icon={GitBranch}
    />
  );
}
