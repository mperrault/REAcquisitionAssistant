import { Suspense } from "react";

import { PropertyManager } from "@/components/properties/property-manager";

export default function PropertiesPage() {
  return (
    <Suspense>
      <PropertyManager />
    </Suspense>
  );
}
