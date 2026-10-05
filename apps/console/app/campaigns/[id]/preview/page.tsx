import { Suspense } from "react";
import { PreviewView } from "@/components/preview/preview-view";

export default function PreviewPage() {
  return (
    <Suspense>
      <PreviewView />
    </Suspense>
  );
}
