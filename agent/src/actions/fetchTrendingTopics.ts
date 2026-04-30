import { Action, z } from '@botpress/runtime'
import { searchRecent } from '../lib/xClient'

// Category values are constrained at the schema boundary so the LLM cannot
// pass arbitrary strings — z.enum is the typed-enum equivalent in zod.
const Category = z.enum(['web3', 'ai', 'both'])
type Category = z.infer<typeof Category>

// Hand-tuned X search queries per category. `-is:retweet lang:en` reduces noise.
const QUERIES: Record<Category, string> = {
  web3:
    '(web3 OR ethereum OR solana OR "token launch" OR defi OR "protocol upgrade") -is:retweet lang:en',
  ai: '("AI model" OR "model release" OR LLM OR OpenAI OR Anthropic OR "AI funding") -is:retweet lang:en',
  both:
    '(web3 OR ethereum OR solana OR defi OR "AI model" OR LLM OR OpenAI OR Anthropic) -is:retweet lang:en',
}

// Action: callable from anywhere; exposed to the LLM via .asTool() in the
// conversation handler. Returns a small ranked list ready for summarization.
export default new Action({
  name: 'fetchTrendingTopics',
  description:
    'Fetch recent trending posts from X (Twitter) about Web3 and/or AI news. Use when the user asks what is happening, what is trending, or for recent news in these areas.',
  input: z.object({
    category: Category.describe(
      'Topic area to search: "web3", "ai", or "both" for a combined feed.',
    ),
    maxResults: z
      .number()
      .int()
      .min(10)
      .max(50)
      .default(20)
      .describe('How many posts to fetch (10–50).'),
  }),
  output: z.object({
    posts: z.array(
      z.object({
        id: z.string(),
        handle: z.string(),
        author: z.string(),
        text: z.string(),
        likes: z.number(),
        retweets: z.number(),
        replies: z.number(),
        url: z.string(),
        createdAt: z.string(),
      }),
    ),
  }),
  handler: async ({ input }) => {
    const { tweets, users } = await searchRecent(QUERIES[input.category], input.maxResults)

    const posts = tweets
      .map((t) => {
        const user = users.get(t.author_id)
        const handle = user?.username ?? 'unknown'
        return {
          id: t.id,
          handle,
          author: user?.name ?? handle,
          text: t.text,
          likes: t.public_metrics.like_count,
          retweets: t.public_metrics.retweet_count,
          replies: t.public_metrics.reply_count,
          url: `https://x.com/${handle}/status/${t.id}`,
          createdAt: t.created_at,
        }
      })
      // Cheap engagement sort so the LLM sees the loudest posts first.
      .sort(
        (a, b) =>
          b.likes + b.retweets * 2 + b.replies * 3 - (a.likes + a.retweets * 2 + a.replies * 3),
      )

    return { posts }
  },
})
