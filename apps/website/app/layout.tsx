import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ello Real Estate — Find your property, we'll call you back",
  description:
    "Explore residential, commercial, and land opportunities. Share your requirement and our AI specialist calls you back in minutes — in your language.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
