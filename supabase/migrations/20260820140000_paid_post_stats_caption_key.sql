-- Fallback match key for paid_post_stats: a normalized fragment of the
-- boosted post's own caption text (see normalizeCaption in lib/meta-ads.ts).
-- Boosting a post via Ads Manager's "Create Ad" flow can make Meta publish a
-- brand-new Instagram post carrying the same caption as its ad creative,
-- instead of referencing the original post's media id -- confirmed against a
-- real campaign whose creative had its own distinct instagram_permalink_url,
-- unrelated to the organic post it was boosted from. Shortcode matching
-- (post_url) can never bridge that gap since Meta genuinely treats them as
-- two different media objects; caption_key is the only signal still shared
-- between the two copies.

alter table paid_post_stats add column if not exists caption_key text;

create index if not exists paid_post_stats_caption_key_idx on paid_post_stats (caption_key);

notify pgrst, 'reload schema';
