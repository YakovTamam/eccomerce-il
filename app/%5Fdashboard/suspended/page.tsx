import Link from "next/link";

export const metadata = {
  title: "החנות מושעית | איקומרס.ישראל",
  robots: { index: false },
};

export default function SuspendedPage() {
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-8">
      <h1 className="text-2xl font-bold">החנות הושעתה</h1>
      <p>
        הגישה לניהול החנות הזו הושהתה זמנית על ידי צוות הפלטפורמה. הנתונים שלכם
        שמורים. לבירורים ולהפעלה מחדש, פנו לתמיכה.
      </p>
      <Link href="/" className="underline">
        חזרה לחנויות שלי
      </Link>
    </main>
  );
}
