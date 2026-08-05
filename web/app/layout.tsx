import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://onbuildsphere.com"),
  title: {
    default: "BuildSphere",
    template: "%s · BuildSphere",
  },
  description:
    "AI-powered home design, engineering & construction platform — from first sketch to decades of ownership.",
  openGraph: {
    siteName: "BuildSphere",
    url: "https://onbuildsphere.com",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
