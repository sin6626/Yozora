import { AIProviderType } from '~/modules/ai/ai.types'
import { OpenAICompatibleRuntime } from '~/modules/ai/runtime/openai-compatible.runtime'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

// DeepSeek's thinking mode is on by default, and it rejects a forced tool_choice
// ("Thinking mode does not support this tool_choice"), which is how structured output works.
// Translation, i18n and summaries ask for reasoningEffort 'none'; for DeepSeek that has to
// turn thinking off explicitly, not just leave reasoning_effort out.
const sent: Record<string, any>[] = []

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: async (params: Record<string, any>) => {
          sent.push(params)
          if (params.stream) {
            return (async function* () {
              yield { choices: [{ delta: { content: 'ok' } }] }
            })()
          }
          if (params.tools) {
            return {
              choices: [
                {
                  message: {
                    tool_calls: [
                      {
                        type: 'function',
                        function: {
                          name: 'structured_output',
                          arguments: '{"text":"hi"}',
                        },
                      },
                    ],
                  },
                },
              ],
            }
          }
          return { choices: [{ message: { content: 'ok' } }] }
        },
      },
    }
  },
}))

const runtime = (endpoint: string) =>
  new OpenAICompatibleRuntime({
    apiKey: 'test',
    endpoint,
    model: 'deepseek-flash',
    providerId: 'p',
    providerType: AIProviderType.OpenAICompatible,
  })

const last = () => sent.at(-1)!

describe('OpenAI-compatible runtime and thinking mode', () => {
  const schema = z.object({ text: z.string() })

  it('turns DeepSeek thinking off when no reasoning is wanted', async () => {
    const deepseek = runtime('https://api.deepseek.com')

    await deepseek.generateStructured({
      prompt: 'p',
      schema,
      reasoningEffort: 'none',
    })
    expect(last().thinking).toEqual({ type: 'disabled' })
    expect(last().reasoning_effort).toBeUndefined()
    expect(last().tool_choice).toEqual({
      type: 'function',
      function: { name: 'structured_output' },
    })

    await deepseek.generateText({ prompt: 'p', reasoningEffort: 'none' })
    expect(last().thinking).toEqual({ type: 'disabled' })

    for await (const _ of deepseek.generateTextStream({
      prompt: 'p',
      reasoningEffort: 'none',
    })) {
      // drain
    }
    expect(last().thinking).toEqual({ type: 'disabled' })
  })

  it('keeps DeepSeek thinking when a reasoning level is asked for', async () => {
    await runtime('https://api.deepseek.com/v1').generateText({
      prompt: 'p',
      reasoningEffort: 'high',
    })
    expect(last().thinking).toBeUndefined()
    expect(last().reasoning_effort).toBe('high')
  })

  it('does not send the DeepSeek-only parameter to other services', async () => {
    await runtime('https://api.example.com').generateStructured({
      prompt: 'p',
      schema,
      reasoningEffort: 'none',
    })
    expect(last()).not.toHaveProperty('thinking')
    expect(last().reasoning_effort).toBeUndefined()
  })
})
