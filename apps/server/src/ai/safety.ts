import type { HandoffReason } from '@zk/shared';

export type DetectedLanguage = 'ur' | 'roman-ur' | 'en';

const URDU_SCRIPT = /[\u0600-\u06FF]/;

const ROMAN_URDU_WORDS = new Set([
  'aap',
  'ap',
  'acha',
  'achha',
  'bhai',
  'bhej',
  'bhejo',
  'bta',
  'batao',
  'chahiye',
  'hai',
  'hain',
  'hoga',
  'kaise',
  'kaisay',
  'kahan',
  'karo',
  'kar',
  'kr',
  'kya',
  'kitna',
  'kitne',
  'mein',
  'mera',
  'mujhe',
  'nahi',
  'nahin',
  'salam',
  'shukriya',
  'theek',
  'thik',
  'tum',
  'yaar',
  'zaroor',
]);

/** Credential requests must never reach the model — hard handoff before any LLM call. */
const CREDENTIAL_PATTERNS: RegExp[] = [
  /\b(o\.?t\.?p|one[-\s]?time\s+(code|password|pin)|verification\s+code|login\s+code)\b/i,
  /\b(password|passcode|pwd|pin\s*code|account\s+password)\b/i,
  /\b(code|otp|pin)\s+(bhej|bta|bata|de|share|send)/i,
  /او\s*ٹی\s*پی|پاس\s*ورڈ|خفیہ\s*کوڈ|کوڈ\s*بھیج/,
];

/** Card / bank / wallet details are payment-sensitive. */
const PAYMENT_PATTERNS: RegExp[] = [
  /\b(card\s*(number|no\.?)|cvv|cvc|expiry\s*(date)?|iban|atm\s*pin)\b/i,
  /\b(bank\s*(account|details|transfer)|account\s*number|routing\s*number)\b/i,
  /\b(jazzcash|easypaisa)\s*(number|pin|account)\b/i,
  /کارڈ\s*نمبر|شناختی\s*کارڈ|بینک\s*اکاؤنٹ/,
];

const ANGER_PATTERNS: RegExp[] = [
  /\b(scam|fraud|fraudster|cheat|stole|stolen|thief|chor|loot|bakwas|fazool|useless|worst|pathetic)\b/i,
  /\b(refund\s*(now|karo|do)|complaint|shikayat|lawyer|police|f\.?i\.?r\.?)\b/i,
  /\b(wtf|stupid|idiot|nonsense|angry|ghussa|gussa)\b/i,
  /دھوکہ|فراڈ|بکواس|غصہ|شکایت/,
];

const TRIVIAL_EXACT = new Set([
  'ok',
  'okay',
  'okey',
  'k',
  'kk',
  'hmm',
  'hm',
  'thanks',
  'thank you',
  'thank u',
  'thx',
  'ty',
  'great',
  'good',
  'nice',
  'cool',
  'acha',
  'achha',
  'theek',
  'thik',
  'theek hai',
  'shukriya',
  'jazakallah',
  'jazak allah',
  'noted',
  'alright',
  'sure',
  'yes',
  'no',
  'haan',
  'han',
  '👍',
  '🙏',
  '❤️',
  'ok thanks',
  'ok thank you',
]);

export function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function scanSensitive(text: string): HandoffReason | null {
  const value = text.slice(0, 2000);
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value))) return 'SENSITIVE_CREDENTIALS';
  if (PAYMENT_PATTERNS.some((pattern) => pattern.test(value))) return 'SENSITIVE_PAYMENT';
  return null;
}

export function isAngry(text: string): boolean {
  return ANGER_PATTERNS.some((pattern) => pattern.test(text.slice(0, 2000)));
}

/** "ok", "thanks", "👍" — skipped so the free tier is spent on real questions. */
export function isTrivial(text: string): boolean {
  const normalized = normalizeForMatching(text);
  if (!normalized) return true;
  if (TRIVIAL_EXACT.has(normalized)) return true;
  if (normalized.length <= 2) return true;
  // emoji-only messages normalise to a single short token
  return normalized.split(' ').length === 1 && normalized.length <= 3;
}

export function detectLanguage(text: string): DetectedLanguage {
  if (URDU_SCRIPT.test(text)) return 'ur';
  const tokens = normalizeForMatching(text).split(' ').filter(Boolean);
  if (tokens.length === 0) return 'en';
  const hits = tokens.filter((token) => ROMAN_URDU_WORDS.has(token)).length;
  if (hits >= 2) return 'roman-ur';
  if (hits === 1 && tokens.length <= 4) return 'roman-ur';
  return 'en';
}

export function languageLabel(language: DetectedLanguage): string {
  switch (language) {
    case 'ur':
      return 'Urdu (اردو script)';
    case 'roman-ur':
      return 'Roman Urdu';
    default:
      return 'English';
  }
}
