import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LOCALES, type Locale } from './copy';
import { getLandingCopy } from '@/lib/landing-copy';
import { listCloudinaryImagesInFolder } from '@/lib/cloudinary';
import { InvestorForm } from './InvestorForm';
import { HeroSlider } from './HeroSlider';
import { PageViewTracker } from './PageViewTracker';

// Content is editable at runtime (Pepe's update_landing_page_copy tool), so
// this can't be statically generated at build time — every request needs a
// fresh read to reflect the latest edit.
export const dynamic = 'force-dynamic';

const LOGO_URL =
  'https://res.cloudinary.com/quupmn8b/image/upload/v1786266721/logo_3_qxkzbb.png';

const GALLERY_COUNT = 6;

// Images to pin at the front of the gallery (case-insensitive name match).
const GALLERY_PINNED = ['kitchen', 'terrace pool'];
// Images to exclude from the gallery entirely (case-insensitive name match).
const GALLERY_EXCLUDED = ['facade'];

const FOUNDER_IMAGE_NAME = 'founder_on_the_terrace_1';

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

  const [copy, galleryImages, founderImages] = await Promise.all([
    getLandingCopy(params.locale),
    listCloudinaryImagesInFolder('BDS 36').catch(err => {
      console.error('[invest] gallery fetch failed:', err);
      return [];
    }),
    listCloudinaryImagesInFolder('founders').catch(err => {
      console.error('[invest] founders fetch failed:', err);
      return [];
    }),
  ]);

  // Exclude any image whose name contains a term in GALLERY_EXCLUDED, then
  // surface the pinned images first (in the order declared), followed by the
  // remaining images in whatever order Cloudinary returns them.
  const eligible = galleryImages.filter(
    img => !GALLERY_EXCLUDED.some(term => img.name.toLowerCase().includes(term.toLowerCase()))
  );
  const pinned = GALLERY_PINNED
    .map(term => eligible.find(img => img.name.toLowerCase().includes(term.toLowerCase())))
    .filter((img): img is NonNullable<typeof img> => img !== undefined);
  const pinnedIds = new Set(pinned.map(img => img.id));
  const rest = eligible.filter(img => !pinnedIds.has(img.id));
  const gallery = [...pinned, ...rest].slice(0, GALLERY_COUNT);

  const founderImage = founderImages.find(img =>
    img.name.toLowerCase().includes(FOUNDER_IMAGE_NAME.toLowerCase())
  ) ?? null;

  return (
    <div dir={copy.dir} className="min-h-screen bg-neutral-950 text-white">

      {/* Fires a pageview event on mount — renders nothing visible */}
      <PageViewTracker locale={params.locale} />

      {/* ── Mobile-only logo bar ───────────────────────────────────────
          On desktop (lg+) the form panel renders its own logo inline.
          On mobile the layout stacks: slider first, form below — so
          without this the visitor scrolls past the entire hero before
          seeing any branding. Hidden on lg and up. */}
      <div className="flex items-center bg-neutral-900 px-6 py-4 lg:hidden">
        <img
          src={LOGO_URL}
          alt="Grupo YAKGU"
          className="h-10 w-auto object-contain"
        />
      </div>

      {/* ── Split-screen hero ─────────────────────────────────────────── */}
      <section className="flex min-h-screen flex-col lg:flex-row">

        {/* LEFT — image carousel panel (60%) */}
        <HeroSlider
          eyebrow={copy.eyebrow}
          headline={copy.headline}
          subheadline={copy.subheadline}
        />

        {/* RIGHT — dark form panel (40%) */}
        <div className="flex flex-col bg-neutral-900 lg:flex-[2] lg:overflow-y-auto">
          <div className="flex flex-1 flex-col justify-center px-8 py-10 lg:px-12 lg:py-12">

            {/* Logo — desktop only; mobile logo is in the bar above the hero */}
            <img
              src={LOGO_URL}
              alt="Grupo YAKGU"
              className="hidden h-12 w-auto object-contain lg:block"
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
          <div className="mt-6 flex flex-col gap-10 lg:flex-row lg:items-start lg:gap-14">
            {/* Text */}
            <div className="max-w-2xl space-y-4 lg:flex-1">
              {copy.aboutBody.map((para, i) => (
                // aboutBody strings may contain trusted inline HTML (e.g. <a> links
                // to our own pages) — content is hardcoded in copy.ts, never user input.
                // eslint-disable-next-line react/no-danger
                <p key={i} className="leading-relaxed text-neutral-300" dangerouslySetInnerHTML={{ __html: para }} />
              ))}
            </div>
            {/* Founder image */}
            {founderImage && (
              <div className="lg:w-72 lg:shrink-0">
                <img
                  src={founderImage.url}
                  alt={founderImage.name}
                  className="h-80 w-full rounded-2xl object-cover lg:h-96"
                />
              </div>
            )}
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
      {gallery.length > 0 && (
        <section className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-semibold sm:text-3xl">{copy.galleryTitle}</h2>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map(img => (
              <img
                key={img.id}
                src={img.url}
                alt={img.name}
                className="h-52 w-full rounded-2xl object-cover sm:h-64"
              />
            ))}
          </div>
        </section>
      )}

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
