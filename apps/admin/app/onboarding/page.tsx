import { requireAdmin } from "@/lib/auth";
import OnboardingForm from "./OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Business onboarding</h1>
        <p className="mt-1 text-sm text-gray-400">
          Create a tenant, assign its Getello agent, and store its Getello key in Vault.
        </p>
      </header>
      <OnboardingForm />
    </div>
  );
}
