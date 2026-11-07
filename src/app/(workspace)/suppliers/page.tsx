"use client";

import { Factory } from "lucide-react";
import { ModuleProjectPicker } from "../_components/module-project-picker";

export default function SuppliersProjectPicker() {
  return (
    <ModuleProjectPicker
      title="Suppliers"
      description="Supplier engineering dependencies belong to a project. Choose one to open its suppliers."
      modulePath="/suppliers"
      actionLabel="Open suppliers"
      icon={Factory}
    />
  );
}
