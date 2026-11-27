import { parseMarkdown, type Inline } from "@/lib/blocks/markdown";

function renderInline(nodes: Inline[]): React.ReactNode[] {
  return nodes.map((n, i) => {
    switch (n.t) {
      case "text":
        return n.v;
      case "strong":
        return <strong key={i}>{renderInline(n.c)}</strong>;
      case "em":
        return <em key={i}>{renderInline(n.c)}</em>;
      case "link": {
        const external = n.href.startsWith("https://");
        return (
          <a
            key={i}
            href={n.href}
            className="underline"
            {...(external ? { rel: "noopener noreferrer" } : {})}
          >
            {renderInline(n.c)}
          </a>
        );
      }
    }
  });
}

/** Renders restricted markdown as React elements (never dangerouslySetInnerHTML). */
export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-4">
      {parseMarkdown(source).map((b, i) => {
        if (b.t === "h") {
          const Tag = `h${b.level}` as "h2" | "h3" | "h4";
          return (
            <Tag key={i} className="text-xl font-bold">
              {renderInline(b.c)}
            </Tag>
          );
        }
        if (b.t === "ul") {
          return (
            <ul key={i} className="ms-6 list-disc">
              {b.items.map((it, j) => (
                <li key={j}>{renderInline(it)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderInline(b.c)}</p>;
      })}
    </div>
  );
}
