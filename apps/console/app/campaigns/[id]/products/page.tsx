import { ComingSoon } from "@/components/console/coming-soon";

export default function ProductsPage() {
  return (
    <ComingSoon
      slug="products"
      title="Product check"
      subtitle="Stop discontinued or undescribed products from reaching emails."
      features={[
        "Upload the product catalog (SKU, image, product link, stock, new-season flag)",
        "Purchased products vs. catalog: missing description, missing image, discontinued",
        "Hide a product or set a successor product"
      ]}
    />
  );
}
