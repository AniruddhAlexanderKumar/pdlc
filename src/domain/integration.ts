import { z } from "zod";

export type IntegrationProvider =
  | "AMAZON_STORE"
  | "DIGIKEY"
  | "MOUSER"
  | "MCMASTER_CARR"
  | "CUSTOM_STORE";

export type IntegrationStatus = "CONNECTED" | "DISCONNECTED" | "SYNCING" | "ERROR";

export interface OfficialIntegration {
  id: string;
  provider: IntegrationProvider;
  name: string;
  description: string;
  status: IntegrationStatus;
  apiKeyConfigured: boolean;
  sellerOrPartnerId?: string;
  marketplaceRegion?: string;
  lastSyncAt: Date | null;
  itemsMappedCount: number;
}

export interface StoreCatalogItem {
  asinOrSku: string;
  title: string;
  manufacturer: string;
  category: string;
  price: string;
  availability: "IN_STOCK" | "LIMITED" | "OUT_OF_STOCK" | "SPECIAL_ORDER";
  storeUrl: string;
}

export const OFFICIAL_INTEGRATIONS_CATALOG: ReadonlyArray<{
  provider: IntegrationProvider;
  name: string;
  tagline: string;
  description: string;
  category: string;
  officialBadge: string;
  documentationUrl: string;
  defaultEndpoint: string;
}> = [
  {
    provider: "AMAZON_STORE",
    name: "Amazon Store & Business API",
    tagline: "Official Amazon Store & Component Catalog Integration",
    description:
      "Direct API sync with Amazon Business & Consumer Store catalogs. Import ASINs, verify seller inventory, track component delivery lead times, and map procurement items into PDLC requirements.",
    category: "E-Commerce & Retail Hardware",
    officialBadge: "Official Store Integration",
    documentationUrl: "https://developer-docs.amazon.com/sp-api/",
    defaultEndpoint: "https://sellingpartnerapi-na.amazon.com",
  },
  {
    provider: "DIGIKEY",
    name: "DigiKey Electronics API",
    tagline: "Official Electronic Components & Parametric Catalog",
    description:
      "Automated retrieval of electronic component specifications, stock quantities, real-time pricing tiers, and ECAD/EDA symbols directly from DigiKey's global distribution network.",
    category: "Electronics & Semiconductors",
    officialBadge: "Official Distributor",
    documentationUrl: "https://developer.digikey.com/",
    defaultEndpoint: "https://api.digikey.com",
  },
  {
    provider: "MOUSER",
    name: "Mouser Electronics API",
    tagline: "Aerospace & Industrial Component Search Engine",
    description:
      "Real-time part search, datasheet retrieval, and availability tracking across 1.2M+ aerospace and military-grade semiconductors and passives.",
    category: "Electronics & Military Grade",
    officialBadge: "Official Partner",
    documentationUrl: "https://api.mouser.com/api/docs",
    defaultEndpoint: "https://api.mouser.com/api/v1",
  },
  {
    provider: "MCMASTER_CARR",
    name: "McMaster-Carr Fastener & CAD Sync",
    tagline: "Mechanical Hardware & Raw Material CAD Catalog",
    description:
      "Link mechanical hardware, structural fasteners, raw alloys, and 3D CAD CAD models directly to engineering design items and bill of materials (BOM).",
    category: "Mechanical & Hardware",
    officialBadge: "Official CAD Partner",
    documentationUrl: "https://www.mcmaster.com",
    defaultEndpoint: "https://api.mcmaster.com/v1",
  },
  {
    provider: "CUSTOM_STORE",
    name: "Custom Enterprise Store REST / Webhook",
    tagline: "Private Enterprise Store & ERP Gateway",
    description:
      "Connect internal ERP, SAP, Oracle, or private enterprise store endpoints via authenticated REST Webhooks and JSON payload synchronization.",
    category: "Enterprise ERP",
    officialBadge: "Custom REST",
    documentationUrl: "/docs/integrations",
    defaultEndpoint: "https://erp.internal.company.com/api/v1/store",
  },
];
