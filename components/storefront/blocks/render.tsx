import { MarkdownView } from "@/components/storefront/markdown-view";
import { Countdown } from "@/components/storefront/countdown";
import { ProductCard } from "@/components/storefront/product-card";
import { formatAgorot } from "@/lib/catalog/money";
import type { Block } from "@/lib/blocks/schemas";
import { getProductCards } from "@/lib/storefront/data";

const btn =
  "inline-block rounded-[var(--radius)] bg-[var(--brand)] px-5 py-3 font-semibold text-[var(--on-brand)] no-underline";

/** Plain <img>: user uploads live on Blob/local paths; alt is enforced by the type + block schemas. */
function Img({
  alt,
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement> & { alt: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} decoding="async" {...rest} />;
}

async function ProductGrid({
  storeId,
  block,
}: {
  storeId: string;
  block: Extract<Block, { type: "product_grid" }>;
}) {
  const cards = await getProductCards(storeId, block.source, block.limit);
  if (!cards.length) return null;
  return (
    <section
      className="flex flex-col gap-4"
      aria-label={block.heading || "מוצרים"}
    >
      {block.heading && <h2 className="text-2xl font-bold">{block.heading}</h2>}
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <ProductCard key={c.id} p={c} />
        ))}
      </ul>
    </section>
  );
}

async function Featured({
  storeId,
  block,
}: {
  storeId: string;
  block: Extract<Block, { type: "featured_product" }>;
}) {
  const [c] = await getProductCards(
    storeId,
    { by: "products", productIds: [block.productId] },
    1,
  );
  if (!c) return null;
  return (
    <section
      className="flex flex-col items-center gap-4 rounded-[var(--radius)] bg-[var(--surface)] p-6 text-[var(--on-surface)] md:flex-row"
      aria-label="מוצר מומלץ"
    >
      {c.image && (
        <Img
          src={c.image.url}
          alt={c.image.alt}
          loading="lazy"
          className="aspect-square w-full max-w-xs rounded-[var(--radius)] object-cover"
        />
      )}
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">{c.title}</h2>
        <p className="text-xl font-bold">{formatAgorot(c.priceAgorot)}</p>
        <a href={`/products/${c.slug}`} className={btn}>
          לפרטי המוצר
        </a>
      </div>
    </section>
  );
}

export function BlockView({
  storeId,
  block,
  first,
}: {
  storeId: string;
  block: Block;
  first: boolean;
}) {
  switch (block.type) {
    case "hero":
      return (
        <section className="relative overflow-hidden rounded-[var(--radius)] bg-[var(--surface)] text-[var(--on-surface)]">
          {block.image && (
            <Img
              src={block.image.url}
              alt={block.image.alt}
              loading={first ? "eager" : "lazy"}
              fetchPriority={first ? "high" : undefined}
              className="aspect-[16/9] w-full object-cover"
            />
          )}
          <div className="flex flex-col items-start gap-3 p-6 md:p-10">
            <h2 className="text-3xl font-bold md:text-5xl">{block.heading}</h2>
            {block.subheading && <p className="text-lg">{block.subheading}</p>}
            {block.cta && (
              <a href={block.cta.href} className={btn}>
                {block.cta.label}
              </a>
            )}
          </div>
        </section>
      );
    case "rich_text":
      return (
        <section>
          <MarkdownView source={block.markdown} />
        </section>
      );
    case "image":
      return (
        <figure className="flex flex-col gap-2">
          <Img
            src={block.url}
            alt={block.alt}
            loading="lazy"
            className="w-full rounded-[var(--radius)]"
          />
          {block.caption && (
            <figcaption className="text-neutral-700">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    case "gallery":
      return (
        <section aria-label="גלריה">
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {block.images.map((im, i) => (
              <li key={i}>
                <Img
                  src={im.url}
                  alt={im.alt}
                  loading="lazy"
                  className="aspect-square w-full rounded-[var(--radius)] object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      );
    case "product_grid":
      return <ProductGrid storeId={storeId} block={block} />;
    case "featured_product":
      return <Featured storeId={storeId} block={block} />;
    case "banner":
      return (
        <section
          aria-label="מבצע"
          className="flex flex-wrap items-center justify-center gap-4 rounded-[var(--radius)] bg-[var(--brand)] p-4 text-center text-[var(--on-brand)]"
        >
          <p className="text-lg font-bold">{block.text}</p>
          {block.endsAt && <Countdown endsAt={block.endsAt} />}
          {block.cta && (
            <a
              href={block.cta.href}
              className="rounded-[var(--radius)] bg-[var(--on-brand)] px-4 py-2 font-semibold text-[var(--brand)]"
            >
              {block.cta.label}
            </a>
          )}
        </section>
      );
    case "testimonials":
      return (
        <section aria-label="המלצות" className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold">מה אומרים עלינו</h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {block.items.map((t, i) => (
              <li key={i}>
                <figure className="flex h-full flex-col gap-2 rounded-[var(--radius)] bg-[var(--surface)] p-4 text-[var(--on-surface)]">
                  <blockquote>“{t.quote}”</blockquote>
                  <figcaption className="font-semibold">
                    — {t.author}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      );
    case "faq":
      return (
        <section aria-label="שאלות נפוצות" className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold">שאלות נפוצות</h2>
          {block.items.map((q, i) => (
            <details
              key={i}
              className="rounded-[var(--radius)] border border-neutral-400 p-3"
            >
              <summary className="cursor-pointer font-semibold">
                {q.question}
              </summary>
              <p className="mt-2">{q.answer}</p>
            </details>
          ))}
        </section>
      );
    case "cta_whatsapp": {
      const href = `https://wa.me/${block.phone.replace(/\D/g, "")}${block.message ? `?text=${encodeURIComponent(block.message)}` : ""}`;
      return (
        <section className="flex justify-center">
          <a href={href} className={btn} rel="noopener noreferrer">
            {block.label}
          </a>
        </section>
      );
    }
    case "contact":
      return (
        <section aria-label="יצירת קשר" className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold">{block.heading}</h2>
          <address className="flex flex-col gap-1 not-italic">
            {block.phone && (
              <a
                href={`tel:${block.phone.replace(/[^\d+]/g, "")}`}
                className="underline"
                dir="ltr"
              >
                {block.phone}
              </a>
            )}
            {block.email && (
              <a href={`mailto:${block.email}`} className="underline" dir="ltr">
                {block.email}
              </a>
            )}
            {block.address && <span>{block.address}</span>}
            {block.hours && <span>{block.hours}</span>}
          </address>
        </section>
      );
    case "spacer":
      return (
        <div
          aria-hidden="true"
          className={
            block.size === "sm" ? "h-4" : block.size === "lg" ? "h-24" : "h-10"
          }
        />
      );
  }
}

export function BlockRenderer({
  storeId,
  blocks,
}: {
  storeId: string;
  blocks: Block[];
}) {
  return (
    <div className="flex flex-col gap-8">
      {blocks.map((b, i) => (
        <BlockView key={b.id} storeId={storeId} block={b} first={i === 0} />
      ))}
    </div>
  );
}
