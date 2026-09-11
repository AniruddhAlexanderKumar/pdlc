import { ShieldAlert } from "lucide-react";
import { ModuleStubPage } from "../_components/module-stub";

export default function RisksPage() {
  return (
    <ModuleStubPage
      title="Risks"
      description="Program and engineering risk register."
      icon={ShieldAlert}
    />
  );
}
