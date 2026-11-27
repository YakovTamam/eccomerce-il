"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Activity,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Search,
  ShieldCheck,
  Store,
  Sun,
  X,
  type LucideIcon,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";

const MOBILE_QUERY = "(max-width: 1023px)";
const DARK_QUERY = "(prefers-color-scheme: dark)";
const themeListeners = new Set<() => void>();

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  };
}
const useMedia = (query: string) =>
  useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => false,
  );

function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);
  const off = subscribeMedia(DARK_QUERY)(cb);
  return () => {
    themeListeners.delete(cb);
    off();
  };
}
const themeSnapshot = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : window.matchMedia(DARK_QUERY).matches;
};

const NAV: {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: "domains" | "system";
}[] = [
  { href: "/admin", label: "סקירה", icon: LayoutDashboard, exact: true },
  { href: "/admin/stores", label: "חנויות", icon: Store },
  { href: "/admin/domains", label: "דומיינים", icon: Globe, badge: "domains" },
  {
    href: "/admin/system",
    label: "בריאות המערכת",
    icon: Activity,
    badge: "system",
  },
  { href: "/admin/audit", label: "יומן פעולות", icon: ScrollText },
];

export function AdminShell({
  user,
  badges,
  children,
}: {
  user: { name: string; email: string };
  badges: { domains: number; system: number };
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const mobile = useMedia(MOBILE_QUERY);
  const dark = useSyncExternalStore(subscribeTheme, themeSnapshot, () => false);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // apply the viewer's saved choice (an external system: localStorage/DOM), then notify subscribers
    try {
      const saved = localStorage.getItem("admin-theme");
      if (saved) {
        document.documentElement.dataset.theme = saved;
        themeListeners.forEach((l) => l());
      }
    } catch {}
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing =
        t.tagName === "INPUT" ||
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        t.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function toggleTheme() {
    const next = !dark;
    document.documentElement.dataset.theme = next ? "dark" : "light";
    themeListeners.forEach((l) => l());
    try {
      localStorage.setItem("admin-theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <div className="a-shell" data-open={open}>
      <aside
        className="a-sidebar"
        id="admin-nav"
        {...(mobile && !open ? { inert: true } : {})}
        aria-label="ניווט ראשי"
      >
        <Link href="/admin" className="a-brand" onClick={() => setOpen(false)}>
          <span className="a-brand-mark" aria-hidden="true">
            א
          </span>
          <span>
            <b>איקומרס.ישראל</b>
            <small>ניהול פלטפורמה</small>
          </span>
        </Link>
        <nav className="a-nav" aria-label="ניהול">
          <span className="a-nav-label">ניהול</span>
          {NAV.map(({ href, label, icon: Icon, exact, badge }) => {
            const active = exact ? path === href : path.startsWith(href);
            const n = badge ? badges[badge] : 0;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <Icon size={20} aria-hidden="true" />
                {label}
                {n > 0 && (
                  <span
                    className="a-badge a-count"
                    data-tone={badge === "system" ? "danger" : "warning"}
                  >
                    {n}
                    <span className="sr-only"> דורשים טיפול</span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="a-sidebar-foot">
          <Link
            href="/"
            className="a-btn a-btn-sm"
            style={{ justifyContent: "flex-start" }}
          >
            <Store size={16} aria-hidden="true" />
            לדשבורד העסקי שלי
          </Link>
          <div className="a-user">
            <span className="a-avatar" aria-hidden="true">
              {user.name.trim()[0]?.toUpperCase() ?? "?"}
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <b style={{ display: "block", fontSize: 14 }}>{user.name}</b>
              <small>{user.email}</small>
            </span>
            <button
              type="button"
              className="a-btn a-btn-ghost a-icon-btn a-btn-sm"
              aria-label="יציאה"
              title="יציאה"
              onClick={async () => {
                await authClient.signOut();
                router.push("/sign-in");
              }}
            >
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
      <div
        className="a-scrim"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div className="a-main">
        <header className="a-topbar">
          <button
            type="button"
            className="a-btn a-icon-btn a-menu-btn"
            aria-label={open ? "סגירת התפריט" : "פתיחת התפריט"}
            aria-expanded={open}
            aria-controls="admin-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? (
              <X size={20} aria-hidden="true" />
            ) : (
              <Menu size={20} aria-hidden="true" />
            )}
          </button>
          <form className="a-search" action="/admin/stores" role="search">
            <Search size={18} aria-hidden="true" />
            <input
              ref={search}
              name="q"
              type="search"
              className="a-input"
              placeholder="חיפוש חנויות"
              aria-label="חיפוש חנויות"
              autoComplete="off"
            />
            <kbd className="a-kbd" aria-hidden="true">
              /
            </kbd>
          </form>
          <span
            style={{
              marginInlineStart: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span className="a-badge a-role-badge" data-tone="accent">
              <ShieldCheck size={14} aria-hidden="true" />
              מנהל פלטפורמה
            </span>
            <button
              type="button"
              className="a-btn a-icon-btn"
              onClick={toggleTheme}
              aria-label={dark ? "מעבר למצב בהיר" : "מעבר למצב כהה"}
              title={dark ? "מצב בהיר" : "מצב כהה"}
            >
              {dark ? (
                <Sun size={18} aria-hidden="true" />
              ) : (
                <Moon size={18} aria-hidden="true" />
              )}
            </button>
          </span>
        </header>
        <main id="admin-main" tabIndex={-1} className="a-content">
          {children}
        </main>
      </div>
    </div>
  );
}
