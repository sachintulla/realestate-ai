export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Admin — Super Admin / Ops</h1>
      <p className="text-gray-400">
        Admin dashboard scaffold. Access must be role-gated (not just a logged-in
        session). Screens (Business onboarding, Cross-tenant overview, System
        health, Role management, Prompt editor) are implemented in Phase 7 — see{" "}
        <code>docs/AI_BUILD_GUIDE.md</code> §11.
      </p>
    </main>
  );
}
