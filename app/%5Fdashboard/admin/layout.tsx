import { Suspense } from "react";
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/shell";
import { adminOverview } from "@/lib/admin/queries";
import { requirePlatformAdmin } from "@/lib/admin/auth";
import "./admin.css";

export const metadata: Metadata = {
  title: {
    default: "ניהול פלטפורמה | איקומרס.ישראל",
    template: "%s | ניהול פלטפורמה",
  },
  robots: { index: false, follow: false },
};

async function Guard({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin(); // every admin page is behind this
  const { health } = await adminOverview();
  return (
    <AdminShell
      user={{ name: admin.name, email: admin.email }}
      badges={{
        domains: health.unverifiedDomains,
        system: health.failedJobs + health.failedPayments,
      }}
    >
      {children}
    </AdminShell>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-root">
      {/* Applies the viewer's saved theme before first paint (no light→dark flash). Static string, no user input. */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            "try{var t=localStorage.getItem('admin-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}",
        }}
      />
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-black"
      >
        דלג לתוכן הראשי
      </a>
      <Suspense
        fallback={
          <div className="a-content" aria-busy="true" aria-label="טוען">
            <div className="a-skeleton" style={{ height: 40, width: 260 }} />
            <div className="a-grid a-grid-4">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="a-skeleton"
                  style={{ height: 132, borderRadius: 16 }}
                />
              ))}
            </div>
          </div>
        }
      >
        <Guard>{children}</Guard>
      </Suspense>
    </div>
  );
}
