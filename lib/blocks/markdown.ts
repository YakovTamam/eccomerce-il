/**
 * Restricted markdown → a small AST. Deliberately tiny: paragraphs, #/##/### headings,
 * - lists, **bold**, *italic*, [text](url). No raw HTML; unsafe link schemes are dropped.
 * The renderer maps this AST to React elements, so HTML injection is impossible by construction.
 */
export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type MdBlock =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: 2 | 3 | 4; c: Inline[] }
  | { t: "ul"; items: Inline[][] };

const SAFE_HREF = /^(\/(?!\/)|https:\/\/|tel:|mailto:)/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ t: "text", v: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: "strong", c: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ t: "em", c: parseInline(m[2]) });
    else if (SAFE_HREF.test(m[4]))
      out.push({ t: "link", href: m[4], c: parseInline(m[3]) });
    else out.push({ t: "text", v: m[3] }); // unsafe scheme: keep the label only
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: "text", v: src.slice(last) });
  return out;
}

export function parseMarkdown(src: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  let list: Inline[][] | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ t: "ul", items: list });
    list = null;
  };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    const li = /^[-*]\s+(.+)$/.exec(line);
    if (!line) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      // The page already has an <h1>; markdown headings start at h2.
      blocks.push({
        t: "h",
        level: (h[1].length + 1) as 2 | 3 | 4,
        c: parseInline(h[2]),
      });
    } else if (li) {
      flushPara();
      (list ??= []).push(parseInline(li[1]));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}
