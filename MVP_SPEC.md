# איקומרס.ישראל — מסמך אפיון MVP

> מסמך זה הוא מקור האמת לפיתוח ה-MVP. הוא נכתב כדי ש-Claude Code (או מפתח) יוכל להתחיל לבנות ממנו ישירות.
> שפת הקוד, שמות טבלאות, משתנים ו-commits: **אנגלית**. שפת הממשק למשתמשי הקצה: **עברית, RTL**.

---

## 1. המוצר בקצרה

פלטפורמת מסחר **אומני-צ'אנל** לעסקים ישראליים: מערכת אחת של מוצרים, מלאי, הזמנות ולקוחות, שממנה יוצאים כמה ערוצי מכירה:

1. **חנות אונליין** בתת-דומיין (`pizza.איקומרס.ישראל`) או בדומיין פרטי.
2. **הזמנה בוואטסאפ** — לקוח קצה כותב לעסק בוואטסאפ, סוכן AI מבין את ההזמנה, בונה עגלה ושולח קישור תשלום.
3. **ניהול דרך Claude (MCP)** — בעל העסק מחבר את החנות ל-Claude ומנהל אותה בשיחה: יצירת דפים, מבצעים, עדכון מוצרים, דוחות.

**המבדל:** הזמנה בוואטסאפ עם AI + ניהול בשפה טבעית + התאמה מלאה לישראל (עברית/RTL, סליקה מקומית, חשבוניות, נגישות).

### קהל היעד של ה-MVP

עסקים קטנים ובינוניים שכבר מוכרים בוואטסאפ ובאינסטגרם (מאפיות, בוטיקים, מעדניות, קוסמטיקה). **לא** ארגונים גדולים בשלב הזה.

---

## 2. היקף ה-MVP

### בתוך ה-MVP

- הרשמה, התחברות ויצירת חנות (Onboarding).
- ריבוי חנויות (multi-tenant) עם תת-דומיין לכל חנות.
- ניהול קטלוג: מוצרים, וריאציות (מידה/צבע), קטגוריות, תמונות, מלאי.
- בונה עמודים מבוסס בלוקים (JSON), כולל דף בית ודפי נחיתה.
- חזית חנות (storefront): דף בית, קטגוריה, מוצר, עגלה, צ'קאאוט.
- תשלום דרך **דף תשלום מאובטח (hosted page)** של ספק סליקה — אף פעם לא מעבירים פרטי אשראי דרך השרת שלנו.
- הזמנות: סטטוסים, היסטוריה, התראות.
- קופונים/הנחות בסיסיים.
- **ערוץ וואטסאפ:** webhook, סוכן הזמנות AI, קישור תשלום, עדכוני סטטוס.
- **שרת MCP** עם OAuth 2.1, כלי קריאה וכתיבה, מנגנון טיוטה ואישור.
- יומן שינויים (audit log).
- מדידת שימוש בהודעות וואטסאפ (לחיוב עתידי).
- דשבורד ניהול בעברית.

### מחוץ ל-MVP (לא לבנות עכשיו)

- חיוב מנויים אוטומטי של בעלי העסקים (בשלב הראשון — ידני).
- חיבור ל-ERP (Priority, SAP), ריבוי סניפים, קופה פיזית (POS).
- אינסטגרם/פייסבוק קטלוג.
- Embedded Signup של Meta (ב-MVP הגדרת וואטסאפ ידנית ע"י אדמין).
- דומיינים פרטיים אוטומטיים (ב-MVP: תמיכה בקוד, הגדרה ידנית).
- אפליקציית מובייל.
- משלוחים עם חיבור API לחברות שילוח (ב-MVP: איסוף עצמי + משלוח בתעריף קבוע).

---

## 3. סטאק טכנולוגי

| שכבה          | בחירה                                                         | הערות                                    |
| ------------- | ------------------------------------------------------------- | ---------------------------------------- |
| Framework     | Next.js (App Router, הגרסה היציבה האחרונה), TypeScript strict | Server Components + Server Actions       |
| DB            | Neon Postgres                                                 | branch נפרד לפיתוח, preview ו-production |
| ORM           | Drizzle ORM + drizzle-kit migrations                          |                                          |
| Auth (דשבורד) | Better Auth (או Auth.js) — email+password + magic link        | session cookies על הדומיין הראשי         |
| UI            | Tailwind CSS + shadcn/ui, `dir="rtl"`                         | פונט עברי: Heebo / Assistant             |
| ולידציה       | Zod                                                           | לכל קלט: forms, API, MCP tools, webhooks |
| תמונות        | Vercel Blob                                                   |                                          |
| AI            | Anthropic SDK (Claude API)                                    | המודל דרך env var `ANTHROPIC_MODEL`      |
| MCP           | `mcp-handler` (Vercel) + `@modelcontextprotocol/sdk`          | Streamable HTTP                          |
| Jobs          | טבלת outbox + Vercel Cron (פשוט)                              | אפשר להחליף ל-Inngest בהמשך              |
| Deploy        | Vercel                                                        |                                          |
| בדיקות        | Vitest (unit), Playwright (e2e)                               |                                          |
| Lint/format   | ESLint + Prettier                                             |                                          |

---

## 4. דומיינים וריבוי חנויות

- דומיין ראשי: `איקומרס.ישראל` = Punycode **`xn--4dbklvp7aj.xn--4dbrk0ce`**.
- בכל הקוד והקונפיגורציה עובדים עם **Punycode**. מציגים למשתמש בעברית בלבד.
- משתנה סביבה: `ROOT_DOMAIN=xn--4dbklvp7aj.xn--4dbrk0ce`.
- כתובות:
  - `app.<ROOT_DOMAIN>` — דשבורד ניהול.
  - `<slug>.<ROOT_DOMAIN>` — חנות. ה-slug: אותיות לטיניות, ספרות ומקף (לשלב הראשון; תת-דומיין בעברית — שלב 2).
  - `mcp.<ROOT_DOMAIN>` או `app.<ROOT_DOMAIN>/api/mcp` — שרת MCP.
  - דומיין פרטי: טבלת `store_domains`, זיהוי לפי Host.
- `middleware.ts`: קורא את ה-Host, מנרמל (lowercase, הסרת פורט, punycode), מזהה tenant ועושה rewrite ל-`/_store/[storeId]/...` או `/_app/...`.
- בפיתוח מקומי: תמיכה ב-`<slug>.localhost:3000`.
- **מומלץ:** דומיין לועזי מקביל (למשל `ecomm-il.co.il`) למיילים, ל-callbacks של OAuth ול-webhooks. לתמוך בשניהם דרך env.

---

## 5. מודל נתונים (Postgres)

כל טבלה עסקית מכילה `store_id`. **Row Level Security** מופעל על כל הטבלאות העסקיות, עם policy לפי `current_setting('app.store_id')`. כל גישה ל-DB עוברת דרך helper אחד, `withStore(storeId, fn)`, שמריץ טרנזקציה עם `SET LOCAL app.store_id`.

מזהים: `uuid` (v7 אם זמין). זמנים: `timestamptz`. כסף: **integer באגורות** (`price_agorot`), אף פעם לא float.

```
users                (id, email, name, created_at)
stores               (id, slug, name, status[active|suspended], plan[basic|pro|growth],
                      currency='ILS', vat_rate=0.18, settings jsonb, created_at)
store_members        (store_id, user_id, role[owner|admin|staff])
store_domains        (id, store_id, hostname, is_primary, verified_at)

categories           (id, store_id, name, slug, parent_id, position)
products             (id, store_id, title, slug, description_md, status[draft|active|archived],
                      category_id, images jsonb, seo jsonb, created_at, updated_at)
product_variants     (id, store_id, product_id, sku, title, options jsonb,
                      price_agorot, compare_at_agorot, stock_qty, track_stock bool)

customers            (id, store_id, name, phone_e164, email, marketing_opt_in bool,
                      opt_in_at, created_at)
carts                (id, store_id, customer_id, channel[web|whatsapp], status[open|converted|abandoned],
                      items jsonb, discount_code, expires_at)
orders               (id, store_id, number (רץ לכל חנות), customer_id, channel[web|whatsapp|mcp],
                      status[pending_payment|paid|preparing|ready|shipped|completed|cancelled|refunded],
                      subtotal_agorot, discount_agorot, shipping_agorot, total_agorot,
                      shipping_method, shipping_address jsonb, notes, created_at)
order_items          (id, store_id, order_id, variant_id, title_snapshot, unit_price_agorot, qty)
payments             (id, store_id, order_id, provider, provider_ref, status, amount_agorot,
                      raw jsonb, created_at)
invoices             (id, store_id, order_id, provider, provider_doc_id, url, created_at)

discounts            (id, store_id, code, type[percent|fixed|free_shipping], value,
                      starts_at, ends_at, usage_limit, used_count, status)
pages                (id, store_id, slug, title, status[draft|published], blocks jsonb,
                      seo jsonb, published_version_id)
page_versions        (id, store_id, page_id, blocks jsonb, created_by[user|mcp], created_at)

whatsapp_accounts    (id, store_id, phone_number_id, waba_id, display_phone,
                      access_token_encrypted, status)
whatsapp_conversations (id, store_id, customer_id, wa_id, last_inbound_at, cart_id, state jsonb)
whatsapp_messages    (id, store_id, conversation_id, direction[in|out], wa_message_id,
                      category[service|utility|marketing], body jsonb, status, created_at)
message_usage        (store_id, month, category, count)   -- למדידה וחיוב

drafts               (id, store_id, kind[page|discount|product_update|campaign],
                      payload jsonb, preview_url, status[pending|approved|rejected|expired],
                      created_by[mcp|ai_agent|user], created_at, decided_at, decided_by)
audit_log            (id, store_id, actor_type[user|mcp|ai_agent|system], actor_id,
                      action, entity, entity_id, before jsonb, after jsonb, created_at)

oauth_clients        (id, client_id, client_secret_hash, redirect_uris, name, created_at)
oauth_grants         (id, client_id, user_id, store_id, scopes, code_hash, code_challenge,
                      access_token_hash, refresh_token_hash, expires_at, revoked_at)
outbox_jobs          (id, store_id, type, payload jsonb, run_at, attempts, status, last_error)
```

---

## 6. בונה עמודים (Blocks)

- עמוד = מערך בלוקים ב-JSON. **אין HTML חופשי** — לא מבעלי העסק ולא מ-Claude.
- כל סוג בלוק מוגדר ב-Zod schema אחד, שמשמש גם לולידציה, גם לרינדור וגם לתיאור כלי ה-MCP.
- בלוקים ל-MVP:
  `hero`, `rich_text` (markdown מוגבל), `image`, `gallery`, `product_grid` (לפי קטגוריה או רשימה), `featured_product`, `banner` (מבצע + countdown אופציונלי), `testimonials`, `faq`, `cta_whatsapp` (כפתור "להזמנה בוואטסאפ"), `contact`, `spacer`.
- ערכת עיצוב (theme): צבע ראשי, צבע משני, פונט, לוגו, עיגול פינות. נשמר ב-`stores.settings.theme`.
- כל שמירה יוצרת `page_version`. פרסום = הצבעה על גרסה. Rollback = פרסום גרסה קודמת.
- Preview: `/_preview/[draftId]` עם טוקן חתום וזמן תפוגה.

---

## 7. צ'קאאוט, תשלום וחשבוניות

- **ממשקים מופשטים** (`lib/payments/provider.ts`, `lib/invoices/provider.ts`):
  ```ts
  interface PaymentProvider {
    createHostedPayment(input: {
      orderId;
      amountAgorot;
      customer;
      successUrl;
      cancelUrl;
      webhookUrl;
    }): Promise<{ url: string; providerRef: string }>;
    verifyWebhook(req: Request): Promise<PaymentEvent>;
    refund(providerRef: string, amountAgorot: number): Promise<void>;
  }
  interface InvoiceProvider {
    createInvoiceReceipt(order: Order): Promise<{ docId: string; url: string }>;
  }
  ```
- מימוש ראשון: `MockPaymentProvider` ו-`MockInvoiceProvider` לפיתוח ובדיקות.
- מימוש אמיתי: ספק סליקה ישראלי אחד (להחליט: Cardcom / Tranzila / PayPlus / Grow) וספק חשבוניות אחד (Morning / iCount). **ההחלטה של המייסד — ראו פרק 15.**
- Webhook של תשלום: idempotent (לפי `provider_ref`), מעדכן `orders.status=paid`, מוריד מלאי, יוצר חשבונית דרך outbox, ושולח אישור בוואטסאפ או במייל.
- מחירים כוללים מע"מ. שיעור המע"מ ב-`stores.vat_rate` (לא hardcoded).
- משלוח ב-MVP: איסוף עצמי / משלוח בתעריף קבוע / משלוח חינם מעל סכום.

---

## 8. ערוץ וואטסאפ

### תשתית

- WhatsApp Business Platform (Cloud API) של Meta.
- Endpoint: `POST/GET /api/webhooks/whatsapp`.
  - GET: אימות `hub.verify_token`.
  - POST: אימות חתימה `X-Hub-Signature-256` עם App Secret **לפני כל עיבוד**. מחזירים 200 מהר, והעיבוד עובר ל-outbox.
- מיפוי `phone_number_id` → `store_id` דרך `whatsapp_accounts`.
- טוקנים מוצפנים במנוחה (AES-GCM, המפתח ב-env).
- Idempotency לפי `wa_message_id`.

### סוכן ההזמנות (AI)

- כל הודעה נכנסת → טעינת השיחה (20 ההודעות האחרונות + מצב עגלה) → קריאה ל-Claude API עם כלים.
- **כלים לסוכן** (רק אלה — אין לו גישה ל-DB חופשית):
  - `search_products(query)` — רק מוצרים `active` של החנות הזו.
  - `get_product(product_id)`
  - `add_to_cart(variant_id, qty)` / `update_cart_item` / `remove_from_cart`
  - `view_cart()`
  - `apply_discount(code)`
  - `set_fulfillment(method, address?)`
  - `create_checkout_link()` — יוצר הזמנה `pending_payment` וקישור לדף תשלום.
  - `get_order_status(order_number)` — רק הזמנות של אותו מספר טלפון.
  - `handoff_to_human(reason)` — מסמן את השיחה לטיפול אנושי ומתריע לבעל העסק.
- System prompt: עברית, טון של העסק (מ-`settings.ai_tone`), שעות פעילות, מדיניות משלוח והחזרות. **אסור להמציא מחירים או מוצרים** — מחיר מגיע רק מהכלים.
- המחיר הסופי מחושב תמיד בשרת, לא על ידי המודל.
- הגבלות: max tool iterations לכל הודעה, timeout, ו-fallback להעברה לנציג.

### הודעות יוצאות

- בתוך חלון 24 שעות: הודעות חופשיות.
- מחוץ לחלון: רק **template messages** מאושרים (utility: אישור הזמנה, עדכון סטטוס; marketing: רק ללקוחות עם `marketing_opt_in`).
- כל הודעה יוצאת נרשמת ב-`whatsapp_messages` עם `category`, ומעדכנת את `message_usage` (Meta גובה לפי הודעה — זה בסיס לתמחור).
- ב-MVP: הגדרת חשבון וואטסאפ לחנות נעשית ידנית בדשבורד (phone_number_id, waba_id, token).

---

## 9. שרת MCP (ניהול החנות דרך Claude)

### תשתית

- Endpoint: `/api/mcp` (Streamable HTTP), עם `mcp-handler`.
- **Authorization לפי מפרט ה-MCP:** OAuth 2.1 + PKCE, Protected Resource Metadata (`/.well-known/oauth-protected-resource`), Authorization Server Metadata (`/.well-known/oauth-authorization-server`), ו-Dynamic Client Registration — כדי שבעל עסק יוכל להוסיף את החנות כ-connector ב-Claude.
- מסך הסכמה (consent) בעברית: בחירת החנות והרשאות (`read`, `write`).
- כל טוקן מוגבל **לחנות אחת**. ה-`store_id` נגזר מהטוקן בלבד, לעולם לא מקלט הכלי.

### כלים (tools)

**קריאה:**

- `get_store_overview` — מכירות היום/שבוע/חודש, הזמנות פתוחות, מוצרים במלאי נמוך.
- `list_products`, `get_product`
- `list_orders(filters)`, `get_order`
- `get_sales_report(from, to, group_by)`
- `list_pages`, `get_page`
- `list_discounts`
- `get_whatsapp_stats` — שיחות, הזמנות מוואטסאפ, שימוש בהודעות.

**כתיבה (יוצרת טיוטה — דורשת אישור):**

- `create_page(title, slug, blocks)` / `update_page(page_id, blocks)` → טיוטה + קישור preview.
- `create_discount(...)` → טיוטה.
- `update_product(product_id, changes)` → טיוטה (שינוי מחיר תמיד טיוטה).
- `create_product(...)` → נוצר בסטטוס `draft`.
- `create_campaign(name, discount, page, whatsapp_template?)` → חבילת טיוטות.

**פעולה:**

- `approve_draft(draft_id)` / `reject_draft(draft_id)` — מותר רק אם המשתמש אישר במפורש בשיחה. ה-description של הכלי מורה למודל לשאול את המשתמש קודם.
- `update_order_status(order_id, status)` — מיידי, נרשם ב-audit.

### כללים

- כל כלי כתיבה מחזיר: מה ישתנה (diff קריא), `draft_id` ו-`preview_url`.
- ולידציה מלאה עם Zod לפי סכמות הבלוקים.
- Rate limit לכל טוקן.
- הכול נכתב ל-`audit_log` עם `actor_type='mcp'`.
- שליחת הודעות שיווק בוואטסאפ דרך MCP — **לא ב-MVP**.

---

## 10. דשבורד ניהול (`app.`)

מסכים:

1. Onboarding: שם העסק → slug → תחום → לוגו וצבעים → מוצר ראשון → חנות חיה.
2. בית: סיכום מכירות, הזמנות אחרונות, טיוטות שממתינות לאישור (מ-MCP או מה-AI).
3. מוצרים: רשימה, עריכה, וריאציות, מלאי, העלאת תמונות.
4. הזמנות: רשימה עם פילטרים, דף הזמנה, שינוי סטטוס, החזר כספי.
5. עמודים: רשימה, עורך בלוקים (drag & drop פשוט + טופס לכל בלוק), preview, פרסום, היסטוריית גרסאות.
6. הנחות.
7. וואטסאפ: חיבור, שיחות (תצוגת צ'אט), העברה לנציג, תבניות, שימוש בהודעות.
8. חיבור ל-Claude: הוראות + כתובת השרת + רשימת חיבורים פעילים וביטול.
9. הגדרות: פרטי עסק, מע"מ, משלוח, מדיניות, דומיין, תשלום, חשבוניות, צוות.
10. יומן שינויים.

---

## 11. דרישות לא-פונקציונליות

- **ביצועים:** storefront ב-SSG/ISR עם revalidate לפי tag (`store:<id>`, `product:<id>`). יעד LCP < 2.5s במובייל.
- **נגישות:** עמידה בת"י 5568 / WCAG 2.1 AA. ניווט מקלדת, alt לתמונות (חובה בטופס), ניגודיות, הצהרת נגישות לכל חנות.
- **RTL:** כל הקומפוננטות. להשתמש ב-logical properties (`ms-`, `me-`, `ps-`) ולא `left`/`right`.
- **פרטיות:** חוק הגנת הפרטיות (כולל תיקון 13). מינימום מידע, הסכמה לשיווק עם תיעוד, מחיקת לקוח על פי בקשה, מדיניות פרטיות לכל חנות.
- **צרכנות:** דף מדיניות ביטול עסקה לכל חנות (תבנית ברירת מחדל).
- **אבטחה:** RLS + `withStore`; CSRF על server actions; הצפנת סודות; אימות כל webhook; אין פרטי אשראי במערכת; headers (CSP, HSTS); rate limiting לכל endpoint ציבורי.
- **Observability:** לוג מובנה עם `store_id` ו-`request_id`; Sentry או מקביל.

---

## 12. מבנה תיקיות מוצע

```
/app
  /(marketing)            # אתר השיווק של הפלטפורמה
  /_app/...               # דשבורד (rewrite מ-app.)
  /_store/[storeId]/...   # storefront (rewrite מתת-דומיין)
  /_preview/[draftId]
  /api/mcp/route.ts
  /api/oauth/...          # authorize, token, register
  /.well-known/...
  /api/webhooks/whatsapp/route.ts
  /api/webhooks/payments/[provider]/route.ts
  /api/cron/outbox/route.ts
/lib
  /db (schema.ts, client.ts, with-store.ts)
  /tenancy (resolve-host.ts)
  /blocks (schemas.ts, render/*)
  /payments (provider.ts, mock.ts, <provider>.ts)
  /invoices (provider.ts, mock.ts)
  /whatsapp (client.ts, verify.ts, agent/*)
  /mcp (tools/*, auth.ts)
  /drafts, /audit, /outbox
/components (ui, storefront, dashboard)
/tests (unit, e2e)
middleware.ts
```

---

## 13. שלבי פיתוח וקריטריוני קבלה

לעבוד **לפי הסדר**. בסוף כל שלב: בדיקות עוברות, commit, ועדכון `PROGRESS.md`.

### שלב 0 — תשתית

- פרויקט Next.js + TS + Tailwind + shadcn (RTL) + Drizzle + Neon + ESLint/Prettier + Vitest + Playwright.
- `.env.example` מלא (פרק 14).
- ✅ `pnpm dev`, `pnpm test`, `pnpm lint` עובדים; migration ראשון רץ.

### שלב 1 — Auth וריבוי חנויות

- הרשמה, התחברות, יצירת חנות, `store_members`.
- `middleware.ts` + `resolve-host` + `withStore` + RLS.
- ✅ בדיקה אוטומטית: משתמש של חנות A **לא יכול** לקרוא או לכתוב נתונים של חנות B (גם בשאילתה ישירה עם `store_id` אחר).
- ✅ `a.localhost:3000` ו-`b.localhost:3000` מציגים חנויות שונות.

### שלב 2 — קטלוג ודשבורד בסיסי

- CRUD מוצרים, וריאציות, קטגוריות, תמונות (Blob), מלאי.
- ✅ אפשר ליצור מוצר עם 2 וריאציות ותמונה, והוא נשמר עם `store_id` נכון.

### שלב 3 — בלוקים ו-storefront

- סכמות בלוקים, רנדרר, עורך בדשבורד, גרסאות, preview, theme.
- דפי חנות: בית, קטגוריה, מוצר. SEO בסיסי (meta, OG, sitemap לכל חנות).
- ✅ עמוד עם 5 סוגי בלוקים מתפרסם ונראה תקין במובייל, ב-RTL ובבדיקת axe ללא שגיאות קריטיות.

### שלב 4 — עגלה, צ'קאאוט ותשלום

- עגלה, הנחות, משלוח, יצירת הזמנה, `MockPaymentProvider`, webhook, הורדת מלאי, חשבונית mock, מייל אישור.
- ✅ בדיקת e2e: מוצר → עגלה → קופון → תשלום mock → הזמנה `paid` → מלאי ירד → חשבונית נוצרה.
- ✅ webhook כפול לא יוצר כפילות.

### שלב 5 — שרת MCP

- OAuth 2.1 (DCR, PKCE, metadata), consent בעברית, כלי קריאה, כלי כתיבה עם טיוטות, אישור/דחייה, audit.
- ✅ בדיקה עם MCP Inspector: התחברות, `get_store_overview`, `create_page` → טיוטה → `approve_draft` → העמוד מפורסם.
- ✅ טוקן של חנות A לא ניגש לחנות B.

### שלב 6 — וואטסאפ

- webhook + אימות חתימה, מיפוי לחנות, שמירת הודעות, סוכן AI עם כלים, קישור תשלום, עדכוני סטטוס, העברה לנציג, מדידת שימוש.
- סימולטור מקומי: endpoint לבדיקות ששולח payload בפורמט של Meta.
- ✅ תרחיש: "אני רוצה 2 חלות לשישי, איסוף עצמי" → הסוכן מוצא מוצר → עגלה → קישור תשלום → תשלום mock → הודעת אישור.
- ✅ הסוכן לא ממציא מוצר שלא קיים (בדיקה עם מוצר שאינו בקטלוג).

### שלב 7 — ליטוש והשקת בטא

- דף הצהרת נגישות, מדיניות פרטיות וביטול (תבניות), דשבורד וואטסאפ, יומן שינויים, Sentry, deploy ל-Vercel עם הדומיין.
- ✅ חנות דמו מלאה עובדת בפרודקשן.

---

## 14. משתני סביבה (`.env.example`)

```
DATABASE_URL=
DATABASE_URL_UNPOOLED=
ROOT_DOMAIN=xn--4dbklvp7aj.xn--4dbrk0ce
ALT_ROOT_DOMAIN=                 # דומיין לועזי מקביל
APP_URL=
AUTH_SECRET=
ENCRYPTION_KEY=                  # 32 bytes base64, להצפנת טוקנים
BLOB_READ_WRITE_TOKEN=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_GRAPH_API_VERSION=
PAYMENT_PROVIDER=mock
PAYMENT_PROVIDER_API_KEY=
INVOICE_PROVIDER=mock
INVOICE_PROVIDER_API_KEY=
RESEND_API_KEY=                  # או ספק מייל אחר
SENTRY_DSN=
CRON_SECRET=
```

---

## 15. החלטות פתוחות (המייסד מחליט)

1. ספק סליקה ראשון: Cardcom / Tranzila / PayPlus / Grow. (לפתוח תהליך אישור כבר עכשיו — זה לוקח זמן.)
2. ספק חשבוניות: Morning / iCount.
3. הדומיין הלועזי המקביל.
4. נישת בטא ראשונה (למשל מאפיות).
5. ספק מייל.
6. מחירי המסלולים הסופיים ומכסות הודעות וואטסאפ לכל מסלול.

---

## 16. עקרונות עבודה ל-Claude Code

- לקרוא את המסמך הזה במלואו לפני שמתחילים, ולעבוד שלב אחרי שלב (פרק 13).
- לא להוסיף פיצ'רים מחוץ להיקף (פרק 2) בלי לשאול.
- כל גישה ל-DB עם `store_id` עוברת דרך `withStore`. בלי יוצא מן הכלל.
- כסף תמיד באגורות (integer).
- כל קלט חיצוני (form, API, webhook, MCP tool, פלט של מודל AI) עובר ולידציה עם Zod.
- כל כתיבה של AI (MCP או סוכן וואטסאפ) נרשמת ב-audit, ושינויים מהותיים עוברים דרך טיוטה.
- בכל החלטה ארכיטקטונית משמעותית: לתעד ב-`docs/decisions/NNNN-title.md`.
- בסוף כל שלב: לעדכן את `PROGRESS.md` במה נעשה, מה נשאר ומה דורש החלטה של המייסד.
