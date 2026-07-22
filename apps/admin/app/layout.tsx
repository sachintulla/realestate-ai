import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getUserAndRole, isAdminRole } from "@/lib/auth";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: "Ello AI — Admin",
  description: "Super-admin / ops dashboard — role-gated cross-tenant access.",
};

const NAV = [
  { href: "/overview", label: "Overview" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/prompts", label: "Prompt editor" },
  { href: "/roles", label: "Roles" },
  { href: "/health", label: "System health" },
];

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role } = await getUserAndRole();
  const showNav = !!user && isAdminRole(role);

  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        {showNav ? (
          <div className="flex min-h-screen">
            <aside className="hidden w-56 flex-shrink-0 border-r border-gray-800 p-4 sm:block">
              <div className="mb-6 text-lg font-bold">Ello Admin</div>
              <nav className="flex flex-col gap-1">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-6 border-t border-gray-800 pt-4">
                <p className="mb-2 truncate text-xs text-gray-500" title={user.email ?? ""}>
                  {user.email} · {role}
                </p>
                <form action={signOut}>
                  <button
                    type="submit"
                    className="w-full rounded-md border border-gray-700 px-3 py-2 text-sm hover:bg-gray-800"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </aside>
            <main className="flex-1 p-6">{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
