"use client";

import { ListChecks } from "lucide-react";
import { ModuleProjectPicker } from "../_components/module-project-picker";

export default function RequirementsProjectPicker() {
  return (
    <ModuleProjectPicker
      title="Requirements"
      description="Requirements belong to a project. Choose one to open its requirements."
      modulePath="/requirements"
      actionLabel="Open requirements"
      icon={ListChecks}
    />
  );
}
