import { Suspense } from "react";
import { ProductsView } from "@/components/products/products-view";

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsView />
    </Suspense>
  );
}
