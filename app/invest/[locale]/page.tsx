import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LOCALES, type Locale } from './copy';
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

const LOGO_URL =
  'https://res.cloudinary.com/quupmn8b/image/upload/v1786266721/logo_3_qxkzbb.png';

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

      {/* ── Split-screen hero ─────────────────────────────────────────── */}
      <section className="flex min-h-screen flex-col lg:flex-row">

        {/* LEFT — image panel (60%) */}
        <div className="relative h-[50vh] lg:h-auto lg:flex-[3]">
          <img
            src="https://res.cloudinary.com/quupmn8b/image/upload/v1784281629/patio_bnka0v.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Subtle overlay — lets the photo breathe */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/20" />
          {/* Title anchored top-left */}
          <div className="absolute top-0 left-0 p-8 lg:p-12">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-white/60">
              {copy.eyebrow}
            </p>
            <p
              className="text-3xl font-black uppercase leading-tight tracking-wide text-white lg:text-5xl"
              style={{ textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
            >
              {copy.headline}
            </p>
            <p
              className="mt-2 max-w-md text-base font-light leading-snug text-white/85 lg:text-lg"
              style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
            >
              {copy.subheadline}
            </p>
          </div>
        </div>

        {/* RIGHT — dark form panel (40%) */}
        <div className="flex flex-col bg-neutral-900 lg:flex-[2] lg:overflow-y-auto">
          <div className="flex flex-1 flex-col justify-center px-8 py-10 lg:px-12 lg:py-12">

            {/* Logo */}
            <img
              src={LOGO_URL}
              alt="Grupo YAKGU"
              className="h-12 w-auto object-contain"
            />

            {/* Form heading */}
            <h2 className="mt-8 text-4xl font-black uppercase leading-none tracking-tight text-white sm:text-5xl">
              {copy.formTitle}
            </h2>
            <p className="mt-2 text-sm text-neutral-400">{copy.formSubtitle}</p>

            {/* Form — dark variant, no white card wrapper */}
            <div className="mt-6">
              <InvestorForm copy={copy} locale={params.locale} variant="dark" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────────────────── */}
      <div className="border-b border-white/10 bg-white/[0.03]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-6 py-5 text-center text-sm text-neutral-400">
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Licencia concedida · Permit secured
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            18 unidades · 18 units
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Nervión, Sevilla
          </span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Construcción lista · Ready to build
          </span>
        </div>
      </div>

      {/* ── Highlights ────────────────────────────────────────────────── */}
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

      {/* ── About ─────────────────────────────────────────────────────── */}
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

      {/* ── Gallery ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-semibold sm:text-3xl">{copy.galleryTitle}</h2>
        <div
          className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3"
          style={{ gridTemplateRows: '280px 280px' }}
        >
          {/* Large featured image — patio, spans 2 cols × 2 rows */}
          <div className="sm:col-span-2 sm:row-span-2">
            <img
              src={RENDER_IMAGES[3]}
              alt=""
              className="h-[300px] w-full rounded-2xl object-cover sm:h-full"
            />
          </div>
          {/* Three smaller interior renders */}
          {RENDER_IMAGES.slice(0, 3).map(src => (
            <img
              key={src}
              src={src}
              alt=""
              className="h-[200px] w-full rounded-2xl object-cover sm:h-full"
            />
          ))}
        </div>
      </section>

      {/* ── Market intelligence ───────────────────────────────────────── */}
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

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 px-6 py-10 text-center text-sm text-neutral-400">
        <img
          src={LOGO_URL}
          alt="Grupo YAKGU"
          className="mx-auto mb-4 h-8 w-auto opacity-60"
        />
        {copy.footerLine}
      </footer>
    </div>
  );
}
