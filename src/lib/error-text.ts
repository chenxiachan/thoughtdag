import { t } from '../i18n';

// Known provider-dialect errors, translated into user language. Deliberately
// narrow patterns only: a translation that fires on the wrong error is worse
// than raw text. First hit wins.
const KNOWN_ERRORS: Array<[RegExp, () => string]> = [
  // a text-only endpoint rejecting image content blocks (DeepSeek's Rust
  // deserializer says `unknown variant image_url`; others say "not support")
  [/unknown variant `?image_url`?|image_url.*(?:unsupported|not +support)|does not support image/i,
    () => t('error.textOnlyModelImages')],
];

// Upstream error bodies arrive in two shapes: our proxy's { error: "text" }
// and the OpenAI-style { error: { message, type } } nest that providers
// return on direct calls. Flatten either to a human sentence — without this,
// object payloads stringify into "[object Object]" toasts and the real
// reason (e.g. "exceeded model token limit") never reaches the user.
export function errorText(body: unknown, fallback: string): string {
  const dig = (v: unknown): string | undefined => {
    if (typeof v === 'string' && v.trim()) return v;
    if (v && typeof v === 'object') {
      const o = v as { message?: unknown; error?: unknown };
      if (typeof o.message === 'string' && o.message.trim()) return o.message;
      if (o.error !== undefined) return dig(o.error);
    }
    return undefined;
  };
  const raw = dig(body) ?? fallback;
  for (const [re, msg] of KNOWN_ERRORS) if (re.test(raw)) return msg();
  return raw;
}
