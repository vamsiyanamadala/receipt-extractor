"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Extract" },
  { href: "/history", label: "History" },
  { href: "/eval", label: "Eval" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center justify-between mb-10 sm:mb-14">
      <Link href="/" className="flex items-center gap-2 group">
        <span className="inline-block w-1.5 h-1.5 bg-accent group-hover:scale-150 transition-transform" />
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-muted group-hover:text-ink transition-colors">
          receipt → form
        </span>
      </Link>
      <div className="flex items-center gap-1">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors ${
                active
                  ? "text-ink border-b border-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
