import vinext from 'vinext/server/fetch-handler';
import { DurableObject } from 'cloudflare:workers';
import { addSeat, applyCommand, createLobby, privateView, publicView, RuleError, shuffled } from '../game/engine';
import type { MatchCommand, MatchEvent, MatchState } from '../game/types';

interface Env {
  MATCH_ROOMS: DurableObjectNamespace<MatchRoom>;
}

interface SeatSecret {
  hash: string;
  joinedAt: number;
  disconnectedAt?: number;
}

interface StoredRoom {
  state: MatchState;
  seats: Record<string, SeatSecret>;
  recentEvents: MatchEvent[];
}

interface SocketAttachment {
  authenticated: boolean;
  seatId?: string;
}

const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_LIFETIME = 24 * 60 * 60 * 1000;
const RESULTS_LIFETIME = 2 * 60 * 60 * 1000;

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      const code = randomCode();
      const id = env.MATCH_ROOMS.idFromName(code);
      return env.MATCH_ROOMS.get(id).fetch(new Request(`https://room.internal/create`, { method: 'POST', headers: request.headers, body: JSON.stringify({ ...(await safeJson(request)), code }) }));
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{10})(?:\/(join|socket))?$/i);
    if (match) {
      const code = match[1].toUpperCase();
      const action = match[2] ?? 'metadata';
      const id = env.MATCH_ROOMS.idFromName(code);
      const target = new URL(request.url);
      target.hostname = 'room.internal';
      target.pathname = `/${action}`;
      return env.MATCH_ROOMS.get(id).fetch(new Request(target, request));
    }
    return vinext.fetch(request, env, context);
  },
};

export class MatchRoom extends DurableObject<Env> {
  private room?: StoredRoom;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get<StoredRoom>('room'); });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/create' && request.method === 'POST') return await this.create(await safeJson(request));
      if (!this.room) return json({ error: 'Room not found or expired.' }, 404);
      if (url.pathname === '/join' && request.method === 'POST') return await this.join(await safeJson(request));
      if (url.pathname === '/metadata' && request.method === 'GET') return json(publicView(this.room.state));
      if (url.pathname === '/socket' && request.headers.get('upgrade')?.toLowerCase() === 'websocket') return this.upgrade();
      return json({ error: 'Unsupported room operation.' }, 405);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Room request failed.';
      this.log('request-rejected', { category: caught instanceof RuleError ? caught.category : 'invalid-request' });
      return json({ error: message }, caught instanceof RuleError ? 409 : 400);
    }
  }

  private async create(input: Record<string, unknown>) {
    if (this.room) return json({ error: 'Room code collision.' }, 409);
    const code = cleanCode(input.code);
    const displayName = cleanName(input.displayName);
    const robotId = cleanId(input.robotId);
    const seatId = crypto.randomUUID();
    const seatToken = randomToken();
    const state = createLobby(code, { seatId, robotId, displayName });
    this.room = { state, seats: { [seatId]: { hash: await hashToken(seatToken), joinedAt: Date.now() } }, recentEvents: [] };
    await this.persist();
    this.log('room-created', { code, players: 1 });
    return json({ code, seatId, seatToken, view: privateView(state, seatId) }, 201);
  }

  private async join(input: Record<string, unknown>) {
    const room = this.requireRoom();
    const seatId = crypto.randomUUID();
    const seatToken = randomToken();
    addSeat(room.state, { seatId, robotId: cleanId(input.robotId), displayName: cleanName(input.displayName) });
    room.seats[seatId] = { hash: await hashToken(seatToken), joinedAt: Date.now() };
    await this.persist();
    this.log('seat-joined', { code: room.state.roomCode, players: room.state.robots.length });
    this.broadcast([]);
    return json({ code: room.state.roomCode, seatId, seatToken, view: privateView(room.state, seatId) }, 201);
  }

  private upgrade() {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ authenticated: false } satisfies SocketAttachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer) {
    const room = this.requireRoom();
    let message: { type?: string; seatId?: string; seatToken?: string; command?: MatchCommand };
    try { message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)); }
    catch { return this.sendError(socket, 'Malformed message.'); }
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment?.authenticated) {
      if (message.type !== 'authenticate' || !message.seatId || !message.seatToken) return this.closeUnauthorized(socket);
      const secret = room.seats[message.seatId];
      if (!secret || !timingSafeEqual(secret.hash, await hashToken(message.seatToken))) return this.closeUnauthorized(socket);
      socket.serializeAttachment({ authenticated: true, seatId: message.seatId } satisfies SocketAttachment);
      secret.disconnectedAt = undefined;
      const robot = room.state.robots.find((candidate) => candidate.seatId === message.seatId)!;
      robot.connected = true;
      const active = room.state.robots.filter((candidate) => !candidate.eliminated);
      if (room.state.phase === 'paused' && active.every((candidate) => candidate.connected)) {
        room.state.phase = room.state.phaseBeforePause ?? 'programming';
        room.state.phaseBeforePause = undefined;
        room.state.revision += 1;
        this.log('match-resumed', { code: room.state.roomCode });
      }
      await this.persist();
      this.log('seat-reconnected', { code: room.state.roomCode, seatId: shortId(message.seatId) });
      this.broadcast([]);
      return;
    }
    if (message.type !== 'command' || !message.command || !attachment.seatId) return this.sendError(socket, 'Unsupported message.');
    try {
      const result = applyCommand(room.state, attachment.seatId, message.command);
      room.recentEvents = [...room.recentEvents, ...result.events].slice(-100);
      await this.persist();
      this.broadcast(result.events);
      if (room.state.timerDeadline || room.state.phase === 'complete') await this.scheduleAlarm();
    } catch (caught) {
      const category = caught instanceof RuleError ? caught.category : 'fatal-engine';
      this.log('command-rejected', { code: room.state.roomCode, category, command: message.command.type });
      if (!(caught instanceof RuleError)) console.error(JSON.stringify({ event: 'fatal-engine', code: room.state.roomCode, message: caught instanceof Error ? caught.message : 'unknown' }));
      socket.send(JSON.stringify({ type: 'rejected', error: caught instanceof Error ? caught.message : 'Command rejected.', view: privateView(room.state, attachment.seatId, []) }));
    }
  }

  async webSocketClose(socket: WebSocket) {
    await this.handleDisconnect(socket);
  }

  async webSocketError(socket: WebSocket) {
    await this.handleDisconnect(socket);
  }

  private async handleDisconnect(socket: WebSocket) {
    const room = this.room;
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!room || !attachment?.seatId) return;
    const robot = room.state.robots.find((candidate) => candidate.seatId === attachment.seatId);
    if (!robot) return;
    robot.connected = false;
    room.seats[attachment.seatId].disconnectedAt = Date.now();
    if (!['lobby', 'complete', 'paused'].includes(room.state.phase) && !robot.eliminated) {
      room.state.phaseBeforePause = room.state.phase;
      room.state.phase = 'paused';
      room.state.revision += 1;
      this.log('match-paused', { code: room.state.roomCode, seatId: shortId(attachment.seatId) });
    }
    await this.persist();
    await this.scheduleAlarm();
    this.broadcast([]);
  }

  async alarm() {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    if (room.state.phase === 'programming' && room.state.timerDeadline && room.state.timerDeadline <= now) {
      const robot = room.state.robots.find((candidate) => !candidate.finishedProgramming && !candidate.eliminated && !candidate.destroyed && !candidate.poweredDown);
      if (robot) {
        const count = robot.registers.filter((register) => !register.locked).length;
        const cards = shuffled(room.state.hands[robot.seatId] ?? [], room.state).slice(0, count).map((card) => card.id);
        const result = applyCommand(room.state, robot.seatId, { type: 'program', id: crypto.randomUUID(), revision: room.state.revision, cards });
        result.events.unshift({ revision: ++room.state.eventRevision, type: 'timer-expired', message: `${robot.displayName}'s remaining cards were placed at random.`, seatId: robot.seatId, robotId: robot.robotId, public: true });
        room.recentEvents = [...room.recentEvents, ...result.events].slice(-100);
        this.broadcast(result.events);
      }
    }
    const host = room.state.robots.find((candidate) => candidate.seatId === room.state.hostSeatId);
    const hostSecret = host && room.seats[host.seatId];
    if (room.state.phase === 'lobby' && host && !host.connected && hostSecret?.disconnectedAt && now - hostSecret.disconnectedAt >= 60_000) {
      const replacement = room.state.robots.filter((candidate) => candidate.connected).sort((a, b) => room.seats[a.seatId].joinedAt - room.seats[b.seatId].joinedAt)[0];
      if (replacement) {
        room.state.hostSeatId = replacement.seatId;
        room.state.revision += 1;
        this.log('host-transferred', { code: room.state.roomCode, seatId: shortId(replacement.seatId) });
        this.broadcast([]);
      }
    }
    const expiryBase = room.state.phase === 'complete' ? room.state.completedAt ?? room.state.updatedAt : room.state.updatedAt;
    const expiry = room.state.phase === 'complete' ? RESULTS_LIFETIME : ROOM_LIFETIME;
    if ((room.state.phase === 'paused' || room.state.phase === 'complete') && now - expiryBase >= expiry) {
      this.log('room-expired', { code: room.state.roomCode, phase: room.state.phase });
      await this.ctx.storage.deleteAll();
      this.room = undefined;
      return;
    }
    await this.persist();
    await this.scheduleAlarm();
  }

  private broadcast(events: MatchEvent[]) {
    const room = this.requireRoom();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment?.authenticated || !attachment.seatId) continue;
      try { socket.send(JSON.stringify({ type: 'snapshot', view: privateView(room.state, attachment.seatId, events) })); }
      catch { /* Hibernation runtime will deliver or close the socket. */ }
    }
  }

  private async persist() {
    if (!this.room) return;
    await this.ctx.storage.put('room', this.room);
  }

  private async scheduleAlarm() {
    const room = this.requireRoom();
    const times = [
      room.state.timerDeadline,
      ...Object.values(room.seats).map((seat) => seat.disconnectedAt ? seat.disconnectedAt + 60_000 : undefined),
      (room.state.phase === 'complete' ? room.state.completedAt ?? room.state.updatedAt : room.state.updatedAt) + (room.state.phase === 'complete' ? RESULTS_LIFETIME : ROOM_LIFETIME),
    ].filter((value): value is number => Boolean(value && value > Date.now()));
    if (times.length) await this.ctx.storage.setAlarm(Math.min(...times));
  }

  private requireRoom() {
    if (!this.room) throw new Error('Room not initialized.');
    return this.room;
  }

  private sendError(socket: WebSocket, error: string) {
    socket.send(JSON.stringify({ type: 'error', error }));
  }

  private closeUnauthorized(socket: WebSocket) {
    socket.close(4001, 'Authentication failed');
  }

  private log(event: string, details: Record<string, unknown>) {
    console.log(JSON.stringify({ event, ...details, at: new Date().toISOString() }));
  }
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join('');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (character) => ({ '+': '-', '/': '_', '=': '' })[character]!);
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function safeJson(request: Request): Promise<Record<string, unknown>> {
  try { return await request.json() as Record<string, unknown>; } catch { return {}; }
}

function cleanCode(value: unknown) {
  const code = String(value ?? '').toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(code)) throw new Error('Invalid room code.');
  return code;
}

function cleanName(value: unknown) {
  const name = String(value ?? '').replace(/[<>]/g, '').trim().slice(0, 24);
  if (!name) throw new Error('Enter a driver name.');
  return name;
}

function cleanId(value: unknown) {
  const id = String(value ?? '');
  if (!/^[a-z0-9-]{2,32}$/.test(id)) throw new Error('Invalid robot selection.');
  return id;
}

function shortId(value: string) {
  return value.slice(0, 8);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
