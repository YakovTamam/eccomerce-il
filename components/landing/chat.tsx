import {
  Bot,
  Check,
  FileText,
  TicketPercent,
  TrendingDown,
  User,
  X,
} from "lucide-react";

/** Small decorative chat floating over the sliders in the hero. */
export function HeroChat() {
  return (
    <div className="lp-chat-float lp-glass lp-chat" aria-hidden="true">
      <div className="lp-msg">
        <span className="lp-ava">
          <User size={18} />
        </span>
        <div className="lp-bubble">תכין דף נחיתה למבצע חנוכה</div>
      </div>
      <div className="lp-msg">
        <span className="lp-ava lp-ava-ai">
          <Bot size={18} />
        </span>
        <div className="lp-bubble lp-bubble-ai">
          הכנתי טיוטה. לאשר?
          <div className="lp-draft-actions">
            <span className="lp-btn lp-btn-primary lp-btn-sm">אישור</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The real thing, explained: a draft with a readable summary that goes live only after approval. */
export function ClaudeDemo() {
  return (
    <figure
      className="lp-glass lp-chat"
      style={{ margin: 0, padding: 22, gap: 16 }}
      aria-label="דוגמה לשיחה עם Claude על ניהול החנות"
    >
      <div className="lp-msg">
        <span className="lp-ava" aria-hidden="true">
          <User size={18} />
        </span>
        <div className="lp-bubble">
          <span className="sr-only">אתם: </span>תכין דף נחיתה למבצע חנוכה, עם
          20% הנחה על כל החלות
        </div>
      </div>
      <div className="lp-msg">
        <span className="lp-ava lp-ava-ai" aria-hidden="true">
          <Bot size={18} />
        </span>
        <div className="lp-bubble lp-bubble-ai" style={{ flex: 1 }}>
          <span className="sr-only">Claude: </span>הכנתי טיוטה. שום דבר עוד לא
          פורסם:
          <div className="lp-draft">
            <b>
              <FileText size={14} aria-hidden="true" />
              טיוטה ממתינה לאישור
            </b>
            <ul>
              <li>עמוד חדש ״מבצע חנוכה״ עם 3 בלוקים</li>
              <li>
                <TicketPercent
                  size={14}
                  aria-hidden="true"
                  style={{ display: "inline", verticalAlign: "-2px" }}
                />{" "}
                קופון HANUKA20 — 20% הנחה
              </li>
              <li>יפורסם רק עם האישור שלך</li>
            </ul>
            <div className="lp-draft-actions">
              <span className="lp-btn lp-btn-primary lp-btn-sm">
                <Check size={16} aria-hidden="true" />
                אישור
              </span>
              <span className="lp-btn lp-btn-sm">
                <X size={16} aria-hidden="true" />
                דחייה
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="lp-msg">
        <span className="lp-ava" aria-hidden="true">
          <User size={18} />
        </span>
        <div className="lp-bubble">
          <span className="sr-only">אתם: </span>תעדכן את מחיר החלה הקלועה ל-₪38,
          ומה אזל לי במלאי?
        </div>
      </div>
      <div className="lp-msg">
        <span className="lp-ava lp-ava-ai" aria-hidden="true">
          <Bot size={18} />
        </span>
        <div className="lp-bubble lp-bubble-ai" style={{ flex: 1 }}>
          <span className="sr-only">Claude: </span>
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <TrendingDown
              size={16}
              aria-hidden="true"
              style={{ transform: "scaleY(-1)", color: "#fcd34d" }}
            />
            שינוי מחיר ממתין לאישורך: ₪35 ← ₪38.
          </span>
          <br />
          במלאי נמוך: חלה קלועה, נותרו 3 יחידות.
        </div>
      </div>
    </figure>
  );
}
