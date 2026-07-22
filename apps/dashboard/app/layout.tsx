import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ello AI — Business Dashboard",
  description: "Business-owner dashboard for leads, calls, and callbacks.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
