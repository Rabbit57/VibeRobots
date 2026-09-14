'use client';

import { ContactShadows, Environment, Float, Html, OrbitControls, Sparkles } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { BOARD_BY_ID, COURSES, courseBounds, courseTile } from '@/game/content/boards';
import { PROGRAM_LABELS } from '@/game/content/programs';
import { OPTION_BY_ID } from '@/game/content/options';
import { ROBOTS, ROBOT_BY_ID } from '@/game/content/robots';
import type { CourseDefinition, Direction, MatchEvent, PrivateMatchView, ProgramCard, PublicRobotView } from '@/game/types';

type Screen = 'home' | 'lobby' | 'match';
type RoomReply = { code: string; seatId: string; seatToken: string; view: PrivateMatchView };

const ICONS: Record<string, string> = { move1: '↑', move2: '⇈', move3: '⇈', backup: '↓', left: '↶', right: '↷', uturn: '↻' };
const directionRotation: Record<Direction, number> = { north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 };

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
  const [reducedMotion, setReducedMotion] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const socket = useRef<WebSocket | undefined>(undefined);
  const audio = useRef<AudioContext | undefined>(undefined);

  const publicState = view?.public;
  const ownRobot = publicState?.robots.find((robot) => robot.seatId === view?.seatId);
  const isHost = publicState?.hostSeatId === view?.seatId;
  const selectedCourse = COURSES.find((course) => course.id === (publicState?.courseId ?? courseId)) ?? COURSES[0];

  const playTone = useCallback((frequency = 220, duration = 0.08) => {
    if (muted || typeof window === 'undefined') return;
    const context = audio.current ?? new AudioContext();
    audio.current = context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.025, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }, [muted]);

  const connect = useCallback((code: string, seatId: string, seatToken: string) => {
    socket.current?.close();
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/api/rooms/${code}/socket`);
    socket.current = ws;
    ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'authenticate', seatId, seatToken })));
    ws.addEventListener('message', (message) => {
      const payload = JSON.parse(String(message.data)) as { type: string; view?: PrivateMatchView; error?: string };
      if (payload.view) {
        setView(payload.view);
        setScreen(payload.view.public.phase === 'lobby' ? 'lobby' : 'match');
        if (payload.view.events.some((item) => item.type === 'damage')) playTone(90, 0.18);
        else if (payload.view.events.length) playTone(280, 0.06);
      }
      if (payload.error) setError(payload.error);
    });
    ws.addEventListener('close', () => setError('Connection paused. Reconnecting…'));
  }, [playTone]);

  useEffect(() => {
    setHydrated(true);
    const code = new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
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
  }, []);

  async function createRoom() {
    setBusy(true);
    setError('');
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

  function send(type: string, extra: Record<string, unknown> = {}) {
    if (!socket.current || !view) return;
    socket.current.send(JSON.stringify({ type: 'command', command: { type, id: crypto.randomUUID(), revision: view.public.revision, ...extra } }));
  }

  function toggleCard(card: ProgramCard) {
    if (ownRobot?.finishedProgramming) return;
    const openRegisters = ownRobot?.registers.filter((register) => !register.locked).length ?? 5;
    setSelected((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : current.length < openRegisters ? [...current, card.id] : current);
    playTone(180 + card.priority / 5);
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
      if (screen !== 'match' || !view) return;
      const digit = Number(event.key);
      if (digit >= 1 && digit <= 9 && view.hand[digit - 1]) toggleCard(view.hand[digit - 1]);
      if (event.key === 'Enter' && selected.length) send('program', { cards: selected });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => () => {
    socket.current?.close();
    void audio.current?.close();
  }, []);

  useEffect(() => {
    setSelected([]);
  }, [view?.hand.map((card) => card.id).join('|')]);

  return (
    <div className={`game-root ${fast ? 'speed-fast' : ''} ${reducedMotion ? 'reduce-motion' : ''}`} data-ready={hydrated}>
      <div className="phone-gate"><span>↻</span><h1>Factory floor too small</h1><p>Open Vibe Robots on a desktop or turn a larger tablet to landscape.</p></div>
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setScreen('home')} aria-label="Vibe Robots home"><span className="brand-mark">VR</span><span>{title}</span></button>
        <div className="status-strip"><i className={publicState?.phase === 'paused' ? 'amber' : 'green'} />{publicState ? phaseLabel(publicState.phase) : 'Factory standing by'}</div>
        <div className="top-actions">
          <button type="button" aria-pressed={fast} onClick={() => setFast(!fast)}>{fast ? 'FAST' : '1×'}</button>
          <button type="button" aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? 'SOUND OFF' : 'SOUND ON'}</button>
          <button type="button" onClick={() => setLegalOpen(true)}>ABOUT</button>
        </div>
      </header>

      <section className="factory-viewport" aria-label={`3D view of ${selectedCourse.name}`}>
        <FactoryScene course={selectedCourse} robots={publicState?.robots} reducedMotion={reducedMotion} />
        <div className="scanline" />
        {publicState && <div className="course-chip"><small>COURSE</small><strong>{selectedCourse.name}</strong><span>{selectedCourse.boards.map((board) => BOARD_BY_ID.get(board.boardId)?.name).join(' + ')}</span></div>}
      </section>

      {screen === 'home' && <HomePanel name={name} setName={setName} robotId={robotId} setRobotId={setRobotId} roomCode={roomCode} setRoomCode={setRoomCode} createRoom={createRoom} joinRoom={joinRoom} busy={busy || !hydrated} error={error} />}
      {screen === 'lobby' && view && <LobbyPanel view={view} roomCode={roomCode} isHost={isHost} courseId={courseId} setCourseId={setCourseId} fourLives={fourLives} setFourLives={setFourLives} start={() => send('start', { courseId, fourLifeRule: fourLives })} error={error} />}
      {screen === 'lobby' && !view && <JoinPanel roomCode={roomCode} name={name} setName={setName} robotId={robotId} setRobotId={setRobotId} join={joinRoom} busy={busy || !hydrated} error={error} />}
      {screen === 'match' && view && <MatchHud view={view} selected={selected} toggle={toggleCard} moveSelected={moveSelected} submit={() => send('program', { cards: selected })} powerDown={() => send('announce-power-down', { enabled: !ownRobot?.powerDownNext })} activateOption={(optionId, payload) => send('option', { optionId, payload })} reducedMotion={reducedMotion} setReducedMotion={setReducedMotion} />}
      {legalOpen && <LegalPanel close={() => setLegalOpen(false)} />}
    </div>
  );
}

function HomePanel(props: { name: string; setName: (v: string) => void; robotId: string; setRobotId: (v: string) => void; roomCode: string; setRoomCode: (v: string) => void; createRoom: () => void; joinRoom: () => void; busy: boolean; error: string }) {
  return <aside className="glass-panel launch-panel">
    <p className="kicker">ONLINE FACTORY RACING • 2–8 PLAYERS</p>
    <h1>Program the chaos.<br/><em>Own the factory.</em></h1>
    <p className="intro">Choose five instructions. Watch every robot execute them together. Survive the belts, beams, pits, and your friends.</p>
    <label className="field-label">DRIVER NAME<input value={props.name} maxLength={24} placeholder="Enter a callsign" onChange={(event) => props.setName(event.target.value)} /></label>
    <RobotPicker value={props.robotId} onChange={props.setRobotId} />
    <div className="launch-actions"><button className="primary" type="button" disabled={props.busy} onClick={props.createRoom}>CREATE PRIVATE ROOM <span>→</span></button><div className="join-row"><input aria-label="Room code" value={props.roomCode} maxLength={10} placeholder="ROOM CODE" onChange={(event) => props.setRoomCode(event.target.value.toUpperCase())}/><button type="button" disabled={props.busy || props.roomCode.length < 10} onClick={props.joinRoom}>JOIN</button></div></div>
    {props.error && <p className="error" role="alert">{props.error}</p>}
    <div className="feature-row"><span>◆ SERVER AUTHORITY</span><span>◆ PRIVATE ROOMS</span><span>◆ NO ACCOUNTS</span></div>
  </aside>;
}

function JoinPanel(props: { roomCode: string; name: string; setName: (v: string) => void; robotId: string; setRobotId: (v: string) => void; join: () => void; busy: boolean; error: string }) {
  return <aside className="glass-panel join-panel"><p className="kicker">INVITED TO ROOM</p><h2>{props.roomCode}</h2><label className="field-label">DRIVER NAME<input value={props.name} maxLength={24} placeholder="Enter a callsign" onChange={(event) => props.setName(event.target.value)}/></label><RobotPicker value={props.robotId} onChange={props.setRobotId}/><button className="primary" disabled={props.busy} onClick={props.join}>CLAIM ROBOT <span>→</span></button>{props.error && <p className="error">{props.error}</p>}</aside>;
}

function RobotPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <fieldset className="robot-picker"><legend>SELECT ROBOT</legend><div>{ROBOTS.map((robot) => <button key={robot.id} className={value === robot.id ? 'selected' : ''} style={{ '--robot': robot.color } as React.CSSProperties} type="button" aria-pressed={value === robot.id} title={robot.name} onClick={() => onChange(robot.id)}><span>{robot.marker}</span><small>{robot.name.replace(' Bot', '')}</small></button>)}</div></fieldset>;
}

function LobbyPanel({ view, roomCode, isHost, courseId, setCourseId, fourLives, setFourLives, start, error }: { view: PrivateMatchView; roomCode: string; isHost: boolean; courseId: string; setCourseId: (v: string) => void; fourLives: boolean; setFourLives: (v: boolean) => void; start: () => void; error: string }) {
  const copyInvite = () => navigator.clipboard.writeText(`${location.origin}/?room=${roomCode}`);
  return <aside className="glass-panel lobby-panel"><div className="lobby-head"><div><p className="kicker">PRIVATE ROOM</p><h2>{roomCode}</h2></div><button type="button" onClick={copyInvite}>COPY INVITE</button></div><div className="seat-grid">{view.public.robots.map((robot) => { const identity = ROBOT_BY_ID.get(robot.robotId)!; return <div className="seat" key={robot.seatId}><span style={{ background: identity.color }}>{identity.marker}</span><div><strong>{robot.displayName}</strong><small>{identity.name}{robot.seatId === view.public.hostSeatId ? ' • HOST' : ''}</small></div><i className={robot.connected ? 'online' : ''}/></div>; })}{Array.from({ length: Math.max(0, 2 - view.public.robots.length) }, (_, i) => <div className="seat empty" key={i}>WAITING FOR DRIVER…</div>)}</div>{isHost && <><label className="field-label">COURSE<select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{COURSES.map((course) => <option value={course.id} key={course.id}>{course.name} — {course.boards.map((board) => BOARD_BY_ID.get(board.boardId)?.name).join(' + ')}</option>)}</select></label>{view.public.robots.length >= 5 && <label className="check"><input type="checkbox" checked={fourLives} onChange={(event) => setFourLives(event.target.checked)}/> Use the optional four-life rule</label>}<button className="primary" disabled={view.public.robots.length < 2} onClick={start}>START RACE <span>→</span></button></>}{!isHost && <p className="waiting">Host is configuring the factory…</p>}{error && <p className="error">{error}</p>}</aside>;
}

function MatchHud({ view, selected, toggle, moveSelected, submit, powerDown, activateOption, reducedMotion, setReducedMotion }: { view: PrivateMatchView; selected: string[]; toggle: (card: ProgramCard) => void; moveSelected: (id: string, amount: number) => void; submit: () => void; powerDown: () => void; activateOption: (optionId: string, payload: Record<string, unknown>) => void; reducedMotion: boolean; setReducedMotion: (v: boolean) => void }) {
  const robot = view.public.robots.find((candidate) => candidate.seatId === view.seatId)!;
  const unlocked = robot.registers.filter((register) => !register.locked).length;
  const ordered = selected.map((id) => view.hand.find((card) => card.id === id)!).filter(Boolean);
  const targetSeatId = view.public.robots.find((candidate) => candidate.seatId !== view.seatId && !candidate.eliminated)?.seatId;
  return <><aside className="roster-panel">{view.public.robots.map((entry) => { const identity = ROBOT_BY_ID.get(entry.robotId)!; return <div className={entry.seatId === view.seatId ? 'you' : ''} key={entry.seatId}><span style={{ color: identity.color }}>{identity.marker}</span><strong>{entry.displayName}</strong><small>♥ {entry.lives}　⚠ {entry.damage}　⚑ {entry.checkpoint}</small></div>; })}</aside>{view.options.length > 0 && <aside className="option-panel"><p className="kicker">INSTALLED OPTIONS</p>{view.options.map((installed) => { const option = OPTION_BY_ID.get(installed.id)!; return <button key={installed.id} title={option.summary} disabled={!option.optional} onClick={() => activateOption(installed.id, { targetSeatId, register: 1, direction: robot.direction, cardId: view.hand[0]?.id })}><strong>{option.name}</strong><small>{installed.charges === undefined ? option.timing : `${installed.charges} CHARGES`}</small></button>; })}</aside>}<section className="program-console"><div className="console-head"><div><p className="kicker">PROGRAM REGISTERS</p><span>Select {unlocked} cards in execution order. Keys 1–9 select; Enter submits.</span></div><div className="damage-meter"><small>DAMAGE</small>{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < robot.damage ? 'hit' : ''}/>)}</div></div><div className="register-row">{robot.registers.map((register, index) => { const card = register.locked ? register.card : ordered.shift(); return <div className={`register ${register.locked ? 'locked' : card ? 'filled' : ''}`} key={index}><b>{index + 1}</b>{register.locked && <span className="lock">LOCKED</span>}{card ? <><strong>{ICONS[card.kind]}</strong><small>{PROGRAM_LABELS[card.kind]}</small><em>{card.priority}</em>{!register.locked && <div><button onClick={() => moveSelected(card.id, -1)} aria-label="Move earlier">‹</button><button onClick={() => toggle(card)} aria-label="Remove card">×</button><button onClick={() => moveSelected(card.id, 1)} aria-label="Move later">›</button></div>}</> : <span className="empty-slot">—</span>}</div>; })}</div><div className="hand-row" aria-label="Program card hand">{view.hand.map((card, index) => <button draggable onDragEnd={() => toggle(card)} aria-pressed={selected.includes(card.id)} className={`program-card ${selected.includes(card.id) ? 'selected' : ''} type-${card.kind}`} onClick={() => toggle(card)} key={card.id}><kbd>{index + 1}</kbd><strong>{ICONS[card.kind]}</strong><span>{PROGRAM_LABELS[card.kind]}</span><em>{card.priority}</em></button>)}</div><div className="console-actions"><button type="button" className={robot.powerDownNext ? 'active' : ''} onClick={powerDown}>POWER DOWN NEXT TURN</button><label><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)}/> REDUCED MOTION</label><button className="primary" type="button" disabled={selected.length !== unlocked || robot.finishedProgramming} onClick={submit}>{robot.finishedProgramming ? 'PROGRAM LOCKED' : `EXECUTE ${selected.length}/${unlocked}`} <span>→</span></button></div></section><EventLog events={view.events}/></>;
}

function EventLog({ events }: { events: MatchEvent[] }) {
  return <aside className="event-log"><p className="kicker">FACTORY FEED</p>{events.slice(-5).reverse().map((item) => <p key={item.revision}><time>#{item.revision}</time>{item.message}</p>)}</aside>;
}

function LegalPanel({ close }: { close: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><section className="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={close}>×</button><p className="kicker">ABOUT / LEGAL</p><h2 id="legal-title">Built for the joy of improbable plans.</h2><p>Vibe Robots is an independent, unofficial, non-commercial browser adaptation inspired by the 2005 RoboRally rules. RoboRally is referenced only to identify rules compatibility.</p><p>All visual art, robot models, audio, interface design, card layouts, and explanatory wording in this project are original. No official logos, scans, textures, card prose, or promotional artwork are included.</p><p>Private rooms hold match data for reconnection, then expire automatically. No account, chat, ranking, or player profile is created.</p><button className="primary" onClick={close}>BACK TO FACTORY</button></section></div>;
}

function FactoryScene({ course, robots, reducedMotion }: { course: CourseDefinition; robots?: PublicRobotView[]; reducedMotion: boolean }) {
  const bounds = courseBounds(course);
  const demo = useMemo<PublicRobotView[]>(() => ROBOTS.slice(0, 5).map((robot, index) => ({ seatId: `demo-${index}`, robotId: robot.id, displayName: robot.name, position: { x: [2, 4, 7, 9, 6][index], y: [9, 7, 9, 6, 3][index] }, direction: (['north', 'east', 'west', 'south', 'east'] as Direction[])[index], archive: { x: 0, y: 0 }, damage: index, lives: 3, checkpoint: 0, registers: [], optionCount: 0, revealedOptions: [], poweredDown: false, powerDownNext: false, destroyed: false, eliminated: false, connected: true, finishedProgramming: false })), []);
  return <Canvas shadows="basic" dpr={[1, 1.6]} camera={{ position: [10, 14, 17], fov: 38 }} gl={{ antialias: true, alpha: true }} fallback={<div className="webgl-fallback"><h2>WebGL is unavailable</h2><p>Enable hardware acceleration or try a current desktop browser.</p></div>}><color attach="background" args={['#07100f']}/><fog attach="fog" args={['#07100f', 17, 35]}/><ambientLight intensity={0.7}/><directionalLight castShadow position={[5, 14, 8]} intensity={3.2} color="#ffe4a8" shadow-mapSize={[1024, 1024]}/><pointLight position={[-6, 5, -3]} color="#3fffc3" intensity={35}/><pointLight position={[8, 4, 6]} color="#ff6047" intensity={24}/><group position={[-bounds.width / 2 + 0.5, 0, -bounds.height / 2 + 0.5]}><FactoryBoard course={course} reducedMotion={reducedMotion}/>{(robots?.length ? robots : demo).map((robot) => <RobotModel key={robot.seatId} robot={robot} reducedMotion={reducedMotion}/>)}</group><ContactShadows position={[0, -0.08, 0]} opacity={0.7} scale={30} blur={2.4}/><Sparkles count={45} scale={[20, 5, 20]} size={1.4} speed={reducedMotion ? 0 : 0.2} color="#ffc75a"/><Environment preset="warehouse"/><OrbitControls makeDefault enablePan={false} enableZoom minPolarAngle={0.65} maxPolarAngle={1.2} minDistance={12} maxDistance={25} target={[0, 0, 0]}/></Canvas>;
}

function FactoryBoard({ course, reducedMotion }: { course: CourseDefinition; reducedMotion: boolean }) {
  const bounds = courseBounds(course);
  const base = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => Array.from({ length: bounds.width * bounds.height }, (_, index) => ({ x: index % bounds.width, y: Math.floor(index / bounds.width) })), [bounds.height, bounds.width]);
  useEffect(() => {
    if (!base.current) return;
    const matrix = new THREE.Matrix4();
    cells.forEach((cell, index) => {
      matrix.makeTranslation(cell.x, 0, cell.y);
      base.current!.setMatrixAt(index, matrix);
      const tile = courseTile(course, cell.x, cell.y);
      base.current!.setColorAt(index, new THREE.Color(tile?.pit ? '#06100e' : (cell.x + cell.y) % 2 ? '#263b38' : '#203431'));
    });
    base.current.instanceMatrix.needsUpdate = true;
    if (base.current.instanceColor) base.current.instanceColor.needsUpdate = true;
  }, [cells, course]);
  const elements = cells.map(({ x, y }) => ({ x, y, tile: courseTile(course, x, y) })).filter((entry) => entry.tile && Object.keys(entry.tile).length);
  return <group><instancedMesh ref={base} args={[undefined, undefined, cells.length]} receiveShadow><boxGeometry args={[0.94, 0.14, 0.94]}/><meshStandardMaterial roughness={0.66} metalness={0.42}/></instancedMesh>{elements.map(({ x, y, tile }) => <group position={[x, 0.12, y]} key={`${x},${y}`}>
    {tile!.pit && <mesh position={[0, 0.02, 0]}><boxGeometry args={[0.82, 0.04, 0.82]}/><meshStandardMaterial color="#020706" emissive="#061d18"/></mesh>}
    {tile!.conveyor && <Conveyor direction={tile!.conveyor.direction} speed={tile!.conveyor.speed} reducedMotion={reducedMotion}/>}
    {tile!.gear && <Gear direction={tile!.gear} reducedMotion={reducedMotion}/>}
    {tile!.repair && <TileGlyph color="#58ffc1" glyph={tile!.optionSite ? '✚⚒' : tile!.repair === 2 ? '✚✚' : '✚'}/>}
    {tile!.checkpoint && <Checkpoint number={tile!.checkpoint}/>}
    {tile!.laser && <LaserEmitter direction={tile!.laser.direction}/>}
    {tile!.pusher && <TileGlyph color="#ff884f" glyph="▣"/>}
    {tile!.walls?.map((wall) => <Wall key={wall} direction={wall}/>)}
  </group>)}</group>;
}

function Conveyor({ direction, speed, reducedMotion }: { direction: Direction; speed: number; reducedMotion: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => { if (ref.current && !reducedMotion) ref.current.position.y = 0.055 + Math.sin(state.clock.elapsedTime * (speed + 1)) * 0.014; });
  return <group ref={ref} position={[0, .06, 0]} rotation={[0, directionRotation[direction], 0]}><mesh rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[.78, .78]}/><meshStandardMaterial color={speed === 2 ? '#267f99' : '#bd7d2b'} emissive={speed === 2 ? '#0a3440' : '#3c1d06'} emissiveIntensity={1.2}/></mesh><mesh position={[0, .035, -.04]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[.18, .5, 3]}/><meshBasicMaterial color="#d9fff4"/></mesh></group>;
}

function Gear({ direction, reducedMotion }: { direction: 'left' | 'right'; reducedMotion: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => { if (ref.current && !reducedMotion) ref.current.rotation.y += delta * (direction === 'right' ? 1 : -1); });
  return <mesh ref={ref} position={[0, .08, 0]}><torusGeometry args={[.27, .08, 6, 12]}/><meshStandardMaterial color="#e8aa42" metalness={.8} roughness={.24} emissive="#5c2f09"/></mesh>;
}

function Wall({ direction }: { direction: Direction }) {
  const horizontal = direction === 'north' || direction === 'south';
  return <mesh castShadow position={[direction === 'east' ? .46 : direction === 'west' ? -.46 : 0, .23, direction === 'south' ? .46 : direction === 'north' ? -.46 : 0]}><boxGeometry args={[horizontal ? .96 : .08, .42, horizontal ? .08 : .96]}/><meshStandardMaterial color="#75867e" metalness={.8} roughness={.28}/></mesh>;
}

function TileGlyph({ color, glyph }: { color: string; glyph: string }) {
  return <Html center transform distanceFactor={12} position={[0, .07, 0]} rotation={[-Math.PI / 2, 0, 0]}><span className="tile-glyph" style={{ color }}>{glyph}</span></Html>;
}

function Checkpoint({ number }: { number: number }) {
  return <Float speed={2} rotationIntensity={.15} floatIntensity={.12}><mesh position={[0, .38, 0]} castShadow><cylinderGeometry args={[.27, .34, .62, 8]}/><meshStandardMaterial color="#ffd657" emissive="#8d5200" emissiveIntensity={1.5} metalness={.5}/></mesh><Html center position={[0, .72, 0]}><span className="flag-number">{number}</span></Html></Float>;
}

function LaserEmitter({ direction }: { direction: Direction }) {
  return <group rotation={[0, directionRotation[direction], 0]}><mesh castShadow position={[0, .22, 0]}><boxGeometry args={[.26, .36, .5]}/><meshStandardMaterial color="#802d28" metalness={.7}/></mesh><pointLight position={[0, .25, -.3]} color="#ff391f" intensity={5}/></group>;
}

function RobotModel({ robot, reducedMotion }: { robot: PublicRobotView; reducedMotion: boolean }) {
  const identity = ROBOT_BY_ID.get(robot.robotId) ?? ROBOTS[0];
  const body = useRef<THREE.Group>(null);
  useFrame((state) => { if (body.current && !reducedMotion && !robot.destroyed) body.current.position.y = .28 + Math.sin(state.clock.elapsedTime * 2 + robot.position.x) * .025; });
  if (robot.destroyed || robot.eliminated) return null;
  return <group ref={body} position={[robot.position.x, .28, robot.position.y]} rotation={[0, directionRotation[robot.direction], 0]}><mesh castShadow><boxGeometry args={identity.silhouette === 'tank' ? [.7, .46, .82] : identity.silhouette === 'racer' ? [.56, .32, .9] : [.62, .5, .66]}/><meshStandardMaterial color={identity.color} roughness={.28} metalness={.72}/></mesh><mesh castShadow position={[0, .35, -.06]}><cylinderGeometry args={[.2, .27, .24, identity.silhouette === 'spinner' ? 12 : 6]}/><meshStandardMaterial color={identity.accent} metalness={.84}/></mesh><mesh position={[0, .34, -.25]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.045, .045, .5, 8]}/><meshBasicMaterial color="#8fffe2"/></mesh><mesh position={[0, .16, -.48]}><coneGeometry args={[.12, .26, 4]}/><meshStandardMaterial color="#e9fff8" emissive="#35d7ad" emissiveIntensity={2}/></mesh><Html center position={[0, .95, 0]} distanceFactor={11}><span className="robot-label" style={{ borderColor: identity.color }}>{identity.marker} {robot.displayName}</span></Html></group>;
}

function phaseLabel(phase: string) {
  return ({ lobby: 'Room online', programming: 'Programming phase', executing: 'Factory active', paused: 'Paused — reconnecting', complete: 'Race complete', decision: 'Decision pending' } as Record<string, string>)[phase] ?? phase;
}

function saveSeat(code: string, seatId: string, seatToken: string) {
  sessionStorage.setItem(`vibe-robots:${code}`, JSON.stringify({ seatId, seatToken }));
}

function loadSeat(code: string): { seatId: string; seatToken: string } | undefined {
  try { return JSON.parse(sessionStorage.getItem(`vibe-robots:${code}`) ?? 'null') ?? undefined; } catch { return; }
}
