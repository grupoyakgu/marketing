'use client';

import { useState, FormEvent } from 'react';
import type { InvestCopy, Locale } from './copy';

type Status = 'idle' | 'submitting' | 'success' | 'error';

export function InvestorForm({ copy, locale }: { copy: InvestCopy; locale: Locale }) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  // Honeypot: real visitors never see this field (visually hidden below),
  // so a filled value means a bot filled the form programmatically.
  const [company, setCompany] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !mobile.trim()) {
      setStatus('error');
      setErrorMessage(copy.errorRequired);
      return;
    }
    setStatus('submitting');
    try {
      const res = await fetch('/api/leads/investor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, mobile, locale, company }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus('error');
        setErrorMessage(data.error === 'Invalid email address' ? copy.errorEmail : copy.errorGeneric);
        return;
      }
      setStatus('success');
    } catch {
      setStatus('error');
      setErrorMessage(copy.errorGeneric);
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900 dark:bg-amber-950/40">
        <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">{copy.successTitle}</h3>
        <p className="mt-2 text-neutral-600 dark:text-neutral-300">{copy.successBody}</p>
      </div>
    );
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
        <label htmlFor="name" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {copy.nameLabel}
        </label>
        <input
          id="name"
          type="text"
          required
          placeholder={copy.namePlaceholder}
          value={name}
          onChange={e => setName(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {copy.emailLabel}
        </label>
        <input
          id="email"
          type="email"
          required
          placeholder={copy.emailPlaceholder}
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        />
      </div>

      <div>
        <label htmlFor="mobile" className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {copy.mobileLabel}
        </label>
        <input
          id="mobile"
          type="tel"
          required
          placeholder={copy.mobilePlaceholder}
          value={mobile}
          onChange={e => setMobile(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-neutral-900 placeholder:text-neutral-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        />
      </div>

      {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="w-full rounded-lg bg-amber-500 px-4 py-3 font-semibold text-neutral-900 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === 'submitting' ? copy.submitting : copy.submit}
      </button>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">{copy.privacyNote}</p>
    </form>
  );
}
