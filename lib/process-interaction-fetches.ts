import {
  getPendingFetchRequestIds,
  claimFetchRequest,
  markFetchRequestDone,
  markFetchRequestFailed,
  releaseFetchRequestClaim,
} from './interaction-fetch-queue';
import { listTopics, listRecentUrls, countPosts, getDailyCount, type InteractionPlatform } from './interactions';
import { getMostRecentPepeChatId } from './marketing-plan';
import { chat } from './marketing-agent';
import { TelegramClient } from './telegram';
import { ChatBusyError } from './chat-lock';

const SEARCH_HINTS: Record<InteractionPlatform, string> = {
  linkedin: 'e.g. https://www.linkedin.com/search/results/content/?keywords=<topic, url-encoded>',
  instagram: 'e.g. https://www.instagram.com/explore/tags/<tag, no spaces, no #>/',
  facebook: 'e.g. https://www.facebook.com/search/posts/?q=<topic, url-encoded>',
};

async function buildInstructions(platform: InteractionPlatform): Promise<string> {
  const [topics, recentUrls] = await Promise.all([listTopics(), listRecentUrls(platform, 20)]);
  const topicsText = topics.length > 0
    ? topics.map(t => t.topic).join(', ')
    : 'general real estate / hospitality investment topics relevant to Grupo YAKGU';
  const avoidText = recentUrls.length > 0
    ? `\n\nAlready tracked — do not suggest any of these again:\n${recentUrls.map(u => `- ${u}`).join('\n')}`
    : '';

  return (
    `Find ONE new ${platform} post worth commenting on, for the Interactions feature.\n\n` +
    `Topics to search: ${topicsText}\n\n` +
    `Use browse_social_search (not browse_url) on a ${platform} search/hashtag results page for one of ` +
    `these topics — ${SEARCH_HINTS[platform]}. Judge from the screenshot which result is genuinely ` +
    `relevant, recent, and substantive (not spam, not our own company's own content), then pick its real ` +
    `link from the extracted links list and call add_interaction_post with platform="${platform}", that ` +
    `url, the topic it matches, and whatever author/content_preview/likes/comments/shares are visible on ` +
    `the page. If the first search doesn't turn up anything good, try one more before giving up — don't ` +
    `loop indefinitely, and never guess or construct a link yourself.${avoidText}`
  );
}

/** Drains the interaction_fetch_requests queue by asking Pepe (via his own
 * chat() loop, same as santi_delegations/bot_followups) to find one post per
 * request. Runs silently on success — this is background housekeeping, not a
 * user-initiated task, so it doesn't spam Telegram every 5 minutes; a
 * persistent failure still gets surfaced there so it doesn't go unnoticed. */
export async function processInteractionFetches(): Promise<{ processed: number }> {
  const ids = await getPendingFetchRequestIds();
  let processed = 0;

  for (const id of ids) {
    // Claimed atomically (pending -> processing) so an overlapping cron tick
    // — this runs every 5 minutes, and a single fetch (browsing + judging a
    // search page) can legitimately take longer — never picks up the same
    // request twice.
    const request = await claimFetchRequest(id);
    if (!request) continue;
    processed++;

    // The request may have been queued before another request (or another
    // delete's immediate backfill) already filled the platform's last open
    // slot — over-queueing is expected under races, see queueBackfillIfNeeded.
    // Checking the target here before spending an LLM turn + browse call
    // avoids both the wasted work and, more importantly, treats "already at
    // target" as the no-op it is rather than a search failure.
    const [before, target] = await Promise.all([countPosts(request.platform), getDailyCount(request.platform)]);
    if (before >= target) {
      await markFetchRequestDone(request.id);
      continue;
    }

    const chatId = await getMostRecentPepeChatId();
    if (!chatId) {
      await markFetchRequestFailed(request.id, 'No Pepe chat history yet to run this through.');
      continue;
    }

    try {
      // chat() completing without throwing only means Pepe's turn finished
      // cleanly — it says nothing about whether he actually called
      // add_interaction_post (e.g. every browse attempt could have failed
      // and he just explained that instead, or add_interaction_post_capped
      // rejected it because another request filled the slot first). Comparing
      // the post count before/after is the only reliable signal that this
      // request actually produced something, so a silent no-op doesn't get
      // recorded as done.
      const instructions = await buildInstructions(request.platform);
      const reply = await chat(chatId, instructions);
      const after = await countPosts(request.platform);

      if (after > before) {
        await markFetchRequestDone(request.id);
      } else if (after >= (await getDailyCount(request.platform))) {
        // Cap was reached by something else while this request was in
        // flight (e.g. an overlapping request for the same platform) — not
        // a genuine discovery failure, so no warning.
        await markFetchRequestDone(request.id);
      } else {
        await markFetchRequestFailed(request.id, reply);
        const telegram = new TelegramClient(process.env.TELEGRAM_BOT_TOKEN);
        await telegram
          .sendMessage(chatId, `⚠️ Couldn't find a new ${request.platform} post for Interactions:\n\n${reply}`)
          .catch(() => {});
      }
    } catch (err) {
      if (err instanceof ChatBusyError) {
        // Not a real failure — Pepe is still mid-turn on something else for
        // this chat. Put it back for the next tick instead of losing it to a
        // permanent 'failed' status (which would also wrongly count against
        // the daily failure cap in queueBackfillIfNeeded) or telling the
        // user about it.
        await releaseFetchRequestClaim(request.id);
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      await markFetchRequestFailed(request.id, message);
      const telegram = new TelegramClient(process.env.TELEGRAM_BOT_TOKEN);
      await telegram
        .sendMessage(chatId, `⚠️ Couldn't find a new ${request.platform} post for Interactions: ${message}`)
        .catch(() => {});
    }
  }

  return { processed };
}
