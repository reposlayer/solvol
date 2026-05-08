import Link from "next/link";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(params: Record<string, string | string[] | undefined>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" ? value : null;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = one(params, "next") ?? "/terminal";
  const sent = one(params, "sent") === "1";
  const email = one(params, "email");
  const error = one(params, "error");

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <span>S</span>
          <div>
            <strong>Solvol Beta</strong>
            <em>Invite-only market intelligence</em>
          </div>
        </div>
        <h1>Enter the private terminal</h1>
        <p>Use the email address attached to your beta invite. Solvol is read-only market intelligence; no wallet or trading actions are connected.</p>
        {sent ? <div className="auth-notice">Magic link sent{email ? ` to ${email}` : ""}. Check your inbox.</div> : null}
        {error ? <div className="auth-error">Unable to start login. Try again or join the waitlist.</div> : null}
        <form action="/api/auth/login" method="post" className="auth-form">
          <input type="hidden" name="next" value={next} />
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
          </label>
          <button type="submit">Send magic link</button>
        </form>
        <Link href="/waitlist" className="auth-link">Need an invite?</Link>
      </section>
    </main>
  );
}
