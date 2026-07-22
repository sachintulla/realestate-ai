import { requireAdmin, roleOf } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { setUserRole } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_OPTIONS = [
  { value: "", label: "— none —" },
  { value: "owner", label: "owner" },
  { value: "staff", label: "staff" },
  { value: "admin", label: "admin" },
];

export default async function RolesPage() {
  const { role: actorRole } = await requireAdmin();
  const svc = createServiceClient();

  const { data, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
  const users = data?.users ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Role management</h1>
        <p className="mt-1 text-sm text-gray-400">
          Assign the <code>admin</code> / <code>staff</code> / <code>owner</code> claim
          (stored in <code>app_metadata.role</code>).
        </p>
      </header>

      {actorRole !== "admin" && (
        <p className="rounded-lg border border-amber-800 bg-amber-950 p-3 text-sm text-amber-300">
          You are signed in as <strong>staff</strong> — role changes are restricted to admins.
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          Could not load users: {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-900 text-gray-400">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Current role</th>
              <th className="px-4 py-3 font-medium">Set role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const current = roleOf(u.app_metadata) ?? "—";
              return (
                <tr key={u.id} className="border-t border-gray-800">
                  <td className="px-4 py-3">{u.email ?? u.id}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs">{current}</span>
                  </td>
                  <td className="px-4 py-3">
                    <form action={setUserRole} className="flex items-center gap-2">
                      <input type="hidden" name="user_id" value={u.id} />
                      <select
                        name="role"
                        defaultValue={roleOf(u.app_metadata) ?? ""}
                        disabled={actorRole !== "admin"}
                        className="rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-sm disabled:opacity-50"
                      >
                        {ROLE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        disabled={actorRole !== "admin"}
                        className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && !error && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
