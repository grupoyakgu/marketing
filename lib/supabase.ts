import { createClient } from '@supabase/supabase-js';

// Next.js auto-caches fetch() calls made by libraries under the hood, including
// the ones @supabase/supabase-js makes internally — a route's own
// `dynamic = 'force-dynamic'` only stops the outer response from being cached,
// not this inner fetch. Without `cache: 'no-store'` here, reads can return
// stale data seconds after a confirmed write (observed directly: a PATCH's own
// response showed the new image_url, but a GET six seconds later still
// returned null for the same row).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    global: {
      fetch: (url, options) => fetch(url, { ...options, cache: 'no-store' }),
    },
  }
);
