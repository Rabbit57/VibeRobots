'use client';

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { COURSES } from '@/game/content/boards';
import { ROBOTS } from '@/game/content/robots';
import { appendPresentationBatch, applyPresentationEvent, reconcilePresentation, resetPresentation, type PresentationStep } from '@/game/presentation';
import type { MatchEvent, PrivateMatchView, ProgramCard, PublicRobotView } from '@/game/types';
import { CourseChip, HomePanel, JoinPanel, LegalPanel, LobbyPanel, MatchHud, type PlaybackView } from './game-ui';
import type { GraphicsQuality } from './factory-scene';
import type { VisualFixture } from '@/game/visual-fixtures';

const FactoryScene = lazy(() => import('./factory-scene').then((module) => ({ default: module.FactoryScene })));

type Screen = 'home' | 'lobby' | 'match';
type RoomReply = { code: string; seatId: string; seatToken: string; view: PrivateMatchView };

export function VibeRobotsGame({ title }: { title: string }) {
  const [screen, setScreen] = useState<Screen>('home');
  const [roomCode, setRoomCode] = useState('');
  const [name, setName] = useState('');
  const [robotId, setRobotId] = useState(ROBOTS[0].id);
  const [view, setView] = useState<PrivateMatchView>();
  const [selected, setSelected] = useState<string[]>([]);
  const [courseId, setCourseId] = useState(COURSES[0].id);
  const [fourLives, setFourLives] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fast, setFast] = useState(false);
  const [quality, setQuality] = useState<GraphicsQuality>('auto');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [cameraReset, setCameraReset] = useState(0);
  const [visualFixture, setVisualFixture] = useState<VisualFixture>();
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const socket = useRef<WebSocket | undefined>(undefined);
  const audio = useRef<AudioContext | undefined>(undefined);
  const reconnectTimer = useRef<number | undefined>(undefined);
  const shuttingDown = useRef(false);

  const publicState = view?.public;
  const ownRobot = publicState?.robots.find((robot) => robot.seatId === view?.seatId);
  const isHost = publicState?.hostSeatId === view?.seatId;
  const selectedCourse = COURSES.find((course) => course.id === (publicState?.courseId ?? courseId)) ?? COURSES[0];
  const scheduledPlayback = usePresentationPlayback(view, fast, reducedMotion, connectionEpoch);
  const playback: PlaybackView = visualFixture ? {
    robots: visualFixture.view?.public.robots ?? [],
    active: visualFixture.activeEvent ? { event: visualFixture.activeEvent, durationMs: 1_000 } : undefined,
    remaining: 0,
    playing: Boolean(visualFixture.activeEvent),
  } : scheduledPlayback;

  const playSfx = useCallback((event?: MatchEvent) => {
    if (muted || typeof window === 'undefined') return;
    const context = audio.current ?? new AudioContext();
    audio.current = context;
    if (context.state === 'suspended') void context.resume();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const type = event?.type;
    oscillator.type = type === 'damage' || type === 'destroyed' ? 'sawtooth' : type === 'laser-fired' ? 'square' : 'sine';
    const frequency = type === 'laser-fired' ? 620 : type === 'damage' ? 105 : type === 'checkpoint' || type === 'victory' ? 520 : type === 'move' ? 170 : 240;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(type === 'laser-fired' ? 130 : Math.max(70, frequency * 1.24), now + 0.13);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(type === 'damage' ? 0.045 : 0.026, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === 'victory' ? 0.32 : 0.16));
    const pan = context.createStereoPanner();
    const x = event?.to?.x ?? event?.from?.x ?? 6;
    pan.pan.value = Math.max(-0.72, Math.min(0.72, (x - 6) / 8));
    oscillator.connect(gain).connect(pan).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + (type === 'victory' ? 0.34 : 0.18));
  }, [muted]);

  useEffect(() => {
    if (playback.active) playSfx(playback.active.event);
  }, [playback.active?.event.revision, playSfx]);

  const connect = useCallback((code: string, seatId: string, seatToken: string) => {
    window.clearTimeout(reconnectTimer.current);
    socket.current?.close();
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/api/rooms/${code}/socket`);
    socket.current = ws;
    setConnectionEpoch((value) => value + 1);
    ws.addEventListener('open', () => {
      setError('');
      ws.send(JSON.stringify({ type: 'authenticate', seatId, seatToken }));
    });
    ws.addEventListener('message', (message) => {
      const payload = JSON.parse(String(message.data)) as { type: string; view?: PrivateMatchView; error?: string };
      if (payload.view) {
        setView(payload.view);
        setScreen(payload.view.public.phase === 'lobby' ? 'lobby' : 'match');
        setError('');
      }
      if (payload.error) setError(payload.error);
    });
    ws.addEventListener('close', () => {
      if (socket.current !== ws || shuttingDown.current) return;
      setError('The factory paused while the connection catches up…');
      reconnectTimer.current = window.setTimeout(() => connect(code, seatId, seatToken), 1_200);
    });
  }, []);

  useEffect(() => {
    setHydrated(true);
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const params = new URLSearchParams(window.location.search);
    const visual = params.get('visual');
    if (visual && process.env.NODE_ENV !== 'production') {
      void import('@/game/visual-fixtures').then(({ makeVisualFixture }) => {
        const fixture = makeVisualFixture(visual);
        if (!fixture) return;
        setVisualFixture(fixture);
        setScreen(fixture.screen);
        setView(fixture.view);
        setCourseId(fixture.view?.public.courseId ?? COURSES[0].id);
      });
      return;
    }
    const code = params.get('room')?.toUpperCase() ?? '';
    if (!code) return;
    setRoomCode(code);
    setScreen('lobby');
    const saved = loadSeat(code);
    if (saved) {
      connect(code, saved.seatId, saved.seatToken);
      return;
    }
    void fetch(`/api/rooms/${code}`).then(async (response) => {
      if (!response.ok) throw new Error('Room not found or expired.');
      const metadata = await response.json() as PrivateMatchView['public'];
      const used = new Set(metadata.robots.map((robot) => robot.robotId));
      setRobotId(ROBOTS.find((robot) => !used.has(robot.id))?.id ?? ROBOTS[0].id);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Room unavailable.'));
  }, [connect]);

  async function createRoom() {
    setBusy(true);
    setError('');
    playSfx();
    try {
      const response = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: name.trim() || 'Host', robotId }) });
      const data = await response.json() as RoomReply & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Room creation failed.');
      saveSeat(data.code, data.seatId, data.seatToken);
      history.replaceState(null, '', `?room=${data.code}`);
      setRoomCode(data.code);
      setView(data.view);
      setScreen('lobby');
      connect(data.code, data.seatId, data.seatToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create room.');
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    setBusy(true);
    setError('');
    playSfx();
    try {
      const code = roomCode.replace(/[^A-Z0-9]/g, '').slice(0, 10);
      const saved = loadSeat(code);
      if (saved) {
        connect(code, saved.seatId, saved.seatToken);
        return;
      }
      const response = await fetch(`/api/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: name.trim() || 'Driver', robotId }) });
      const data = await response.json() as RoomReply & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not join that room.');
      saveSeat(code, data.seatId, data.seatToken);
      history.replaceState(null, '', `?room=${code}`);
      setView(data.view);
      setScreen('lobby');
      connect(code, data.seatId, data.seatToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not join room.');
    } finally {
      setBusy(false);
    }
  }

  const send = useCallback((type: string, extra: Record<string, unknown> = {}) => {
    if (!socket.current || !view) return;
    socket.current.send(JSON.stringify({ type: 'command', command: { type, id: crypto.randomUUID(), revision: view.public.revision, ...extra } }));
  }, [view]);

  function toggleCard(card: ProgramCard) {
    if (ownRobot?.finishedProgramming || playback.playing) return;
    const openRegisters = ownRobot?.registers.filter((register) => !register.locked).length ?? 5;
    setSelected((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : current.length < openRegisters ? [...current, card.id] : current);
    playSfx();
  }

  function moveSelected(id: string, amount: number) {
    setSelected((current) => {
      const next = [...current];
      const from = next.indexOf(id);
      const to = Math.max(0, Math.min(next.length - 1, from + amount));
      if (from < 0 || from === to) return current;
      next.splice(from, 1);
      next.splice(to, 0, id);
      return next;
    });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (screen !== 'match' || !view || playback.playing) return;
      const digit = Number(event.key);
      if (digit >= 1 && digit <= 9 && view.hand[digit - 1]) toggleCard(view.hand[digit - 1]);
      if (event.key === 'Enter' && selected.length) send('program', { cards: selected });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    shuttingDown.current = false;
    return () => {
      shuttingDown.current = true;
      window.clearTimeout(reconnectTimer.current);
      socket.current?.close();
      void audio.current?.close();
    };
  }, []);

  useEffect(() => setSelected([]), [view?.hand.map((card) => card.id).join('|')]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      (window as typeof window & { __VIBE_MATCH__?: PrivateMatchView }).__VIBE_MATCH__ = view;
    }
  }, [view]);

  const showScene = Boolean(view) && screen !== 'home';
  return <div className={`game-root ${fast ? 'speed-fast' : ''} ${reducedMotion ? 'reduce-motion' : ''}`} data-ready={hydrated} data-visual={visualFixture?.mode}>
    <div className="phone-gate"><span className="phone-robot">◉‿◉</span><h1>Factory floor too small</h1><p>The diorama likes a wider table. Turn a tablet sideways or open Vibe Robots on a desktop to play.</p></div>
    <header className="topbar">
      <button className="brand" type="button" onClick={() => setScreen('home')} aria-label="Vibe Robots home"><span className="brand-mark">VR</span><span>{title}</span></button>
      <div className="status-strip"><i className={publicState?.phase === 'paused' ? 'amber' : ''}/><span>{playback.playing ? playbackLabel(playback.active?.event) : publicState ? phaseLabel(publicState.phase) : 'Workshop ready'}</span></div>
      <nav className="top-actions" aria-label="Presentation settings">
        <button type="button" aria-pressed={fast} onClick={() => setFast(!fast)}>{fast ? 'FAST' : '1×'}</button>
        <button type="button" aria-pressed={muted} onClick={() => { setMuted(!muted); playSfx(); }}>{muted ? 'SOUND OFF' : 'SOUND ON'}</button>
        <button type="button" onClick={() => setQuality(nextQuality(quality))}>GRAPHICS {quality.toUpperCase()}</button>
        {showScene && <button type="button" onClick={() => setCameraReset((value) => value + 1)}>CENTER</button>}
        <button type="button" onClick={() => setLegalOpen(true)}>ABOUT</button>
      </nav>
    </header>
    <section className={`factory-viewport ${showScene ? 'scene-live' : 'hero-live'}`} aria-label={showScene ? `3D view of ${selectedCourse.name}` : 'Cozy robot workshop'}>
      <picture className="key-art">
        <source srcSet="/assets/images/vibe-robots-key-art.avif" type="image/avif"/>
        <img src="/assets/images/vibe-robots-key-art.webp" alt="Eight friendly racing robots on a miniature factory board"/>
      </picture>
      {showScene && <Suspense fallback={<SceneLoader/>}><FactoryScene course={selectedCourse} robots={playback.robots} activeEvent={playback.active?.event} stepDurationMs={playback.active?.durationMs ?? 0} reducedMotion={reducedMotion} quality={quality} cameraReset={cameraReset}/></Suspense>}
      <div className="warm-vignette"/>
      {publicState && <CourseChip courseId={selectedCourse.id}/>}
    </section>
    {screen === 'home' && <HomePanel name={name} setName={setName} robotId={robotId} setRobotId={setRobotId} roomCode={roomCode} setRoomCode={setRoomCode} createRoom={createRoom} joinRoom={joinRoom} busy={busy || !hydrated} error={error}/>}
    {screen === 'lobby' && view && <LobbyPanel view={view} roomCode={roomCode} isHost={isHost} courseId={courseId} setCourseId={setCourseId} fourLives={fourLives} setFourLives={setFourLives} start={() => send('start', { courseId, fourLifeRule: fourLives })} error={error}/>}
    {screen === 'lobby' && !view && <JoinPanel roomCode={roomCode} name={name} setName={setName} robotId={robotId} setRobotId={setRobotId} join={joinRoom} busy={busy || !hydrated} error={error}/>}
    {screen === 'match' && view && <MatchHud view={view} sceneRobots={playback.robots} selected={selected} toggle={toggleCard} moveSelected={moveSelected} submit={() => send('program', { cards: selected })} powerDown={() => send('announce-power-down', { enabled: !ownRobot?.powerDownNext })} activateOption={(optionId, payload) => send('option', { optionId, payload })} resolveDecision={(choice) => send('decision', { choice })} reducedMotion={reducedMotion} setReducedMotion={setReducedMotion} playback={playback}/>}
    {legalOpen && <LegalPanel close={() => setLegalOpen(false)}/>}
  </div>;
}

function usePresentationPlayback(view: PrivateMatchView | undefined, fast: boolean, reducedMotion: boolean, connectionEpoch: number): PlaybackView {
  const [robots, setRobots] = useState<PublicRobotView[]>([]);
  const [queue, setQueue] = useState<PresentationStep[]>([]);
  const [active, setActive] = useState<PresentationStep>();
  const lastQueued = useRef(0);
  const finalRobots = useRef<PublicRobotView[]>([]);
  const initialized = useRef(false);
  const seenConnectionEpoch = useRef(-1);

  useEffect(() => {
    if (!view) return;
    finalRobots.current = view.public.robots;
    if (seenConnectionEpoch.current !== connectionEpoch) {
      const reset = resetPresentation(view.public.robots, view.public.eventRevision);
      seenConnectionEpoch.current = connectionEpoch;
      initialized.current = true;
      lastQueued.current = reset.queue.lastRevision;
      setRobots(reset.robots);
      setQueue(reset.queue.steps);
      setActive(undefined);
      return;
    }
    const batch = appendPresentationBatch({ lastRevision: lastQueued.current, steps: [] }, view.events, fast ? 'fast' : 'normal', reducedMotion);
    if (batch.lastRevision !== lastQueued.current) {
      lastQueued.current = batch.lastRevision;
      setQueue((current) => [...current, ...batch.steps]);
    }
  }, [view, fast, reducedMotion, connectionEpoch]);

  useEffect(() => {
    if (active || queue.length === 0) return;
    const [next, ...rest] = queue;
    setQueue(rest);
    setRobots((current) => applyPresentationEvent(current, next.event));
    setActive(next);
    const timer = window.setTimeout(() => setActive(undefined), next.durationMs);
    return () => window.clearTimeout(timer);
  }, [active, queue]);

  useEffect(() => {
    if (!active && queue.length === 0 && initialized.current) setRobots((current) => reconcilePresentation(current, finalRobots.current));
  }, [active, queue.length, view?.public.revision]);

  return { robots, active, remaining: queue.length, playing: Boolean(active || queue.length) };
}

function SceneLoader() {
  return <div className="scene-loader" role="status"><i/><span>Assembling the tiny factory…</span></div>;
}

function phaseLabel(phase: string) {
  return ({ lobby: 'Friends gathering', programming: 'Planning phase', executing: 'Robots at work', paused: 'Paused · reconnecting', complete: 'Race complete', decision: 'Decision waiting' } as Record<string, string>)[phase] ?? phase;
}

function playbackLabel(event?: MatchEvent) {
  if (!event) return 'Winding the gears';
  return event.register ? `Register ${event.register} · ${event.stage ?? event.type}` : event.stage ?? event.type;
}

function nextQuality(quality: GraphicsQuality): GraphicsQuality {
  return quality === 'auto' ? 'high' : quality === 'high' ? 'eco' : 'auto';
}

function saveSeat(code: string, seatId: string, seatToken: string) {
  sessionStorage.setItem(`vibe-robots:${code}`, JSON.stringify({ seatId, seatToken }));
}

function loadSeat(code: string): { seatId: string; seatToken: string } | undefined {
  try { return JSON.parse(sessionStorage.getItem(`vibe-robots:${code}`) ?? 'null') ?? undefined; } catch { return; }
}
