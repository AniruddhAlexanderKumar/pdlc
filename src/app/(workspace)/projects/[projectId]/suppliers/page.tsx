import type { Metadata } from "next";
import { SuppliersView } from "./_components/suppliers-view";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <SuppliersView projectId={projectId} />;
}
