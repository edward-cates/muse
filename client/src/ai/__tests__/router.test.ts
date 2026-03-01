import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { classifyIntent } from '../router.ts'

describe('classifyIntent', () => {
  it('classifies "draw a flowchart" as canvas_edit', () => {
    assert.equal(classifyIntent('draw a flowchart'), 'canvas_edit')
  })

  it('classifies "research React hooks" as research', () => {
    assert.equal(classifyIntent('research React hooks'), 'research')
  })

  it('classifies "what can you do?" as chat', () => {
    assert.equal(classifyIntent('what can you do?'), 'chat')
  })

  it('classifies "find articles about CRDTs and add them to the board" as research', () => {
    assert.equal(classifyIntent('find articles about CRDTs and add them to the board'), 'research')
  })

  it('classifies "add a box labeled Auth" as canvas_edit', () => {
    assert.equal(classifyIntent('add a box labeled Auth'), 'canvas_edit')
  })

  it('classifies a bare URL as research', () => {
    assert.equal(classifyIntent('https://en.wikipedia.org/wiki/CRDT'), 'research')
  })

  it('classifies URL + short instruction as research', () => {
    assert.equal(classifyIntent('https://example.com summarize this'), 'research')
  })

  it('classifies "create a rectangle" as canvas_edit', () => {
    assert.equal(classifyIntent('create a rectangle'), 'canvas_edit')
  })

  it('classifies "search for the best CRDT libraries" as research', () => {
    assert.equal(classifyIntent('search for the best CRDT libraries'), 'research')
  })

  it('classifies "hello" as chat', () => {
    assert.equal(classifyIntent('hello'), 'chat')
  })

  it('classifies "delete the Auth box" as canvas_edit', () => {
    assert.equal(classifyIntent('delete the Auth box'), 'canvas_edit')
  })

  it('classifies "what is a CRDT?" as research', () => {
    assert.equal(classifyIntent('what is a CRDT?'), 'research')
  })
})
