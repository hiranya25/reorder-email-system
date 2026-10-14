import { Suspense } from "react";
import { MappingView } from "@/components/mapping/mapping-view";

export default function MappingPage() {
  return (
    <Suspense>
      <MappingView />
    </Suspense>
  );
}
