import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuildSphere",
  description:
    "AI-powered home design, engineering & construction platform — from first sketch to decades of ownership.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
