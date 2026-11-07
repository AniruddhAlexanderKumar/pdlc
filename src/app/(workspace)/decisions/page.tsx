"use client";

import { Scale } from "lucide-react";
import { ModuleProjectPicker } from "../_components/module-project-picker";

export default function DecisionsProjectPicker() {
  return (
    <ModuleProjectPicker
      title="Decisions"
      description="Engineering decisions belong to a project. Choose one to open its decision record."
      modulePath="/decisions"
      actionLabel="Open decisions"
      icon={Scale}
    />
  );
}
