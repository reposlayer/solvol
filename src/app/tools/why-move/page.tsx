"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Deep-link helper: `/tools/why-move` opens the Why Move tool inside the terminal shell. */
export default function WhyMoveToolPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/terminal#why-move");
  }, [router]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--terminal-bg)] font-mono text-[11px] text-[var(--terminal-muted)]">
      Opening terminal…
    </div>
  );
}
