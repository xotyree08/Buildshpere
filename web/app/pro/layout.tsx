import Link from "next/link";

import { BrandMark } from "@/components/BrandMark";

/** Same slim brand bar as the app — professionals need a way home too. */
export default function ProLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="sitebar">
        <Link href="/" className="sitebar-brand">
          <BrandMark size={18} /> BUILDSPHERE
        </Link>
        <nav>
          <Link href="/pro">Professionals</Link>
          <Link href="/faq">FAQ</Link>
        </nav>
      </div>
      {children}
    </>
  );
}
