# Server authority and privacy model

`game/` is a deterministic, renderer-independent TypeScript rules package. A match is a pure serializable `MatchState` plus a revisioned `MatchCommand` stream that emits ordered `MatchEvent` records. Rendering is a consumer of public state and never decides a rule outcome.

The custom Worker delegates ordinary page requests to Vinext and routes each ten-character room code to one SQLite-backed `MatchRoom` Durable Object. The object owns the shuffled decks, RNG state, hands, options, pending decision, registers, timer, seats, and event revision. It persists after every accepted command and uses hibernating WebSockets.

Seat tokens are 256-bit random values returned once over HTTPS and kept in browser session storage. Only SHA-256 hashes are persisted. Tokens never appear in room URLs, logs, lobby metadata, or broadcast views. A socket authenticates with its first message.

Every command carries a UUID and the expected room revision. The room rejects stale, duplicate, illegal, out-of-turn, and unauthorized commands, then returns a fresh private snapshot. Public views redact hands and unrevealed register cards. Structured logs contain room lifecycle and rejection categories, never tokens, hands, or private choices.

If an active socket closes, the room pauses before accepting another gameplay command. It resumes only when all active seats reconnect. Lobby host powers move to the oldest connected seat after 60 seconds; seat ownership never changes. Paused rooms expire after 24 hours and completed rooms retain their results view for two hours.
