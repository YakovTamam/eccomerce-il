import type { Metadata, Viewport } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  BadgePercent,
  MessageSquareText,
  Package,
  Plus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";
import { HeroChat, ClaudeDemo } from "@/components/landing/chat";
import { CostCalculator } from "@/components/landing/calculator";
import { StoreSliders } from "@/components/landing/stores";
import { appOrigin } from "@/lib/payments";
import "./landing.css";

export const metadata: Metadata = {
  title: "איקומרס.ישראל — החנות שמנהלים בשיחה",
  description:
    "חנות אונליין, הזמנות ושיווק במקום אחד, בעברית. Claude מכין עמודים, קופונים ועדכוני מוצרים ומלאי, ואתם מאשרים. בלי סוכנות ובלי לבזבז שעות.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "איקומרס.ישראל — החנות שמנהלים בשיחה",
    description: "חנות, הזמנות ושיווק במקום אחד. Claude מכין, אתם מאשרים.",
    locale: "he_IL",
    type: "website",
  },
};
export const viewport: Viewport = {
  themeColor: "#06050f",
  colorScheme: "dark",
};

const FAQ: [string, string][] = [
  [
    "צריך לדעת טכנולוגיה?",
    "לא. פותחים חנות בכמה שדות, ומנהלים אותה בכתב, בעברית, כמו שמדברים עם עובד. מה ש-Claude מכין מופיע כטיוטה שאפשר לקרוא ולאשר.",
  ],
  [
    "Claude ישנה לי את החנות בלי לשאול?",
    "לא. שינויים בעמודים, במחירים ובקופונים נוצרים כטיוטה עם תקציר של מה ישתנה. הם נכנסים לתוקף רק אחרי אישור, וכל פעולה נרשמת ביומן שינויים.",
  ],
  [
    "איך הלקוחות משלמים?",
    "בדף תשלום מאובטח של חברת הסליקה. פרטי כרטיס האשראי לא עוברים ולא נשמרים אצלנו.",
  ],
  [
    "מה עם הזמנות בוואטסאפ?",
    "זה בדרך: לקוח כותב לעסק, סוכן בונה עגלה ושולח קישור תשלום. כרגע בפיתוח, ונעדכן כשיהיה זמין.",
  ],
  [
    "כמה זה עולה?",
    "המחירים יפורסמו בהשקת הבטא. שימו לב: ניהול בשיחה דורש גם חשבון Claude, שמשולם בנפרד ל-Anthropic.",
  ],
  [
    "זה נגיש ומותאם לישראל?",
    "האתר והחנויות בנויים בעברית מלאה, מימין לשמאל, ועם נגישות כעיקרון תכנון (WCAG 2.1 AA), עם ניווט מקלדת ותיאור לכל תמונה.",
  ],
];

export default function LandingPage() {
  const app = appOrigin();
  return (
    <div className="lp-root">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-black"
      >
        דלג לתוכן הראשי
      </a>

      <header className="lp-nav">
        <div className="lp-wrap">
          <div className="lp-nav-in">
            <Link href="/" className="lp-logo">
              <span className="lp-logo-mark" aria-hidden="true">
                א
              </span>
              איקומרס.ישראל
            </Link>
            <nav className="lp-links" aria-label="ראשי">
              <a href="#how">איך זה עובד</a>
              <a href="#claude">ניהול עם Claude</a>
              <a href="#faq">שאלות נפוצות</a>
            </nav>
            <div className="lp-nav-actions">
              <a className="lp-btn lp-btn-sm" href={`${app}/sign-in`}>
                כניסה
              </a>
              <a
                className="lp-btn lp-btn-primary lp-btn-sm"
                href={`${app}/sign-up`}
              >
                פתיחת חנות
              </a>
            </div>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-hero-grid">
            <div className="lp-copy">
              <span className="lp-pill">
                <Sparkles size={16} aria-hidden="true" />
                חדש: ניהול החנות בשיחה עם Claude
              </span>
              <h1 id="hero-title" className="lp-h1">
                החנות שמנהלים <span className="lp-grad">בשיחה</span>
              </h1>
              <p className="lp-sub">
                חנות, הזמנות ושיווק במקום אחד. Claude מכין, אתם מאשרים.
              </p>
              <div className="lp-cta">
                <a
                  className="lp-btn lp-btn-primary lp-btn-lg"
                  href={`${app}/sign-up`}
                >
                  פתחו חנות
                  <ArrowLeft size={20} aria-hidden="true" />
                </a>
                <a className="lp-btn lp-btn-lg" href="#how">
                  ראו איך זה עובד
                </a>
              </div>
              <ul className="lp-trust" aria-label="יתרונות">
                <li>
                  <ShieldCheck size={18} aria-hidden="true" />
                  תשלום בדף מאובטח
                </li>
                <li>
                  <ShieldCheck size={18} aria-hidden="true" />
                  אישור לפני כל שינוי
                </li>
                <li>
                  <ShieldCheck size={18} aria-hidden="true" />
                  נגיש ובעברית מלאה
                </li>
              </ul>
            </div>
            <StoreSliders />
            <HeroChat />
          </div>
        </section>

        <section id="how" className="lp-section" aria-labelledby="how-title">
          <div className="lp-wrap">
            <p className="lp-eyebrow">איך זה עובד</p>
            <h2 id="how-title" className="lp-h2">
              שלושה צעדים, בלי סוכנות באמצע
            </h2>
            <p className="lp-lead">
              מתחילים בחנות, ממשיכים בשיחה, ומחליטים בעצמכם מה עולה לאוויר.
            </p>
            <ol className="lp-steps">
              {[
                [
                  Rocket,
                  "פותחים חנות",
                  "שם, כתובת ומוצר ראשון. החנות מוכנה בעברית, מותאמת למובייל, עם תשלום בדף מאובטח.",
                ],
                [
                  MessageSquareText,
                  "מדברים עם Claude",
                  "עמודים, קופונים, מחירים, מוצרים ומלאי. מתארים מה רוצים, והוא מכין.",
                ],
                [
                  ShieldCheck,
                  "מאשרים ומוכרים",
                  "קוראים את הטיוטה, רואים תצוגה מקדימה ומאשרים. כל שינוי נשמר ביומן, ועמוד אפשר להחזיר לגרסה קודמת.",
                ],
              ].map(([Icon, title, text], i) => {
                const I = Icon as typeof Rocket;
                return (
                  <li key={title as string} className="lp-card">
                    <span className="lp-num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="lp-ico">
                      <I size={26} aria-hidden="true" />
                    </span>
                    <h3>{title as string}</h3>
                    <p>{text as string}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        <section
          id="claude"
          className="lp-section"
          aria-labelledby="claude-title"
          style={{ paddingBlockStart: 24 }}
        >
          <div className="lp-wrap">
            <div className="lp-claude">
              <div>
                <p className="lp-eyebrow">ניהול עם Claude</p>
                <h2 id="claude-title" className="lp-h2">
                  מה שעלה סוכנות, מבקשים בשיחה
                </h2>
                <p className="lp-lead">
                  דפי נחיתה, קופונים, עדכוני מחירים והעלאת מוצרים: מתארים,
                  מקבלים טיוטה, ומאשרים.
                </p>
                <ul className="lp-points">
                  {[
                    [
                      BadgePercent,
                      "פחות תשלום על עבודה חוזרת",
                      "מבצעים, דפים וקופונים נבנים בשיחה, לא בהזמנת עבודה.",
                    ],
                    [
                      Package,
                      "מוצרים ומלאי בלי עבודת קלדנות",
                      "מעדכנים מחירים, בודקים מה אזל ורואים סיכום מכירות, בכתב.",
                    ],
                    [
                      Wallet,
                      "שליטה מלאה בהוצאה ובתוכן",
                      "שום דבר לא עולה לאוויר בלי אישור, ואפשר לנתק את החיבור בכל רגע.",
                    ],
                  ].map(([Icon, title, text]) => {
                    const I = Icon as typeof Store;
                    return (
                      <li key={title as string}>
                        <span className="lp-ico">
                          <I size={22} aria-hidden="true" />
                        </span>
                        <span>
                          <b>{title as string}</b>
                          <span>{text as string}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <ClaudeDemo />
            </div>
            <CostCalculator />
          </div>
        </section>

        <section
          id="faq"
          className="lp-section"
          aria-labelledby="faq-title"
          style={{ paddingBlockStart: 24 }}
        >
          <div className="lp-wrap">
            <p className="lp-eyebrow">שאלות נפוצות</p>
            <h2 id="faq-title" className="lp-h2">
              כל מה ששואלים לפני שמתחילים
            </h2>
            <div className="lp-faq">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>
                    {q}
                    <Plus size={22} aria-hidden="true" />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>

            <div className="lp-final">
              <h2>
                מוכנים <span className="lp-grad">לדבר</span> עם החנות?
              </h2>
              <p>פותחים חנות, מחברים את Claude, ומתחילים לנהל בשיחה.</p>
              <a
                className="lp-btn lp-btn-primary lp-btn-lg"
                href={`${app}/sign-up`}
              >
                פתחו חנות
                <ArrowLeft size={20} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-wrap lp-footer">
        <span className="lp-logo" style={{ fontSize: 17 }}>
          <span
            className="lp-logo-mark"
            aria-hidden="true"
            style={{ width: 30, height: 30, fontSize: 17, borderRadius: 10 }}
          >
            א
          </span>
          איקומרס.ישראל
        </span>
        <span>© איקומרס.ישראל · חנויות, הזמנות ושיווק בעברית</span>
      </footer>
    </div>
  );
}
