import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getLinkedInPermalink } from '@/lib/linkedin-poster';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// One-off repair for marketing_plan rows posted before the permalink fix in
// lib/linkedin-poster.ts: their post_url was built directly from the
// x-restli-id urn (urn:li:ugcPost:... or urn:li:share:...), which isn't the
// urn:li:activity:... id LinkedIn's own web feed uses, so it 404s. Re-fetches
// each row's real activity permalink and updates post_url in place. Best
// effort -- getLinkedInPermalink falls back to the existing (possibly still
// broken) link on any lookup failure, so this never makes a link worse.
// Admin-only via middleware.ts's /api/admin/:path* matcher.
export async function POST() {
  const { data: posts, error } = await supabase
    .from('marketing_plan')
    .select('id, post_url, platform_post_id')
    .eq('platform', 'linkedin')
    .eq('status', 'posted')
    .not('platform_post_id', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let checked = 0;
  let updated = 0;
  const failures: Array<{ id: string; platform_post_id: string }> = [];

  for (const post of posts ?? []) {
    checked++;
    const permalink = await getLinkedInPermalink(post.platform_post_id as string);
    if (permalink === post.post_url) continue;
    const { error: updateError } = await supabase
      .from('marketing_plan')
      .update({ post_url: permalink })
      .eq('id', post.id);
    if (updateError) {
      failures.push({ id: post.id, platform_post_id: post.platform_post_id });
      continue;
    }
    updated++;
  }

  return NextResponse.json({ checked, updated, failed: failures.length, failures });
}
