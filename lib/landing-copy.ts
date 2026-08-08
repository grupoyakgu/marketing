import { supabase } from './supabase';
import { COPY, type InvestCopy, type Locale } from '@/app/invest/[locale]/copy';

// The subset of InvestCopy that's genuinely marketing content someone would
// reasonably ask Pepe to tweak in chat — excludes structural fields (dir,
// htmlLang, languageNames) and the form's functional UI strings (field
// labels/placeholders, button states, error/success messages), which stay
// code-controlled since an empty or malformed value there breaks the form
// itself rather than just reading oddly.
export interface EditableLandingCopy {
  metaTitle?: string;
  metaDescription?: string;
  eyebrow?: string;
  headline?: string;
  subheadline?: string;
  ctaPrimary?: string;
  highlightsTitle?: string;
  highlights?: { title: string; body: string }[];
  marketTitle?: string;
  marketIntro?: string;
  marketPoints?: string[];
  galleryTitle?: string;
  formTitle?: string;
  formSubtitle?: string;
  footerLine?: string;
}

async function fetchLandingCopy(locale: Locale): Promise<InvestCopy> {
  const { data, error } = await supabase
    .from('landing_page_copy')
    .select('overrides')
    .eq('locale', locale)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { ...COPY[locale], ...(data?.overrides as EditableLandingCopy | undefined) };
}

/** The live copy for a locale: hardcoded defaults with any saved edits
 * layered on top. Always returns a complete, renderable InvestCopy — a
 * Supabase error (outage, transient network blip) falls back to the static
 * defaults rather than taking down this public page entirely, same as the
 * best-effort fallback pattern used elsewhere in this app (e.g. engagement
 * stat fetches). Used by the public /invest page. */
export async function getLandingCopy(locale: Locale): Promise<InvestCopy> {
  try {
    return await fetchLandingCopy(locale);
  } catch (err) {
    console.error(`[landing-copy] getLandingCopy(${locale}) failed, falling back to defaults:`, err);
    return COPY[locale];
  }
}

/** Same read as getLandingCopy, but throws instead of falling back — for
 * Pepe's get_landing_page_copy tool, which needs to know a read genuinely
 * failed rather than being silently shown defaults it might mistake for the
 * real live content (and then overwrite with update_landing_page_copy). */
export async function getLandingCopyOrThrow(locale: Locale): Promise<InvestCopy> {
  return fetchLandingCopy(locale);
}

/** Merges the given fields into this locale's saved overrides (replacing
 * whole array fields like highlights/marketPoints, not deep-merging their
 * items) and returns the resulting full copy. */
export async function updateLandingCopy(
  locale: Locale,
  fields: EditableLandingCopy
): Promise<InvestCopy> {
  const { data: existing, error: readError } = await supabase
    .from('landing_page_copy')
    .select('overrides')
    .eq('locale', locale)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const mergedOverrides = { ...(existing?.overrides as EditableLandingCopy | undefined), ...fields };
  const { error: writeError } = await supabase
    .from('landing_page_copy')
    .upsert({ locale, overrides: mergedOverrides, updated_at: new Date().toISOString() });
  if (writeError) throw new Error(writeError.message);

  return { ...COPY[locale], ...mergedOverrides };
}
