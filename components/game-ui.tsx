'use client';

import { BOARD_BY_ID, COURSES } from '@/game/content/boards';
import { OPTION_BY_ID } from '@/game/content/options';
import { PROGRAM_LABELS } from '@/game/content/programs';
import { ROBOTS, ROBOT_BY_ID } from '@/game/content/robots';
import type { MatchEvent, PrivateMatchView, ProgramCard, PublicRobotView } from '@/game/types';

const ICONS: Record<string, string> = { move1: '↑', move2: '⇈', move3: '⇈', backup: '↓', left: '↶', right: '↷', uturn: '↻' };
const COURSE_IMAGES: Record<string, string> = {
  'risky-exchange': '/assets/images/course-risky-exchange.webp',
  'dizzy-dash': '/assets/images/course-dizzy-dash.webp',
  'against-the-grain': '/assets/images/course-against-the-grain.webp',
};

export interface PlaybackView {
  robots: PublicRobotView[];
  active?: { event: MatchEvent; durationMs: number };
  remaining: number;
  playing: boolean;
}

export function HomePanel(props: { name: string; setName: (value: string) => void; robotId: string; setRobotId: (value: string) => void; roomCode: string; setRoomCode: (value: string) => void; createSolo: () => void; createRoom: () => void; joinRoom: () => void; busy: boolean; error: string }) {
  return <aside className="cozy-panel launch-panel">
    <p className="kicker">SOLO OR ONLINE DIORAMA RACING · 1–8 PLAYERS</p>
    <h1>Build a plan.<br/><em>Embrace the wobble.</em></h1>
    <p className="intro">Program five moves, then watch a tiny workshop full of brave robots turn every good idea into delightful chaos.</p>
    <label className="field-label">DRIVER NAME<input value={props.name} maxLength={24} placeholder="Your workshop nickname" onChange={(event) => props.setName(event.target.value)} /></label>
    <RobotPicker value={props.robotId} onChange={props.setRobotId} />
    <div className="launch-actions">
      <div className="mode-actions"><button className="primary" type="button" disabled={props.busy} onClick={props.createSolo}>PLAY SOLO <span>→</span></button><button className="secondary" type="button" disabled={props.busy} onClick={props.createRoom}>CREATE ONLINE ROOM</button></div>
      <div className="join-row"><input aria-label="Room code" value={props.roomCode} maxLength={10} placeholder="ROOM CODE" onChange={(event) => props.setRoomCode(event.target.value.toUpperCase())}/><button type="button" disabled={props.busy || props.roomCode.length < 10} onClick={props.joinRoom}>JOIN</button></div>
    </div>
    {props.error && <p className="error" role="alert">{props.error}</p>}
    <div className="feature-row"><span>Solo opponents</span><span>Server fair-play</span><span>No account</span></div>
  </aside>;
}

export function JoinPanel(props: { roomCode: string; name: string; setName: (value: string) => void; robotId: string; setRobotId: (value: string) => void; join: () => void; busy: boolean; error: string }) {
  return <aside className="cozy-panel join-panel"><p className="kicker">YOU FOUND A WORKSHOP</p><h2>{props.roomCode}</h2><label className="field-label">DRIVER NAME<input value={props.name} maxLength={24} placeholder="Your workshop nickname" onChange={(event) => props.setName(event.target.value)}/></label><RobotPicker value={props.robotId} onChange={props.setRobotId}/><button className="primary" disabled={props.busy} onClick={props.join}>CLAIM THIS ROBOT <span>→</span></button>{props.error && <p className="error">{props.error}</p>}</aside>;
}

function RobotPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <fieldset className="robot-picker"><legend>CHOOSE YOUR LITTLE HERO</legend><div>{ROBOTS.map((robot) => <button key={robot.id} className={value === robot.id ? 'selected' : ''} style={{ '--robot': robot.color } as React.CSSProperties} type="button" aria-pressed={value === robot.id} title={robot.name} onClick={() => onChange(robot.id)}><img src={robot.portraitUrl} alt=""/><span>{robot.marker}</span><small>{robot.name.replace(' Bot', '')}</small></button>)}</div></fieldset>;
}

export function LobbyPanel({ view, roomCode, isHost, courseId, setCourseId, fourLives, setFourLives, start, error }: { view: PrivateMatchView; roomCode: string; isHost: boolean; courseId: string; setCourseId: (value: string) => void; fourLives: boolean; setFourLives: (value: boolean) => void; start: () => void; error: string }) {
  const solo = view.public.mode === 'solo';
  const copyInvite = () => void navigator.clipboard.writeText(`${location.origin}/?room=${roomCode}`);
  return <aside className="cozy-panel lobby-panel">
    <div className="lobby-head"><div><p className="kicker">{solo ? 'SOLO WORKSHOP' : 'PRIVATE WORKSHOP'}</p><h2>{solo ? 'CPU RACE' : roomCode}</h2></div>{!solo && <button type="button" onClick={copyInvite}>COPY INVITE</button>}</div>
    <div className="seat-grid">{view.public.robots.map((robot) => { const identity = ROBOT_BY_ID.get(robot.robotId)!; return <div className="seat" key={robot.seatId}><img src={identity.portraitUrl} alt=""/><div><strong>{robot.displayName}</strong><small>{identity.name}{robot.seatId === view.public.hostSeatId ? ' · HOST' : robot.controller === 'bot' ? ' · CPU' : ''}</small></div>{robot.controller === 'bot' ? <b className="cpu-badge">CPU</b> : <i className={robot.connected ? 'online' : ''}/>}</div>; })}{!solo && Array.from({ length: Math.max(0, 2 - view.public.robots.length) }, (_, index) => <div className="seat empty" key={index}>A tiny robot is still on its way…</div>)}</div>
    {isHost && <><div className="course-picker" role="radiogroup" aria-label="Course">{COURSES.map((course) => <button type="button" role="radio" aria-checked={courseId === course.id} className={courseId === course.id ? 'selected' : ''} onClick={() => setCourseId(course.id)} key={course.id}><CourseArt src={COURSE_IMAGES[course.id]}/><span><strong>{course.name}</strong><small>{course.difficulty} · {course.boards.length} board{course.boards.length > 1 ? 's' : ''}</small></span></button>)}</div>{view.public.robots.length >= 5 && <label className="check"><input type="checkbox" checked={fourLives} onChange={(event) => setFourLives(event.target.checked)}/> Give everyone a fourth life</label>}<button className="primary" disabled={view.public.robots.length < 2} onClick={start}>START THE DIORAMA <span>→</span></button></>}
    {!isHost && <p className="waiting">The host is arranging the factory…</p>}{error && <p className="error">{error}</p>}
  </aside>;
}

export function MatchHud({ view, sceneRobots, selected, toggle, moveSelected, submit, powerDown, activateOption, resolveDecision, reducedMotion, setReducedMotion, playback }: { view: PrivateMatchView; sceneRobots: PublicRobotView[]; selected: string[]; toggle: (card: ProgramCard) => void; moveSelected: (id: string, amount: number) => void; submit: () => void; powerDown: (enabled: boolean) => void; activateOption: (optionId: string, payload: Record<string, unknown>) => void; resolveDecision: (choice: string) => void; reducedMotion: boolean; setReducedMotion: (value: boolean) => void; playback: PlaybackView }) {
  const robot = view.public.robots.find((candidate) => candidate.seatId === view.seatId)!;
  const unlocked = robot.registers.filter((register) => !register.locked).length;
  const ordered = selected.map((id) => view.hand.find((card) => card.id === id)!).filter(Boolean);
  const targetSeatId = view.public.robots.find((candidate) => candidate.seatId !== view.seatId && !candidate.eliminated)?.seatId;
  return <>
    <aside className="roster-panel" aria-label="Drivers">{sceneRobots.map((entry) => { const identity = ROBOT_BY_ID.get(entry.robotId)!; return <div className={entry.seatId === view.seatId ? 'you' : ''} key={entry.seatId}><img src={identity.portraitUrl} alt=""/><span><strong>{entry.displayName}</strong><small>{entry.controller === 'bot' ? 'CPU · ' : ''}♥ {entry.lives}　⚡ {entry.damage}　⚑ {entry.checkpoint}</small></span><i className={entry.connected ? 'online' : ''}/></div>; })}</aside>
    <aside className="drawer-stack">
      {view.options.length > 0 && <details className="hud-drawer" open><summary>Installed options <b>{view.options.length}</b></summary>{view.options.map((installed) => { const option = OPTION_BY_ID.get(installed.id)!; return <button key={installed.id} title={option.summary} disabled={!option.optional || playback.playing} onClick={() => activateOption(installed.id, { targetSeatId, register: 1, direction: robot.direction, cardId: view.hand[0]?.id })}><strong>{option.name}</strong><small>{installed.charges === undefined ? option.timing : `${installed.charges} charges`}</small></button>; })}</details>}
      <details className="hud-drawer"><summary>Factory feed <b>{view.events.length}</b></summary><EventLog events={view.events}/></details>
    </aside>
    {playback.playing && <div className="action-toast" role="status"><small>{playback.active?.event.stage ?? 'factory sequence'}</small><strong>{playback.active?.event.message ?? 'Winding the gears…'}</strong><span>{playback.remaining + 1} actions queued</span></div>}
    <section className="program-console">
      <div className="console-head"><div><p className="kicker">YOUR FIVE-STEP PLAN</p><span>{playback.playing ? 'The factory is acting it out…' : `Choose ${unlocked} cards in execution order. Keys 1–9 select; Enter submits.`}</span></div><div className="damage-meter" aria-label={`${robot.damage} damage`}><small>DAMAGE</small>{Array.from({ length: 10 }, (_, index) => <i key={index} className={index < robot.damage ? 'hit' : ''}/>)}</div></div>
      <div className="register-row">{robot.registers.map((register, index) => { const card = register.locked ? register.card : ordered.shift(); return <div className={`register ${register.locked ? 'locked' : card ? 'filled' : ''}`} key={index}><b>{index + 1}</b>{register.locked && <span className="lock">LOCKED</span>}{card ? <><strong>{ICONS[card.kind]}</strong><small>{PROGRAM_LABELS[card.kind]}</small><em>{card.priority}</em>{!register.locked && <div><button onClick={() => moveSelected(card.id, -1)} aria-label="Move earlier">‹</button><button onClick={() => toggle(card)} aria-label="Remove card">×</button><button onClick={() => moveSelected(card.id, 1)} aria-label="Move later">›</button></div>}</> : <span className="empty-slot">drop a card</span>}</div>; })}</div>
      <div className="hand-row" aria-label="Program card hand">{view.hand.map((card, index) => <button draggable aria-pressed={selected.includes(card.id)} className={`program-card ${selected.includes(card.id) ? 'selected' : ''} type-${card.kind}`} onClick={() => toggle(card)} key={card.id} disabled={playback.playing}><kbd>{index + 1}</kbd><strong>{ICONS[card.kind]}</strong><span>{PROGRAM_LABELS[card.kind]}</span><em>{card.priority}</em></button>)}</div>
      {robot.poweredDown && view.public.phase === 'programming' ? <div className="power-down-choice"><span>Your robot is safely powered down. Run one CPU turn, then choose again.</span><button type="button" disabled={playback.playing} onClick={() => powerDown(true)}>STAY POWERED DOWN</button><button className="primary" type="button" disabled={playback.playing} onClick={() => powerDown(false)}>POWER UP AFTER THIS TURN <span>→</span></button></div> : <div className="console-actions"><button type="button" className={robot.powerDownNext ? 'active' : ''} disabled={playback.playing} onClick={() => powerDown(!robot.powerDownNext)}>POWER DOWN NEXT TURN</button><label><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)}/> REDUCED MOTION</label><button className="primary" type="button" disabled={playback.playing || selected.length !== unlocked || robot.finishedProgramming} onClick={submit}>{robot.finishedProgramming ? 'PLAN LOCKED' : playback.playing ? 'ROBOTS AT WORK' : `LOCK IN ${selected.length}/${unlocked}`} <span>→</span></button></div>}
    </section>
    {view.decision && <div className="modal-backdrop"><section className="decision-modal" role="dialog" aria-modal="true"><p className="kicker">YOUR ROBOT NEEDS HELP</p><h2>Choose what happens next</h2><div>{view.decision.choices.map((choice) => <button className="primary" key={choice} onClick={() => resolveDecision(choice)}>{choice}</button>)}</div></section></div>}
  </>;
}

export function SoloResultPanel({ view, returnHome }: { view: PrivateMatchView; returnHome: () => void }) {
  const human = view.public.robots.find((robot) => robot.seatId === view.seatId)!;
  const winner = view.public.robots.find((robot) => robot.seatId === view.public.winnerSeatId);
  const victory = winner?.seatId === human.seatId;
  const message = victory
    ? `${human.displayName} reached every checkpoint first.`
    : view.public.completionReason === 'human-eliminated'
      ? `${human.displayName} ran out of archive copies.`
      : `${winner?.displayName ?? 'A CPU robot'} reached the final checkpoint first.`;
  return <div className="modal-backdrop solo-result-backdrop"><section className={`result-modal ${victory ? 'victory' : 'defeat'}`} role="dialog" aria-modal="true" aria-labelledby="solo-result-title"><p className="kicker">SOLO RACE COMPLETE</p><h2 id="solo-result-title">{victory ? 'Factory champion!' : 'Back to the workbench.'}</h2><p>{message}</p><button className="primary" type="button" onClick={returnHome}>RETURN TO THE WORKSHOP <span>→</span></button></section></div>;
}

function CourseArt({ src }: { src: string }) {
  return <picture><source srcSet={src.replace(/\.webp$/, '.avif')} type="image/avif"/><img src={src} alt=""/></picture>;
}

function EventLog({ events }: { events: MatchEvent[] }) {
  return <div className="event-log">{events.slice(-8).reverse().map((item) => <p key={item.revision}><time>#{item.revision}</time>{item.message}</p>)}</div>;
}

export function LegalPanel({ close }: { close: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><section className="legal-modal" role="dialog" aria-modal="true" aria-labelledby="legal-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={close}>×</button><p className="kicker">ABOUT THIS LITTLE WORLD</p><h2 id="legal-title">Built for improbable plans.</h2><p>Vibe Robots is an independent, unofficial, non-commercial browser adaptation inspired by the 2005 RoboRally rules. RoboRally is referenced only to identify rules compatibility.</p><p>All art, robot models, sounds, interface design, layouts, and wording are original. No official logos, scans, textures, card prose, or promotional artwork are included.</p><p>Private rooms hold match data for reconnection, then expire automatically. No account, chat, ranking, or player profile is created.</p><button className="primary" onClick={close}>BACK TO THE WORKSHOP</button></section></div>;
}

export function CourseChip({ courseId }: { courseId: string }) {
  const course = COURSES.find((candidate) => candidate.id === courseId) ?? COURSES[0];
  return <div className="course-chip"><small>NOW RACING</small><strong>{course.name}</strong><span>{course.boards.map((board) => BOARD_BY_ID.get(board.boardId)?.name).join(' + ')}</span></div>;
}
