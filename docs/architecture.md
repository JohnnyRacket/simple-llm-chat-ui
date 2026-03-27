# Architecture: Durable Server-Side Streaming with Chat Routes

## Overview

This application is a chat UI for local LLMs (llama.cpp) with durable streaming and persistent chat history. The key architectural decision is that the **server is the primary consumer of the LLM stream**, not the client. If a user closes their browser mid-response, the server continues receiving tokens and saves the complete response to the database.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser                                    │
│                                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────────┐  │
│  │  Landing  │    │  /chat/[id]  │    │     ChatSidebar          │  │
│  │  Page (/) │───>│  Chat View   │    │  <Link> navigation       │  │
│  │           │    │  useChat()   │<──>│  Server-rendered list     │  │
│  └──────────┘    └──────┬───────┘    └──────────────────────────┘  │
│                         │                                           │
└─────────────────────────┼───────────────────────────────────────────┘
                          │
              POST /api/chat (SSE stream)
              GET /api/chat/[id]/stream (resume)
                          │
┌─────────────────────────┼───────────────────────────────────────────┐
│                    Next.js Server                                    │
│                         │                                           │
│  ┌──────────────────────▼───────────────────────────────────────┐  │
│  │                   POST /api/chat                              │  │
│  │                                                               │  │
│  │  1. Validate user (Caddy auth headers)                        │  │
│  │  2. Create chat + save user message (PostgreSQL)              │  │
│  │  3. Load full conversation from DB                            │  │
│  │  4. streamText() ──> LLM                                     │  │
│  │  5. toUIMessageStreamResponse()                               │  │
│  │     ├── SSE stream ──> Client (can disconnect)                │  │
│  │     └── consumeSseStream ──> Redis (always completes)         │  │
│  │  6. onFinish: save assistant message, clear active stream     │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │              GET /api/chat/[chatId]/stream                    │  │
│  │                                                               │  │
│  │  Check active_stream_id on chat row                           │  │
│  │  ├── null ──> 204 No Content (stream finished)                │  │
│  │  └── set  ──> resumeExistingStream() from Redis               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└──────────┬──────────────────────────┬───────────────────────────────┘
           │                          │
           ▼                          ▼
    ┌─────────────┐           ┌──────────────┐
    │  PostgreSQL  │           │    Redis     │
    │             │           │              │
    │  users      │           │  Resumable   │
    │  chats      │           │  stream      │
    │  messages   │           │  pub/sub     │
    └─────────────┘           └──────────────┘
           │
           │ http://192.168.1.168:{port}/v1
           ▼
    ┌──────────────┐
    │  llama.cpp   │
    │  :8080/:8081 │
    └──────────────┘
```

## New Chat Flow

```
 User                    Browser                   Server                  LLM         Redis       PostgreSQL
  │                        │                         │                      │            │             │
  │  Types message         │                         │                      │            │             │
  │───────────────────────>│                         │                      │            │             │
  │                        │  POST /api/chat         │                      │            │             │
  │                        │  { message, port }      │                      │            │             │
  │                        │────────────────────────>│                      │            │             │
  │                        │                         │  createChatWithMessage()          │             │
  │                        │                         │────────────────────────────────────────────────>│
  │                        │                         │                      │            │  chat + msg │
  │                        │                         │<────────────────────────────────────────────────│
  │                        │                         │                      │            │             │
  │                        │                         │  streamText()        │            │             │
  │                        │                         │─────────────────────>│            │             │
  │                        │                         │                      │            │             │
  │                        │   X-Chat-Id header      │                      │            │             │
  │                        │<────────────────────────│                      │            │             │
  │                        │                         │                      │            │             │
  │                        │  router.push(/chat/id)  │  consumeSseStream    │            │             │
  │                        │  (navigates away)       │──────────────────────────────────>│             │
  │                        │                         │  (tee'd to Redis)    │            │             │
  │                        │                         │                      │            │             │
  │  /chat/[id] loads      │                         │                      │            │             │
  │<───────────────────────│  SSR: loadMessages()    │                      │            │             │
  │                        │────────────────────────>│                      │            │             │
  │                        │<────────────────────────│                      │            │             │
  │                        │                         │                      │            │             │
  │  sees user message     │  useChat resume=true    │                      │            │             │
  │<───────────────────────│  GET /chat/id/stream    │                      │            │             │
  │                        │────────────────────────>│                      │            │             │
  │                        │                         │  resumeExistingStream()           │             │
  │                        │                         │──────────────────────────────────>│             │
  │                        │  SSE tokens             │                      │            │             │
  │  sees streaming text   │<────────────────────────│<─────────────────────────────────│             │
  │<───────────────────────│                         │                      │            │             │
  │                        │                         │                      │            │             │
  │                        │                         │  onFinish            │            │             │
  │                        │                         │<─────────────────────│            │             │
  │                        │                         │  appendMessage(assistant)         │             │
  │                        │                         │────────────────────────────────────────────────>│
  │                        │                         │  clearActiveStreamId()            │             │
  │                        │                         │────────────────────────────────────────────────>│
  │                        │                         │                      │            │             │
  │  response complete     │                         │                      │            │             │
  │<───────────────────────│                         │                      │            │             │
```

## Client Disconnect + Reconnect Flow

```
 User                    Browser                   Server                  Redis       PostgreSQL
  │                        │                         │                       │             │
  │  Closes tab mid-stream │                         │                       │             │
  │───────────────────────>│  (connection drops)     │                       │             │
  │                        │─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ >│                       │             │
  │                        │                         │                       │             │
  │                        │  Client SSE branch      │  Server tee branch    │             │
  │                        │  cancelled              │  keeps consuming      │             │
  │                        │                         │  from Redis copy      │             │
  │                        │                         │──────────────────────>│             │
  │                        │                         │                       │             │
  │                        │                         │  LLM finishes         │             │
  │                        │                         │  onFinish fires       │             │
  │                        │                         │                       │             │
  │                        │                         │  Save to DB           │             │
  │                        │                         │───────────────────────────────────>│
  │                        │                         │  Clear active_stream  │             │
  │                        │                         │───────────────────────────────────>│
  │                        │                         │                       │             │
  │                        │                         │                       │             │
  │  Returns later         │                         │                       │             │
  │───────────────────────>│  /chat/[id]             │                       │             │
  │                        │────────────────────────>│                       │             │
  │                        │                         │  loadMessages()       │             │
  │                        │                         │───────────────────────────────────>│
  │                        │  SSR: full conversation  │                       │             │
  │                        │<────────────────────────│                       │             │
  │                        │                         │                       │             │
  │                        │  GET /chat/id/stream    │                       │             │
  │                        │────────────────────────>│                       │             │
  │                        │  204 No Content         │  (no active stream)   │             │
  │                        │<────────────────────────│                       │             │
  │                        │                         │                       │             │
  │  Sees complete chat    │                         │                       │             │
  │<───────────────────────│                         │                       │             │
```

## Key AI SDK Primitives

The durability and resume features are built on top of four primitives from the [Vercel AI SDK](https://sdk.vercel.ai/):

### 1. `consumeSseStream` (server-side stream tee)

Part of `toUIMessageStreamResponse()`. Creates an independent copy of the SSE stream that the server can process regardless of client connection state.

```typescript
// app/api/chat/route.ts
result.toUIMessageStreamResponse({
  async consumeSseStream({ stream }) {
    const streamId = generateId();
    // Store the tee'd stream in Redis — survives client disconnect
    await streamContext.createNewResumableStream(streamId, () => stream);
    // Track which stream belongs to this chat
    await setActiveStreamId(resolvedChatId, streamId);
  },
});
```

Without this, the stream goes directly to the client response. If the client disconnects, the response stream closes and `onFinish` may never fire (the abort signal propagates to the LLM request). With `consumeSseStream`, the Redis copy keeps consuming tokens independently.

### 2. `resume` option on `useChat` (client-side auto-reconnect)

When `resume: true`, the `useChat` hook automatically attempts to reconnect to any active stream when the component mounts.

```typescript
// app/chat/[id]/chat-view.tsx
const { messages, sendMessage, status } = useChat<ChatMessage>({
  id: chatId,
  messages: initialMessages,  // from server-side rendering
  transport,
  resume: true,               // auto-reconnect on mount
});
```

On mount, it calls `transport.reconnectToStream({ chatId })` which hits the GET endpoint. If an active stream exists, tokens start flowing immediately. If not (204), it stays with `initialMessages`.

### 3. `DefaultChatTransport.reconnectToStream` (reconnect protocol)

The default reconnect URL pattern is `${api}/${chatId}/stream`, which with `api: '/api/chat'` becomes:

```
GET /api/chat/{chatId}/stream
```

The endpoint returns either:
- **SSE stream** with `UI_MESSAGE_STREAM_HEADERS` if a stream is active
- **204 No Content** if no active stream (completed or never existed)

```typescript
// app/api/chat/[chatId]/stream/route.ts
export async function GET(_req, { params }) {
  const { chatId } = await params;
  const activeStreamId = await getActiveStreamId(chatId, user.id);

  if (!activeStreamId) return new Response(null, { status: 204 });

  const stream = await streamContext.resumeExistingStream(activeStreamId);
  if (!stream) return new Response(null, { status: 204 });

  return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
}
```

### 4. `prepareSendMessagesRequest` (custom request format)

Since the server now loads the full conversation from the database, the client only needs to send the latest message (not the full history). This is configured via the transport:

```typescript
// app/chat/[id]/chat-view.tsx
const transport = new DefaultChatTransport({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ id, messages }) => ({
    body: {
      id,                               // chat ID
      message: messages[messages.length - 1],  // just the new message
      port: selectedPort,
    },
  }),
});
```

The server then loads the full conversation from PostgreSQL:

```typescript
// app/api/chat/route.ts
const dbMessages = await loadMessages(resolvedChatId, user.id);
const result = streamText({
  model: llm("model"),
  messages: await convertToModelMessages(dbMessages),
  // ...
});
```

## Supporting Infrastructure

### `resumable-stream` + Redis

The [`resumable-stream`](https://www.npmjs.com/package/resumable-stream) package handles the pub/sub mechanism for stream persistence. It stores stream chunks in Redis and allows multiple subscribers to connect/reconnect at any point.

```typescript
// lib/stream.ts
import { createResumableStreamContext } from "resumable-stream";
import { after } from "next/server";

export const streamContext = createResumableStreamContext({
  waitUntil: after,  // Next.js: keep work alive after response sent
});
```

The `after()` function from `next/server` ensures the stream consumption continues even after the HTTP response has been sent to the client.

### `active_stream_id` Column

A nullable `VARCHAR(255)` column on the `chats` table tracks whether a stream is in progress:

- **Set** when `consumeSseStream` fires (stream starts)
- **Cleared** when `onFinish` fires (stream completes)
- **Checked** by the GET reconnect endpoint to decide 204 vs stream

## Route Structure

```
/                              Landing page — new chat input
/chat/[id]                     Chat page — SSR messages + live streaming

/api/chat              POST    Send message, start LLM stream
/api/chat/[id]/stream  GET     Reconnect to active stream (or 204)
/api/chats             GET     List user's chats
/api/chats/[id]        DELETE  Delete a chat
/api/chats/[id]/messages GET   Load chat messages
/api/server-info       GET     LLM server model info
```

## Database Schema

```sql
users
├── id           UUID PRIMARY KEY
├── external_id  VARCHAR UNIQUE        -- from Caddy auth header
├── email        VARCHAR
├── name         VARCHAR
├── groups       TEXT[]
├── created_at   TIMESTAMPTZ
└── updated_at   TIMESTAMPTZ

chats
├── id                UUID PRIMARY KEY
├── user_id           UUID → users(id) CASCADE
├── title             VARCHAR
├── active_stream_id  VARCHAR(255)     -- tracks in-progress streams
├── created_at        TIMESTAMPTZ
└── updated_at        TIMESTAMPTZ

messages
├── id          UUID PRIMARY KEY
├── chat_id     UUID → chats(id) CASCADE
├── role        VARCHAR              -- "user" | "assistant"
├── content     TEXT
├── metadata    JSONB                -- token counts, generation speed
└── created_at  TIMESTAMPTZ
```

## Authentication

The app runs behind a Caddy reverse proxy with `caddy-security` (pocket-id). Caddy sets forwarded auth headers on every request:

```
Remote-User:   unique user identifier
Remote-Email:  user's email
Remote-Name:   display name
Remote-Groups: comma-separated group list
```

The `getUser()` function reads these headers and upserts the user into PostgreSQL. In development (no proxy), it falls back to a hardcoded dev user.
