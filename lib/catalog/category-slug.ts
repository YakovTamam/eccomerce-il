import { productSlug } from "./slugify";

export const slugifyCategory = (name: string, suffix = false) =>
  productSlug(name, suffix).replace(/^p-/, "c-");
