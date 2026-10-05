/** Review rules. Editable in Settings; these are the defaults. */
export interface ReviewRules {
  /** Email names that usually reach a shared inbox rather than the buyer. */
  genericLocalParts: string[];
  /** Accounts with more than this many different products are flagged for a rep follow-up. */
  largeAccountProducts: number;
}

export const DEFAULT_RULES: ReviewRules = {
  genericLocalParts: [
    "info", "sales", "office", "email", "contact", "admin", "ap", "ar", "accounts", "accounting",
    "billing", "orders", "order", "purchasing", "service", "support", "hello", "mail", "store", "shop", "team",
  ],
  largeAccountProducts: 20,
};
