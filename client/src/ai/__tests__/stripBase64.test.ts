import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { stripBase64FromMessages } from '../stripBase64.js'

describe('stripBase64FromMessages', () => {
  it('replaces base64 data URI in tool_result content', () => {
    const fakeBase64 = 'A'.repeat(200)
    const messages = [
      { role: 'user', content: 'Generate an image of a cat' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'tu_1', name: 'generate_image', input: { prompt: 'a cat' } },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_1',
            content: JSON.stringify({
              url: `data:image/png;base64,${fakeBase64}`,
              revised_prompt: 'a cute cat sitting',
            }),
          },
        ],
      },
    ]

    const result = stripBase64FromMessages(messages)

    // tool_result should have base64 replaced
    const toolResult = (result[2].content as Array<{ type: string; content?: string }>)[0]
    const parsed = JSON.parse(toolResult.content!)
    assert.equal(parsed.url, '(image stored on canvas)')
    assert.equal(parsed.revised_prompt, 'a cute cat sitting')
  })

  it('leaves non-image tool results untouched', () => {
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_2',
            content: JSON.stringify({ success: true, id: 'shape-123' }),
          },
        ],
      },
    ]

    const result = stripBase64FromMessages(messages)
    const toolResult = (result[0].content as Array<{ type: string; content?: string }>)[0]
    assert.equal(toolResult.content, messages[0].content[0].content)
  })

  it('leaves plain string messages untouched', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ]

    const result = stripBase64FromMessages(messages)
    assert.deepEqual(result, messages)
  })

  it('handles multiple tool results in one message', () => {
    const fakeBase64 = 'B'.repeat(200)
    const messages = [
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'tu_1',
            content: JSON.stringify({ url: `data:image/jpeg;base64,${fakeBase64}` }),
          },
          {
            type: 'tool_result',
            tool_use_id: 'tu_2',
            content: JSON.stringify({ success: true }),
          },
        ],
      },
    ]

    const result = stripBase64FromMessages(messages)
    const blocks = result[0].content as Array<{ type: string; content?: string }>

    // First should be stripped
    const parsed1 = JSON.parse(blocks[0].content!)
    assert.equal(parsed1.url, '(image stored on canvas)')

    // Second should be unchanged
    const parsed2 = JSON.parse(blocks[1].content!)
    assert.equal(parsed2.success, true)
  })
})
