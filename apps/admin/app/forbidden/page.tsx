import Link from "next/link";
import { signOut } from "../actions";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-3xl font-bold">403 — Not authorised</h1>
      <p className="text-gray-400">
        Your account is signed in but does not have an{" "}
        <code>admin</code> or <code>staff</code> role, so it cannot access the
        admin dashboard.
      </p>
      <div className="mt-2 flex justify-center gap-3">
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg border border-gray-600 px-4 py-2 text-sm hover:bg-gray-800"
          >
            Sign out
          </button>
        </form>
        <Link
          href="/login"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
