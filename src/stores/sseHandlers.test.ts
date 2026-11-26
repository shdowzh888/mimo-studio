// sseHandlers 纯函数测试
// 每个 handler 是 (state, payload) -> Partial<ChatState>，无副作用，适合表驱动测试

import { describe, it, expect } from 'vitest'
import {
  handlePartDelta,
  applyMergedDelta,
  handlePartUpdated,
  handlePartRemoved,
  handleMessageUpdated,
  handleMessageRemoved,
  handleSessionCreated,
  handleSessionUpdated,
  handleSessionDeleted,
  handleSessionStatus,
  handleSessionIdle,
  handleSessionDiff,
  handleSessionError,
  handlePermissionAsked,
  handlePermissionReplied,
  SSE_HANDLER_MAP,
} from '@/stores/sseHandlers'
import type { ChatState } from '@/stores/chatStore'
import type { TextPart, MessageWithParts, Part, SSEEventPayload } from '@/lib/mimoTypes'

// ── fixtures ──

const SID = 's1'
const MID = 'm1'
const PID = 'p1'

function textPart(id: string, text: string): TextPart {
  return { type: 'text', id, messageID: MID, sessionID: SID, text }
}

function message(parts: Part[], mid = MID, role: 'user' | 'assistant' = 'assistant'): MessageWithParts {
  return {
    info: {
      id: mid,
      sessionID: SID,
      role,
      time: { created: 1 },
      agent: 'main',
      model: { providerID: '', modelID: '' },
    },
    parts,
  }
}

// 构造最小可用的 ChatState（handlers 只读数据字段，不调方法）
function makeState(over: Partial<ChatState> = {}): ChatState {
  return {
    serverState: { status: 'disconnected' },
    currentSessionID: null,
    sessions: [],
    pinnedSessionIds: [],
    messages: {},
    sessionStatus: {},
    permissionRequests: {},
    sessionDiffs: {},
    lastError: null,
    currentProvider: 'mimo',
    currentModel: '',
    availableProviders: [],
    draftAttachments: {},
    ...over,
  } as unknown as ChatState
}

function payload(properties: unknown): SSEEventPayload {
  return { type: 'test', properties } as unknown as SSEEventPayload
}

// ── tests ──

describe('message.part.delta', () => {
  it('把 delta 追加到已存在的 text part', () => {
    const state = makeState({ messages: { [SID]: [message([textPart(PID, 'hello')])] } })
    const update = handlePartDelta(state, payload({ sessionID: SID, messageID: MID, partID: PID, field: 'text', delta: ' world' }))
    expect(update?.messages?.[SID][0].parts[0]).toMatchObject({ type: 'text', text: 'hello world' })
  })

  it('partID / messageID 不匹配时返回 null（不抛错）', () => {
    const state = makeState({ messages: { [SID]: [message([textPart(PID, 'hello')])] } })
    expect(handlePartDelta(state, payload({ sessionID: SID, messageID: MID, partID: 'nope', field: 'text', delta: 'x' }))).toBeNull()
    expect(handlePartDelta(state, payload({ sessionID: SID, messageID: 'nope', partID: PID, field: 'text', delta: 'x' }))).toBeNull()
  })

  it('session 不存在时返回 null', () => {
    const state = makeState({ messages: {} })
    expect(handlePartDelta(state, payload({ sessionID: SID, messageID: MID, partID: PID, field: 'text', delta: 'x' }))).toBeNull()
  })
})

describe('applyMergedDelta', () => {
  it('与 handlePartDelta 对单次 delta 产出一致', () => {
    const base = [message([textPart(PID, 'ab')])]
    const s1 = makeState({ messages: { [SID]: base } })
    const s2 = makeState({ messages: { [SID]: [message([textPart(PID, 'ab')])] } })
    const a = applyMergedDelta(s1, SID, MID, PID, 'text', 'cd')
    const b = handlePartDelta(s2, payload({ sessionID: SID, messageID: MID, partID: PID, field: 'text', delta: 'cd' }))
    expect(a?.messages?.[SID][0].parts[0]).toEqual(b?.messages?.[SID][0].parts[0])
  })

  it('不可变：不修改原 state 的 part 对象', () => {
    const original = textPart(PID, 'ab')
    const state = makeState({ messages: { [SID]: [message([original])] } })
    applyMergedDelta(state, SID, MID, PID, 'text', 'cd')
    // 原 part 对象的 text 不应被改动（实现是不可变更新，非旧注释说的 mutate）
    expect(original.text).toBe('ab')
  })
})

describe('message.part.updated', () => {
  it('替换已存在的 part', () => {
    const state = makeState({ messages: { [SID]: [message([textPart(PID, 'old')])] } })
    const updated = textPart(PID, 'new')
    const u = handlePartUpdated(state, payload({ sessionID: SID, part: updated, time: 2 }))
    expect(u?.messages?.[SID][0].parts[0]).toBe(updated)
  })

  it('part 不存在时 push 进 parts', () => {
    const state = makeState({ messages: { [SID]: [message([textPart(PID, 'keep')])] } })
    const u = handlePartUpdated(state, payload({ sessionID: SID, part: textPart('p2', 'added'), time: 2 }))
    expect(u?.messages?.[SID][0].parts).toHaveLength(2)
  })

  it('消息容器不存在时建 assistant 占位（part 先于 message.updated 到达）', () => {
    const state = makeState({ messages: { [SID]: [] } })
    const part = textPart(PID, 'streaming')
    const u = handlePartUpdated(state, payload({ sessionID: SID, part, time: 2 }))
    const placeholder = u?.messages?.[SID][0]
    expect(placeholder).toBeDefined()
    expect(placeholder!.info.role).toBe('assistant')
    expect(placeholder!.parts[0]).toBe(part)
  })
})

describe('message.part.removed', () => {
  it('按 partID 移除 part', () => {
    const state = makeState({ messages: { [SID]: [message([textPart('p1', 'a'), textPart('p2', 'b')])] } })
    const u = handlePartRemoved(state, payload({ sessionID: SID, messageID: MID, partID: 'p1' }))
    expect(u?.messages?.[SID][0].parts).toHaveLength(1)
    expect(u?.messages?.[SID][0].parts[0]).toHaveProperty('id', 'p2')
  })
})

describe('message.updated / message.removed', () => {
  it('updated 合并 info 到已有消息', () => {
    const state = makeState({ messages: { [SID]: [message([textPart(PID, 'x')])] } })
    const info = { id: MID, sessionID: SID, role: 'assistant' as const, time: { created: 1, completed: 9 }, agent: 'main', model: { providerID: 'p', modelID: 'm' } }
    const u = handleMessageUpdated(state, payload({ sessionID: SID, info }))
    expect(u?.messages?.[SID][0].info).toEqual(info)
  })

  it('updated 在消息不存在时新建（parts 为空）', () => {
    const state = makeState({ messages: { [SID]: [] } })
    const info = { id: MID, sessionID: SID, role: 'user' as const, time: { created: 1 }, agent: 'main', model: { providerID: '', modelID: '' } }
    const u = handleMessageUpdated(state, payload({ sessionID: SID, info }))
    expect(u?.messages?.[SID][0]).toEqual({ info, parts: [] })
  })

  it('removed 按 messageID 过滤掉消息', () => {
    const state = makeState({ messages: { [SID]: [message([textPart(PID, 'x')], 'm1'), message([textPart('p2', 'y')], 'm2')] } })
    const u = handleMessageRemoved(state, payload({ sessionID: SID, messageID: 'm1' }))
    expect(u?.messages?.[SID]).toHaveLength(1)
    expect(u?.messages?.[SID][0].info.id).toBe('m2')
  })
})

describe('session.*', () => {
  const session = (id: string, title = 't') => ({
    id, slug: id, projectID: 'p', directory: '/d', title, version: '1',
    time: { created: 1, updated: 1 },
  })

  it('created 前置新 session 并去重', () => {
    const state = makeState({ sessions: [session('a')] })
    const u = handleSessionCreated(state, payload({ sessionID: 'b', info: session('b') }))
    expect(u?.sessions?.map(s => s.id)).toEqual(['b', 'a'])
    // 已存在的不重复加
    expect(handleSessionCreated(makeState({ sessions: [session('a')] }), payload({ sessionID: 'a', info: session('a') }))).toBeNull()
  })

  it('updated 合并 session info', () => {
    const state = makeState({ sessions: [session('a', 'old')] })
    const u = handleSessionUpdated(state, payload({ sessionID: 'a', info: { id: 'a', title: 'new' } }))
    expect(u?.sessions?.[0].title).toBe('new')
  })

  it('deleted 移除 session 及其 messages/status，并清 currentSessionID', () => {
    const state = makeState({
      sessions: [session('a'), session('b')],
      messages: { a: [message([textPart(PID, 'x')])], b: [] },
      sessionStatus: { a: { type: 'busy' }, b: { type: 'idle' } },
      currentSessionID: 'a',
    })
    const u = handleSessionDeleted(state, payload({ sessionID: 'a', info: session('a') }))
    expect(u?.sessions?.map(s => s.id)).toEqual(['b'])
    expect(u?.messages).not.toHaveProperty('a')
    expect(u?.sessionStatus).not.toHaveProperty('a')
    expect(u?.currentSessionID).toBeNull()
  })

  it('status 写入 sessionStatus（带 sessionID）', () => {
    const state = makeState()
    const u = handleSessionStatus(state, payload({ sessionID: SID, status: { type: 'busy', message: 'working' } }))
    expect(u?.sessionStatus?.[SID]).toEqual({ type: 'busy', message: 'working' })
  })

  it('status 缺 sessionID 时回落到 currentSessionID', () => {
    const state = makeState({ currentSessionID: SID })
    const u = handleSessionStatus(state, payload({ status: { type: 'idle' } }))
    expect(u?.sessionStatus?.[SID]).toEqual({ type: 'idle' })
  })

  it('idle 标记 idle', () => {
    const state = makeState()
    const u = handleSessionIdle(state, payload({ sessionID: SID }))
    expect(u?.sessionStatus?.[SID]).toEqual({ type: 'idle' })
  })

  it('diff 写入 sessionDiffs', () => {
    const state = makeState()
    const diff = [{ path: '/a.ts', content: '-x\n+y' }]
    const u = handleSessionDiff(state, payload({ sessionID: SID, diff }))
    expect(u?.sessionDiffs?.[SID]).toBe(diff)
  })

  it('error 设置 lastError 并把该 session 标 idle', () => {
    const state = makeState({ messages: { [SID]: [message([textPart(PID, 'x')])] } })
    const u = handleSessionError(state, payload({ sessionID: SID, error: { name: 'X', message: 'boom' } }))
    expect(u?.lastError).toBeTruthy()
    expect(u?.sessionStatus?.[SID]).toEqual({ type: 'idle' })
  })
})

describe('permission.*', () => {
  it('asked 追加权限请求', () => {
    const state = makeState({ permissionRequests: { [SID]: [] } })
    const req = { id: 'r1', sessionID: SID, permission: 'bash', patterns: ['*'], metadata: {}, always: [] }
    const u = handlePermissionAsked(state, payload(req))
    expect(u?.permissionRequests?.[SID]).toHaveLength(1)
    expect(u?.permissionRequests?.[SID][0].id).toBe('r1')
  })

  it('replied 按 requestID 移除请求', () => {
    const state = makeState({
      permissionRequests: { [SID]: [
        { id: 'r1', sessionID: SID, permission: 'bash', patterns: ['*'], metadata: {}, always: [] },
        { id: 'r2', sessionID: SID, permission: 'edit', patterns: ['*'], metadata: {}, always: [] },
      ] },
    })
    const u = handlePermissionReplied(state, payload({ sessionID: SID, requestID: 'r1', reply: 'once' }))
    expect(u?.permissionRequests?.[SID]).toHaveLength(1)
    expect(u?.permissionRequests?.[SID][0].id).toBe('r2')
  })
})

describe('SSE_HANDLER_MAP 接线', () => {
  it('每个事件类型都映射到 handler', () => {
    const expected = [
      'message.part.delta', 'message.part.updated', 'message.part.removed',
      'message.updated', 'message.removed',
      'session.created', 'session.updated', 'session.deleted',
      'session.status', 'session.idle', 'session.diff', 'session.error',
      'permission.asked', 'permission.replied',
    ]
    for (const type of expected) {
      expect(SSE_HANDLER_MAP[type], `缺 handler: ${type}`).toBeDefined()
    }
  })
})
