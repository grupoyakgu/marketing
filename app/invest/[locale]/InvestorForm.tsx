'use client';

import { useState, useEffect, FormEvent } from 'react';
import type { InvestCopy, Locale } from './copy';

type Status = 'idle' | 'submitting' | 'error';

interface UtmParams {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
}

interface Props {
  copy: InvestCopy;
  locale: Locale;
  variant?: 'light' | 'dark';
}

export function InvestorForm({ copy, locale, variant = 'light' }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  // Honeypot: real visitors never see this field (visually hidden below),
  // so a filled value means a bot filled the form programmatically.
  const [company, setCompany] = useState('');
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [utms, setUtms] = useState<UtmParams>({ utm_source: null, utm_medium: null, utm_campaign: null });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUtms({
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
    });
  }, []);

  const dark = variant === 'dark';

  const labelCls = dark
    ? 'block text-sm font-medium text-neutral-400'
    : 'block text-sm font-medium text-neutral-700';

  const inputCls = dark
    ? 'mt-1.5 w-full rounded-lg border border-white/10 bg-neutral-800 px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-400'
    : 'mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500';

  const checkboxLabelCls = dark
    ? 'text-sm text-neutral-300 leading-snug'
    : 'text-sm text-neutral-700 leading-snug';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !mobile.trim()) {
      setStatus('error');
      setErrorMessage(copy.errorRequired);
      return;
    }
    if (!consentTerms) {
      setStatus('error');
      setErrorMessage(copy.errorConsent);
      return;
    }
    setStatus('submitting');
    try {
      const res = await fetch('/api/leads/investor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          mobile,
          locale,
          company,
          consentMarketing,
          ...utms,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus('error');
        setErrorMessage(data.error === 'Invalid email address' ? copy.errorEmail : copy.errorGeneric);
        return;
      }
      window.location.href = 'https://www.grupoyakgu.es';
    } catch {
      setStatus('error');
      setErrorMessage(copy.errorGeneric);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company">Company</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={e => setCompany(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="name" className={labelCls}>{copy.nameLabel}</label>
        <input
          id="name"
          type="text"
          required
          placeholder={copy.namePlaceholder}
          value={name}
          onChange={e => setName(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="email" className={labelCls}>{copy.emailLabel}</label>
        <input
          id="email"
          type="email"
          required
          placeholder={copy.emailPlaceholder}
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="mobile" className={labelCls}>{copy.mobileLabel}</label>
        <input
          id="mobile"
          type="tel"
          required
          placeholder={copy.mobilePlaceholder}
          value={mobile}
          onChange={e => setMobile(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Consent checkboxes */}
      <div className="space-y-3 pt-1">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consentTerms}
            onChange={e => setConsentTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400 cursor-pointer"
          />
          <span className={checkboxLabelCls}>{copy.consentTerms}</span>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={consentMarketing}
            onChange={e => setConsentMarketing(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400 cursor-pointer"
          />
          <span className={checkboxLabelCls}>{copy.consentMarketing}</span>
        </label>
      </div>

      {status === 'error' && (
        <p className="text-sm text-red-400">{errorMessage}</p>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full rounded-lg bg-amber-500 px-4 py-3 font-semibold text-neutral-900 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'submitting' ? copy.submitting : copy.submit}
      </button>

      <p className={`text-xs ${dark ? 'text-neutral-500' : 'text-neutral-500'}`}>{copy.privacyNote}</p>
    </form>
  );
}
