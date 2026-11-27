import { AuthForm } from "@/components/dashboard/auth-form";

export const metadata = { title: "הרשמה | איקומרס.ישראל" };

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center p-6">
      <AuthForm mode="sign-up" />
    </main>
  );
}
