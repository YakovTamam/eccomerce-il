import { formatAgorot } from "@/lib/catalog/money";
import type { ProductCardData } from "@/lib/storefront/data";

export function ProductCard({ p }: { p: ProductCardData }) {
  return (
    <li className="flex flex-col gap-2">
      <a href={`/products/${p.slug}`} className="group flex flex-col gap-2">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.image.url}
            alt={p.image.alt}
            loading="lazy"
            decoding="async"
            className="aspect-square w-full rounded-[var(--radius)] object-cover"
          />
        ) : (
          <div
            className="aspect-square w-full rounded-[var(--radius)] bg-[var(--surface)]"
            aria-hidden="true"
          />
        )}
        <span className="font-semibold underline-offset-2 group-hover:underline">
          {p.title}
        </span>
        <span>
          {p.hasMultiplePrices && <span>החל מ-</span>}
          {p.compareAtAgorot !== null && (
            <s className="me-2 text-neutral-700">
              <span className="sr-only">מחיר קודם </span>
              {formatAgorot(p.compareAtAgorot)}
            </s>
          )}
          <span className="font-bold">{formatAgorot(p.priceAgorot)}</span>
        </span>
        {!p.inStock && <span className="text-neutral-700">אזל מהמלאי</span>}
      </a>
    </li>
  );
}
