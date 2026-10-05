import type { FieldDef } from "../import/fields";

export const CATALOG_FIELD_KEYS = ["sku", "name", "imageUrl", "productUrl", "category", "origin", "price", "inStock", "isNew", "successorSku"] as const;
export type CatalogFieldKey = (typeof CATALOG_FIELD_KEYS)[number];

export const CATALOG_FIELDS: FieldDef<CatalogFieldKey>[] = [
  { key: "sku", label: "SKU / product code", required: true, help: "Must match the SKUs in the sales export", aliases: ["sku", "item id", "item code", "product code", "variant sku", "style no", "item"] },
  { key: "name", label: "Product name", required: false, help: "Shown in the email instead of the sales description", aliases: ["name", "product name", "title", "product title", "description", "style desc"] },
  { key: "imageUrl", label: "Image link", required: false, help: "Full https link to the product photo", aliases: ["image", "image url", "image link", "image src", "photo", "picture", "variant image"] },
  { key: "productUrl", label: "Product page link", required: false, help: "Where \"View\" links go", aliases: ["url", "product url", "product link", "link", "page url", "online store url"] },
  { key: "category", label: "Category", required: false, help: "Used to find new-season items for each group", aliases: ["category", "item category", "product type", "type"] },
  { key: "origin", label: "Lab grown / natural", required: false, help: "Matches recommendations to what each store stocks", aliases: ["origin", "diamond type", "stone type"] },
  { key: "price", label: "Price", required: false, help: "Optional; not shown in the email yet", aliases: ["price", "wholesale price", "unit price", "variant price", "cost"] },
  { key: "inStock", label: "In stock", required: false, help: "yes / no, or a quantity; out-of-stock items are left out", aliases: ["in stock", "stock", "available", "availability", "inventory", "qty available", "status", "active"] },
  { key: "isNew", label: "New this season", required: false, help: "yes / no; filters the recommendation picker", aliases: ["new", "new season", "is new", "new arrival", "new this season", "collection"] },
  { key: "successorSku", label: "Replacement SKU", required: false, help: "Shown instead of a discontinued item", aliases: ["successor", "successor sku", "replacement", "replacement sku", "replaced by", "superseded by"] },
];
