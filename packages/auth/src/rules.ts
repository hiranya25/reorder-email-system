// Plain rules with no Node imports, so the Settings page can check a password as the admin types it.

/** Shown next to every password box. */
export const PASSWORD_RULE = "At least 6 characters, with an uppercase letter, a lowercase letter and a number.";

/** Returns a plain-language problem, or undefined when the password is acceptable. */
export function passwordProblem(password: string): string | undefined {
  if (password.length < 6) return "Use at least 6 characters.";
  if (password.length > 200) return "Use at most 200 characters.";
  if (!/[A-Z]/.test(password)) return "Include at least one uppercase letter (A–Z).";
  if (!/[a-z]/.test(password)) return "Include at least one lowercase letter (a–z).";
  if (!/[0-9]/.test(password)) return "Include at least one number (0–9).";
  return undefined;
}
