import type { Metadata } from "next";
import { IntegrationsView } from "./_components/integrations-view";

export const metadata: Metadata = {
  title: "Official Integrations & Store Connectors · PDLC Platform",
  description:
    "Connect Amazon Store & Business API, DigiKey, Mouser, McMaster-Carr, and custom enterprise ERP store gateways.",
};

export default function IntegrationsPage() {
  return <IntegrationsView />;
}
