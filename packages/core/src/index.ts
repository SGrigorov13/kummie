export * from "./types";
export * from "./vat";
export * from "./money";
export * from "./kummies";
export * from "./cart";
export * from "./badges";
export * from "./orders";
export * from "./taxonomy";
export * from "./groups";
export * from "./compliance";
export * from "./age";
export * from "./documents";

// Demo data stays importable from the root to keep the prototype's public API; prefer
// `@kummie/core/demo` in new code so demo usage is easy to find and remove in M1.
export {
  articleBySlug,
  articles,
  askKummie,
  calendar,
  demoCategoryOf,
  productById,
  products,
} from "./demo/index";
export type { AssistantReply, DemoCategory } from "./demo/index";
