import { Suspense } from "react";
import { PasswordResetConfirmForm } from "../../components/PasswordResetConfirmForm";

export default function ResetPasswordPage() {
  return (
    <main className="page">
      <Suspense fallback={null}>
        <PasswordResetConfirmForm />
      </Suspense>
    </main>
  );
}
