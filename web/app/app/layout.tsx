import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";

/**
 * Chrome for every app screen: a slim brand bar so there is always a way
 * back — the wordmark goes home, Projects goes to the dashboard.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="sitebar">
        <Link href="/" className="sitebar-brand">
          <BrandMark size={18} /> BUILDSPHERE
        </Link>
        <nav>
          <Link href="/app">Projects</Link>
          <Link href="/app/account">Account</Link>
          <Link href="/faq">FAQ</Link>
        </nav>
      </div>
      {children}
    </>
  );
}
