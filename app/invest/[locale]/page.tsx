import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COPY, LOCALES, type Locale } from './copy';
import { getLandingCopy } from '@/lib/landing-copy';
import { InvestorForm } from './InvestorForm';

// Content is editable at runtime (Pepe's update_landing_page_copy tool), so
// this can't be statically generated at build time — every request needs a
// fresh read to reflect the latest edit.
export const dynamic = 'force-dynamic';

const RENDER_IMAGES = [
  'https://res.cloudinary.com/quupmn8b/image/upload/v1784710353/YK-_AP1_03_moex2b.jpg',
  'https://res.cloudinary.com/quupmn8b/image/upload/v1784710353/YK-_AP1_04_jgljqg.jpg',
  'https://res.cloudinary.com/quupmn8b/image/upload/v1784710354/YK-_AP1_08_d80uk3.jpg',
  'https://res.cloudinary.com/quupmn8b/image/upload/v1784281629/patio_bnka0v.jpg',
];

function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value);
}

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  if (!isLocale(params.locale)) return {};
  const copy = await getLandingCopy(params.locale);
  return { title: copy.metaTitle, description: copy.metaDescription };
}

export default async function InvestPage({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale)) notFound();
  const copy = await getLandingCopy(params.locale);

  return (
    <div dir={copy.dir} className="min-h-screen bg-neutral-950 text-white">
      {/* Language switcher */}
      <div className="border-b border-white/10 bg-neutral-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-1 px-6 py-3 text-sm">
          <span className="sr-only">{copy.languageLabel}:</span>
          {LOCALES.map(l => (
            <Link
              key={l}
              href={`/invest/${l}`}
              className={
                l === params.locale
                  ? 'rounded-full bg-white/10 px-3 py-1 font-medium text-white'
                  : 'rounded-full px-3 py-1 text-white/60 hover:text-white'
              }
            >
              {COPY[l].languageNames[l]}
            </Link>
          ))}
        </div>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <img
          src={RENDER_IMAGES[0]}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/30 via-neutral-950/50 to-neutral-950" />
        <div className="relative mx-auto max-w-5xl px-6 py-24 text-center sm:py-32">
          <p className="text-sm font-semibold uppercase tracking-widest text-amber-400">{copy.eyebrow}</p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-5xl">{copy.headline}</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-300">{copy.subheadline}</p>
          <a
            href="#form"
            className="mt-10 inline-block rounded-lg bg-amber-500 px-8 py-3.5 font-semibold text-neutral-900 transition-colors hover:bg-amber-400"
          >
            {copy.ctaPrimary}
          </a>
        </div>
      </section>

      {/* Highlights */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-semibold sm:text-3xl">{copy.highlightsTitle}</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {copy.highlights.map(h => (
            <div key={h.title} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="font-semibold text-amber-400">{h.title}</h3>
              <p className="mt-2 text-neutral-300">{h.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section className="border-y border-white/10 bg-white/5">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold sm:text-3xl">{copy.aboutTitle}</h2>
          <div className="mt-6 max-w-2xl space-y-4">
            {copy.aboutBody.map((para, i) => (
              <p key={i} className="leading-relaxed text-neutral-300">{para}</p>
            ))}
          </div>
          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {copy.aboutStats.map(stat => (
              <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
                <p className="text-2xl font-bold text-amber-400">{stat.value}</p>
                <p className="mt-1 text-sm text-neutral-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-semibold sm:text-3xl">{copy.galleryTitle}</h2>
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {RENDER_IMAGES.map(src => (
            <img key={src} src={src} alt="" className="aspect-square w-full rounded-xl object-cover" />
          ))}
        </div>
      </section>

      {/* Market intelligence */}
      <section className="border-y border-white/10 bg-white/5">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold sm:text-3xl">{copy.marketTitle}</h2>
          <p className="mt-4 max-w-2xl text-neutral-300">{copy.marketIntro}</p>
          <ul className="mt-6 space-y-3">
            {copy.marketPoints.map(point => (
              <li key={point} className="flex items-start gap-3 text-neutral-200">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Form */}
      <section id="form" className="mx-auto max-w-xl px-6 py-20">
        <h2 className="text-2xl font-semibold sm:text-3xl">{copy.formTitle}</h2>
        <p className="mt-3 text-neutral-300">{copy.formSubtitle}</p>
        <div className="mt-8 rounded-2xl bg-white p-6 sm:p-8">
          <InvestorForm copy={copy} locale={params.locale} />
        </div>
      </section>

      <footer className="border-t border-white/10 px-6 py-10 text-center text-sm text-neutral-400">
        {copy.footerLine}
      </footer>
    </div>
  );
}
