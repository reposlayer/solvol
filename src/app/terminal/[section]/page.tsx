import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TerminalProvider } from "@/components/terminal/terminal-context";
import { TerminalShell } from "@/components/terminal/TerminalShell";
import { TERMINAL_ROUTES, terminalRouteById } from "@/lib/terminal/routes";

export function generateStaticParams() {
  return TERMINAL_ROUTES
    .filter((route) => route.id !== "market-detail")
    .map((route) => ({ section: route.id }));
}

export default async function TerminalSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!terminalRouteById(section)) {
    notFound();
  }

  return (
    <Suspense fallback={null}>
      <TerminalProvider>
        <TerminalShell />
      </TerminalProvider>
    </Suspense>
  );
}
