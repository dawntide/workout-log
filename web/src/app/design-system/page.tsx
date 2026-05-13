import type { Metadata } from "next";
import { DesignSystemCatalog } from "./catalog";

export const metadata: Metadata = {
  title: "V2 Design System Catalog",
  robots: { index: false, follow: false },
};

export default function DesignSystemPage() {
  return <DesignSystemCatalog />;
}
