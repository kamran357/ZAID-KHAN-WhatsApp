import { describe, expect, it, vi } from 'vitest';
import { AnswerCache, answerWithCache, similarity } from '../src/ai/cache.js';
import {
  detectLanguage,
  isAngry,
  isTrivial,
  normalizeForMatching,
  scanSensitive,
} from '../src/ai/safety.js';

describe('answer cache', () => {
  it('reuses an answer for a near-duplicate question without calling the model', async () => {
    const cache = new AnswerCache({ threshold: 0.8 });
    const generate = vi.fn(async () => 'Delivery takes 3 days.');

    const first = await answerWithCache({ cache, question: 'How long is delivery?', enabled: true, generate });
    expect(first.cached).toBe(false);

    const second = await answerWithCache({
      cache,
      question: 'how long is the delivery',
      enabled: true,
      generate,
    });
    expect(second.cached).toBe(true);
    expect(second.answer).toBe('Delivery takes 3 days.');
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('always calls the model when caching is disabled', async () => {
    const cache = new AnswerCache();
    const generate = vi.fn(async () => 'answer');
    await answerWithCache({ cache, question: 'same question', enabled: false, generate });
    await answerWithCache({ cache, question: 'same question', enabled: false, generate });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('expires entries after the TTL', () => {
    const cache = new AnswerCache({ ttlMs: 1000 });
    cache.store('price?', '1500 PKR', 0);
    expect(cache.lookup('price?', 500)).not.toBeNull();
    expect(cache.lookup('price?', 5000)).toBeNull();
  });

  it('scores similarity sensibly', () => {
    expect(similarity('price kya hai', 'price kya hai')).toBe(1);
    expect(similarity('what is the price', 'price kya hai')).toBeLessThan(0.5);
    expect(similarity('', 'anything')).toBe(0);
  });
});

describe('safety scanning', () => {
  it('detects OTP and password requests in all three languages', () => {
    expect(scanSensitive('Please send me the OTP')).toBe('SENSITIVE_CREDENTIALS');
    expect(scanSensitive('apna password bhej de')).toBe('SENSITIVE_CREDENTIALS');
    expect(scanSensitive('مجھے او ٹی پی بھیج دیں')).toBe('SENSITIVE_CREDENTIALS');
  });

  it('detects payment credential requests', () => {
    expect(scanSensitive('share your card number and cvv')).toBe('SENSITIVE_PAYMENT');
    expect(scanSensitive('IBAN batao')).toBe('SENSITIVE_PAYMENT');
  });

  it('lets ordinary questions through', () => {
    expect(scanSensitive('what is the price of the 3kg pack?')).toBeNull();
    expect(scanSensitive('delivery kitne din mein hoti hai?')).toBeNull();
  });

  it('flags anger and trivial messages', () => {
    expect(isAngry('this is a scam, I want a refund now')).toBe(true);
    expect(isAngry('delivery kab hogi?')).toBe(false);
    expect(isTrivial('ok')).toBe(true);
    expect(isTrivial('👍')).toBe(true);
    expect(isTrivial('thanks!')).toBe(true);
    expect(isTrivial('what is the price of the 3kg pack?')).toBe(false);
  });

  it('detects Urdu, Roman Urdu and English', () => {
    expect(detectLanguage('آپ کا نمبر کیا ہے')).toBe('ur');
    expect(detectLanguage('aap ka number kya hai bhai')).toBe('roman-ur');
    expect(detectLanguage('what is your number')).toBe('en');
  });

  it('normalises text for matching', () => {
    expect(normalizeForMatching('  Thank   YOU!! ')).toBe('thank you');
  });
});
