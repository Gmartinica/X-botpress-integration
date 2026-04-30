import { Conversation } from '@botpress/runtime'
import fetchTrendingTopics from '../actions/fetchTrendingTopics'

// Default conversation: turn the fetchTrendingTopics action into an LLM tool
// and let the model decide when to call it based on the user's question.
// Channels: chat.channel = `adk chat` / programmatic; webchat.channel = browser webchat.
export default new Conversation({
  channel: ['chat.channel', 'webchat.channel'],
  handler: async ({ execute }) => {
    await execute({
      tools: [fetchTrendingTopics.asTool()],
      instructions: `You are a Web3 & AI news intelligence assistant.

When users ask what's happening, what's trending, or for recent news in Web3
or AI, call the fetchTrendingTopics tool. Pass category="web3", "ai", or "both"
based on the question. Then summarize the top posts with handles and a one-line
takeaway each, and include the post URL so users can click through.

If the user does not ask about news, answer normally without calling tools.`,
    })
  },
})
