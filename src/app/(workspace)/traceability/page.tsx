"use client";

import { Waypoints } from "lucide-react";
import { ModuleProjectPicker } from "../_components/module-project-picker";

export default function TraceabilityProjectPicker() {
  return (
    <ModuleProjectPicker
      title="Traceability"
      description="Traceability belongs to a project. Choose one to trace its engineering relationships."
      modulePath="/traceability"
      actionLabel="Open traceability"
      icon={Waypoints}
    />
  );
}
