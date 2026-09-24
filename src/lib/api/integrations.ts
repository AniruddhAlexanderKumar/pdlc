"use client";

import React from "react";
import {
  type IntegrationProvider,
  type IntegrationStatus,
  type OfficialIntegration,
  type StoreCatalogItem,
  OFFICIAL_INTEGRATIONS_CATALOG,
} from "@/domain/integration";

export function useOfficialIntegrations() {
  const [integrations, setIntegrations] = React.useState<OfficialIntegration[]>(() => {
    return OFFICIAL_INTEGRATIONS_CATALOG.map((item) => ({
      id: `int-${item.provider.toLowerCase()}`,
      provider: item.provider,
      name: item.name,
      description: item.description,
      status: item.provider === "AMAZON_STORE" || item.provider === "DIGIKEY" ? "CONNECTED" : "DISCONNECTED",
      apiKeyConfigured: item.provider === "AMAZON_STORE" || item.provider === "DIGIKEY",
      sellerOrPartnerId: item.provider === "AMAZON_STORE" ? "AMZN-BUS-US-90412" : undefined,
      marketplaceRegion: "US / Global",
      lastSyncAt: new Date(),
      itemsMappedCount: item.provider === "AMAZON_STORE" ? 14 : item.provider === "DIGIKEY" ? 28 : 0,
    }));
  });

  const [activeCatalogItems, setActiveCatalogItems] = React.useState<StoreCatalogItem[]>([
    {
      asinOrSku: "B08N5WRWNW",
      title: "High-Temp Aerospace Silicon O-Ring Gasket Pack (Pack of 50)",
      manufacturer: "Amazon Commercial Industrial / Parker",
      category: "Seals & Gaskets",
      price: "$48.50",
      availability: "IN_STOCK",
      storeUrl: "https://www.amazon.com/dp/B08N5WRWNW",
    },
    {
      asinOrSku: "B0912K9XZL",
      title: "Stainless Steel 316 Fastener Bolt Assortment Kit (M3-M8)",
      manufacturer: "Amazon Business Industrial Supply",
      category: "Hardware & Fasteners",
      price: "$29.99",
      availability: "IN_STOCK",
      storeUrl: "https://www.amazon.com/dp/B0912K9XZL",
    },
    {
      asinOrSku: "DK-STM32H7-PRO",
      title: "STM32H743BIT6 32-Bit ARM Cortex-M7 MCU 480MHz 2MB Flash",
      manufacturer: "STMicroelectronics (via DigiKey)",
      category: "Integrated Circuits",
      price: "$18.75",
      availability: "IN_STOCK",
      storeUrl: "https://www.digikey.com",
    },
  ]);

  const toggleConnection = (id: string, apiKey?: string) => {
    setIntegrations((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const nextConnected = item.status !== "CONNECTED";
        return {
          ...item,
          status: nextConnected ? "CONNECTED" : "DISCONNECTED",
          apiKeyConfigured: nextConnected,
          lastSyncAt: nextConnected ? new Date() : item.lastSyncAt,
        };
      })
    );
  };

  const connectAllStores = () => {
    setIntegrations((prev) =>
      prev.map((item) => ({
        ...item,
        status: "CONNECTED",
        apiKeyConfigured: true,
        lastSyncAt: new Date(),
        itemsMappedCount: item.itemsMappedCount > 0 ? item.itemsMappedCount : 8,
      }))
    );
  };

  const syncStoreCatalog = (provider: IntegrationProvider) => {
    setIntegrations((prev) =>
      prev.map((item) => (item.provider === provider ? { ...item, status: "SYNCING" } : item))
    );

    setTimeout(() => {
      setIntegrations((prev) =>
        prev.map((item) =>
          item.provider === provider
            ? {
                ...item,
                status: "CONNECTED",
                lastSyncAt: new Date(),
                itemsMappedCount: item.itemsMappedCount + 2,
              }
            : item
        )
      );
    }, 600);
  };

  const addAsinItem = (asinOrSku: string, customTitle?: string) => {
    const cleanAsin = asinOrSku.trim().toUpperCase() || "B079XX-SAMPLE";
    const newItem: StoreCatalogItem = {
      asinOrSku: cleanAsin,
      title: customTitle || `Imported Amazon Store Component (${cleanAsin})`,
      manufacturer: "Amazon Store / Certified Hardware Vendor",
      category: "Imported Store Hardware",
      price: "$34.00",
      availability: "IN_STOCK",
      storeUrl: `https://www.amazon.com/dp/${cleanAsin}`,
    };

    setActiveCatalogItems((prev) => [newItem, ...prev]);

    setIntegrations((prev) =>
      prev.map((item) =>
        item.provider === "AMAZON_STORE"
          ? { ...item, itemsMappedCount: item.itemsMappedCount + 1 }
          : item
      )
    );
  };

  return {
    integrations,
    activeCatalogItems,
    toggleConnection,
    connectAllStores,
    syncStoreCatalog,
    addAsinItem,
  };
}
