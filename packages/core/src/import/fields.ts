/** Fields the import understands. Columns in the export are matched to these by header name. */
export const FIELD_KEYS = [
  "accountId",
  "customerName",
  "email",
  "orderDate",
  "qty",
  "sku",
  "productName",
  "category",
  "origin",
  "rep",
  "value",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export interface FieldDef {
  key: FieldKey;
  label: string;
  required: boolean;
  help: string;
  /** Normalized header names that map to this field (see normalizeHeader). */
  aliases: string[];
}

export const FIELDS: FieldDef[] = [
  { key: "accountId", label: "Customer ID", required: true, help: "Account number or GST no. used to recognise the customer every season", aliases: ["account id", "accountid", "acct", "acct id", "account", "account no", "account number", "customer id", "cust id", "customer no", "customer number", "customer code", "gst", "gst no", "gstin"] },
  { key: "customerName", label: "Company name", required: true, help: "Shown on screens and used as a fallback for matching", aliases: ["customer name", "customer", "company", "company name", "account name", "store", "store name", "client", "client name"] },
  { key: "email", label: "Customer email", required: false, help: "Strongly recommended: without it every customer needs an email added by hand", aliases: ["email", "e mail", "email address", "customer email", "email id", "mail"] },
  { key: "orderDate", label: "Order date or month", required: true, help: "Used to keep orders inside the season window", aliases: ["date", "order date", "trans dt", "trans date", "transaction date", "invoice date", "month", "period", "order month"] },
  { key: "qty", label: "Quantity", required: true, help: "Ranks which purchased items to feature", aliases: ["qty", "quantity", "trans qty", "units", "pcs", "pieces", "order qty"] },
  { key: "sku", label: "SKU / product code", required: true, help: "Links each line to the product catalog", aliases: ["item id", "sku", "item", "item code", "item no", "product code", "product id", "style no", "style code"] },
  { key: "productName", label: "Product name", required: true, help: "Shown in the email", aliases: ["style desc", "description", "product name", "item description", "item name", "style description", "product", "product description"] },
  { key: "category", label: "Category", required: false, help: "Groups customers for the 3 new recommendations", aliases: ["item category", "category", "product category", "product type", "type"] },
  { key: "origin", label: "Lab grown / natural", required: false, help: "Recommendations should match what each store stocks", aliases: ["origin", "diamond type", "stone type", "lab grown", "lab natural"] },
  { key: "rep", label: "Sales rep", required: false, help: "Named in the email and used to filter the review list", aliases: ["assigned sales rep", "sales rep", "rep", "salesperson", "sales person", "account manager"] },
  { key: "value", label: "Order value", required: false, help: "Optional: used to break ties when ranking items", aliases: ["value", "amount", "sales value", "net sales", "net amount", "revenue", "line total"] },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f])) as Record<FieldKey, FieldDef>;
