import { promises as fs } from 'fs';
import path from 'path';

// Vendored from coreyhaines31/marketingskills into .claude/skills — see
// CLAUDE.md. next.config.mjs's outputFileTracingIncludes ships this
// directory into the Pepe (telegram) serverless function so these reads
// work in production, not just locally.
const SKILLS_ROOT = path.join(process.cwd(), '.claude', 'skills');

// name + a short (~15 word) description for tool-description discovery —
// trimmed from the full descriptions in .claude/skills/*/SKILL.md.
export const MARKETING_SKILLS = [
  { name: 'ab-testing', description: 'Plan, design, or implement an A/B test, experiment, or growth experimentation program.' },
  { name: 'ad-creative', description: 'Generate, iterate, or scale ad creative — headlines, descriptions, primary text, static/video ad variations.' },
  { name: 'ads', description: 'Paid advertising strategy on Google, Meta, LinkedIn, X — targeting, budget, bidding, ABM.' },
  { name: 'ai-seo', description: 'Optimize content to get cited by LLMs / appear in AI Overviews (AEO, GEO, LLMO).' },
  { name: 'analytics', description: 'Set up, improve, or audit analytics tracking — GA4, GTM, event tracking, UTMs.' },
  { name: 'aso', description: 'Audit or optimize an App Store / Google Play listing.' },
  { name: 'attribution', description: 'Choose/interpret attribution models, reconcile conflicting channel numbers, real CAC, MMM, incrementality.' },
  { name: 'churn-prevention', description: 'Reduce churn — cancel flows, save offers, dunning, failed-payment recovery, win-back.' },
  { name: 'co-marketing', description: 'Find co-marketing partners, plan joint campaigns, brainstorm partnership opportunities.' },
  { name: 'cold-email', description: 'Write B2B cold outreach emails and follow-up sequences that get replies.' },
  { name: 'community-marketing', description: 'Build and leverage online communities (Discord/Slack/forum) to drive growth and loyalty.' },
  { name: 'competitor-profiling', description: 'Research and profile competitors from their URLs into structured dossiers.' },
  { name: 'competitors', description: 'Create competitor comparison / alternative pages for SEO and sales enablement.' },
  { name: 'content-strategy', description: 'Plan content strategy — what to write about, topic clusters, editorial calendar.' },
  { name: 'copy-editing', description: 'Edit, review, or refresh existing marketing copy rather than writing from scratch.' },
  { name: 'copywriting', description: 'Write or rewrite marketing page copy — headlines, hero sections, CTAs, value props.' },
  { name: 'cro', description: 'Optimize conversions on any marketing page or form (homepage, landing, pricing).' },
  { name: 'customer-research', description: 'Conduct, analyze, or synthesize customer research — interviews, reviews, personas, JTBD.' },
  { name: 'directory-submissions', description: 'Submit the product to startup/SaaS/AI directories for backlinks and discovery.' },
  { name: 'emails', description: 'Create or optimize an automated email sequence, drip campaign, or lifecycle flow.' },
  { name: 'free-tools', description: 'Plan/build a free tool (calculator, grader) for lead gen or SEO value.' },
  { name: 'image', description: 'Create, generate, edit, or optimize marketing images — heroes, social graphics, mockups.' },
  { name: 'influencer-marketing', description: 'Run influencer/creator/ambassador partnerships — finding, vetting, briefing, disclosure, ROI.' },
  { name: 'launch', description: 'Plan a product launch, feature announcement, or release strategy.' },
  { name: 'lead-magnets', description: 'Create or optimize a lead magnet (ebook, checklist, template) for email capture.' },
  { name: 'marketing-council', description: 'Get multiple expert marketer perspectives (Godin, Ogilvy, Hormozi, etc.) on a question.' },
  { name: 'marketing-ideas', description: 'Brainstorm marketing/growth ideas or strategies when stuck or looking for inspiration.' },
  { name: 'marketing-loops', description: 'Set up a recurring, self-running marketing workflow on a cadence.' },
  { name: 'marketing-plan', description: 'Build a comprehensive AARRR-structured marketing/growth plan for a product or client.' },
  { name: 'marketing-psychology', description: 'Apply psychological principles / mental models (anchoring, scarcity, social proof) to marketing.' },
  { name: 'offers', description: 'Design or improve an offer — value stacking, guarantees, scarcity, naming, payment structure.' },
  { name: 'onboarding', description: 'Optimize post-signup onboarding, user activation, first-run experience, time-to-value.' },
  { name: 'paywalls', description: 'Create or optimize in-app paywalls, upgrade screens, upsell modals, feature gates.' },
  { name: 'popups', description: 'Create or optimize popups, modals, overlays, slide-ins, or banners for conversion.' },
  { name: 'pricing', description: 'Pricing, packaging, or monetization strategy decisions.' },
  { name: 'product-marketing', description: 'Create/update the product marketing context doc — product, audience, positioning.' },
  { name: 'programmatic-seo', description: 'Create SEO-driven pages at scale using templates and data.' },
  { name: 'prospecting', description: 'Find, qualify, and build a list of prospects to reach out to.' },
  { name: 'public-relations', description: 'Public relations, earned media, press coverage, journalist outreach strategy.' },
  { name: 'referrals', description: 'Create, optimize, or analyze a referral, affiliate, or word-of-mouth program.' },
  { name: 'revops', description: 'Revenue operations — lead lifecycle, scoring, routing, marketing-to-sales handoff.' },
  { name: 'sales-enablement', description: 'Create sales collateral — decks, one-pagers, objection docs, demo scripts.' },
  { name: 'schema', description: 'Add, fix, or optimize schema markup and structured data on a site.' },
  { name: 'seo-audit', description: 'Audit, review, or diagnose technical and on-page SEO issues on a site.' },
  { name: 'signup', description: 'Optimize signup, registration, account creation, or trial activation flows.' },
  { name: 'site-architecture', description: 'Plan/map a site\'s page hierarchy, navigation, URL structure, internal linking.' },
  { name: 'sms', description: 'Plan, build, or optimize SMS/MMS marketing — welcome flows, abandoned cart texts.' },
  { name: 'social', description: 'Create, schedule, or optimize social media content for LinkedIn, X, Instagram, etc.' },
  { name: 'video', description: 'Create, generate, or produce video content using AI tools or programmatic frameworks.' },
] as const;

export type MarketingSkillName = (typeof MARKETING_SKILLS)[number]['name'];

const VALID_SKILL_NAMES = new Set<string>(MARKETING_SKILLS.map(s => s.name));

// Tool-result cap — the largest SKILL.md files run ~27KB, comfortably under
// this; individual reference files run larger in a few skills (e.g.
// marketing-plan), so this still guards against dumping an oversized file
// into the conversation.
const MAX_SKILL_CONTENT_CHARS = 40_000;

function truncate(text: string): string {
  if (text.length <= MAX_SKILL_CONTENT_CHARS) return text;
  return `${text.slice(0, MAX_SKILL_CONTENT_CHARS)}\n\n[...truncated — content continues past ${MAX_SKILL_CONTENT_CHARS} chars]`;
}

export async function loadMarketingSkill(skill: string, referenceFile?: string): Promise<string> {
  if (!VALID_SKILL_NAMES.has(skill)) {
    throw new Error(`Unknown skill "${skill}". Valid skills: ${[...VALID_SKILL_NAMES].join(', ')}`);
  }
  const skillDir = path.join(SKILLS_ROOT, skill);

  if (referenceFile) {
    // referenceFile must resolve to a path inside skillDir — blocks "../"
    // traversal out of the skill's own directory.
    const resolved = path.join(skillDir, referenceFile);
    if (resolved !== skillDir && !resolved.startsWith(skillDir + path.sep)) {
      throw new Error('Invalid reference file path.');
    }
    return truncate(await fs.readFile(resolved, 'utf-8'));
  }

  return truncate(await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf-8'));
}
