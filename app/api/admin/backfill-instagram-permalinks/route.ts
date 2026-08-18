import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchInstagramPermalink } from '@/lib/meta-poster';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// One-off repair for marketing_plan rows posted before the permalink fix in
// lib/meta-poster.ts: their post_url was hand-built from the media's numeric
// id (e.g. instagram.com/reel/18108425812864693/), which isn't the shortcode
// Instagram's public URLs actually use and so 404s. Re-fetches each row's
// real permalink from the Graph API and updates post_url in place.
// Admin-only via middleware.ts's /api/admin/:path* matcher.
export async function POST() {
  const { data: posts, error } = await supabase
    .from('marketing_plan')
    .select('id, post_url, platform_post_id')
    .eq('platform', 'instagram')
    .eq('status', 'posted')
    .not('platform_post_id', 'is', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let checked = 0;
  let updated = 0;
  const failures: Array<{ id: string; platform_post_id: string }> = [];

  for (const post of posts ?? []) {
    checked++;
    const permalink = await fetchInstagramPermalink(post.platform_post_id as string);
    if (!permalink) {
      failures.push({ id: post.id, platform_post_id: post.platform_post_id });
      continue;
    }
    if (permalink !== post.post_url) {
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
  }

  return NextResponse.json({ checked, updated, failed: failures.length, failures });
}
