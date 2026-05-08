export type WaitlistInput = {
  email: string;
  name?: string | null;
  useCase?: string | null;
  source?: string | null;
};

export type ValidatedWaitlistInput = {
  email: string;
  name: string | null;
  useCase: string | null;
  source: string;
};

export type WaitlistRow = {
  email: string;
  name: string | null;
  use_case: string | null;
  source: string;
  status: "pending";
  updated_at: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/\s+/g, " ").slice(0, maxLength);
  return clean || null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function validateWaitlistInput(
  input: Partial<WaitlistInput>,
): { ok: true; value: ValidatedWaitlistInput } | { ok: false; error: string } {
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "Enter a valid email address." };
  return {
    ok: true,
    value: {
      email,
      name: cleanOptionalText(input.name, 120),
      useCase: cleanOptionalText(input.useCase, 500),
      source: cleanOptionalText(input.source, 80) ?? "web",
    },
  };
}

export function waitlistRowFromInput(input: ValidatedWaitlistInput): WaitlistRow {
  return {
    email: input.email,
    name: input.name,
    use_case: input.useCase,
    source: input.source,
    status: "pending",
    updated_at: new Date().toISOString(),
  };
}
