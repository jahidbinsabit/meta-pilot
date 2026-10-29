/**
 * Disposable / throwaway email-domain blocklist (audit R9, S9-03).
 *
 * Registration friction only: accounts created from these domains are
 * rejected outright because the address can never receive the OTP
 * verification email and the domain's only realistic use here is farming
 * the signup bonus. This is a small static list of the best-known
 * temp-mail providers — not an exhaustive database — kept in one named
 * const so it is trivial to extend.
 */
export const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'mailinator.com',
  'yopmail.com',
  'trashmail.com',
  'getnada.com',
  'temp-mail.org',
] as const;

const DISPOSABLE_SET: ReadonlySet<string> = new Set(DISPOSABLE_EMAIL_DOMAINS);

/**
 * True when `emailOrDomain` is (or belongs to) a blocklisted disposable
 * domain. Accepts a full address (`user@Mailinator.com`) or a bare
 * domain. Subdomains of a listed domain count too
 * (`x.mailinator.com` → disposable), since temp-mail services rotate
 * subdomains freely.
 */
export function isDisposableEmailDomain(emailOrDomain: string): boolean {
  if (!emailOrDomain) return false;
  const at = emailOrDomain.lastIndexOf('@');
  const domain = (at >= 0 ? emailOrDomain.slice(at + 1) : emailOrDomain)
    .trim()
    .toLowerCase();
  if (!domain) return false;
  if (DISPOSABLE_SET.has(domain)) return true;
  for (const listed of DISPOSABLE_EMAIL_DOMAINS) {
    if (domain.endsWith(`.${listed}`)) return true;
  }
  return false;
}
