import { Suspense } from "react";
import { AuthForm } from "@/components/dashboard/auth-form";

export const metadata = { title: "התחברות | איקומרס.ישראל" };

async function Form({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <AuthForm mode="sign-in" next={next} />;
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  return (
    <main className="flex flex-1 items-center p-6">
      <Suspense fallback={<p>טוען...</p>}>
        <Form searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
