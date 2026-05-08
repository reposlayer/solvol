type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function one(params: Record<string, string | string[] | undefined>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" ? value : null;
}

export default async function WaitlistPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = one(params, "status");
  const email = one(params, "email") ?? "";
  const error = one(params, "error");

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <span>S</span>
          <div>
            <strong>Solvol Beta</strong>
            <em>Research desk access queue</em>
          </div>
        </div>
        <h1>Join the beta waitlist</h1>
        <p>Tell us where Solvol would fit into your market research workflow. We are opening access in small batches while the terminal hardens.</p>
        {status === "joined" ? <div className="auth-notice">You are on the waitlist. We will follow up when a seat opens.</div> : null}
        {status && status !== "joined" ? <div className="auth-notice">That email is not active for beta access yet.</div> : null}
        {error ? <div className="auth-error">{error}</div> : null}
        <form action="/api/waitlist" method="post" className="auth-form">
          <input type="hidden" name="source" value="waitlist-page" />
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required defaultValue={email} placeholder="you@example.com" />
          </label>
          <label>
            Name
            <input name="name" type="text" autoComplete="name" placeholder="Optional" />
          </label>
          <label>
            Research use case
            <textarea name="useCase" rows={4} placeholder="What markets do you track, and what would make Solvol useful?" />
          </label>
          <button type="submit">Request access</button>
        </form>
      </section>
    </main>
  );
}
