"use client";

import { useEffect, useRef, useState } from "react";
import { BOARD_BY_ID, COURSES } from "@/game/content/boards";
import { OPTION_BY_ID } from "@/game/content/options";
import { PROGRAM_LABELS } from "@/game/content/programs";
import { ROBOTS, ROBOT_BY_ID } from "@/game/content/robots";
import type { MatchEvent, PrivateMatchView, ProgramCard, PublicRobotView } from "@/game/types";

const ICONS: Record<string, string> = {
  move1: "↑",
  move2: "⇈",
  move3: "⇈",
  backup: "↓",
  left: "↶",
  right: "↷",
  uturn: "↻",
};
const COURSE_IMAGES: Record<string, string> = {
  "risky-exchange": "0%",
  "dizzy-dash": "50%",
  "against-the-grain": "100%",
};

export interface PlaybackView {
  robots: PublicRobotView[];
  active?: { event: MatchEvent; durationMs: number };
  remaining: number;
  playing: boolean;
}

export function HomePanel(props: {
  name: string;
  setName: (value: string) => void;
  robotId: string;
  setRobotId: (value: string) => void;
  roomCode: string;
  setRoomCode: (value: string) => void;
  createSolo: () => void;
  createRoom: () => void;
  joinRoom: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <aside className="cozy-panel launch-panel">
      <p className="kicker">
        <span className="little-sun">✳</span> A LITTLE ROBOT RACING ADVENTURE
      </p>
      <h1>
        Little robots.
        <br />
        <em>Big adventures.</em>
      </h1>
      <p className="intro">
        A sunny workshop. A handful of cards. Five little moves that might just go wonderfully
        wrong.
      </p>
      <label className="field-label">
        DRIVER NAME
        <input
          value={props.name}
          maxLength={24}
          placeholder="Your workshop nickname"
          onChange={(event) => props.setName(event.target.value)}
        />
      </label>
      <RobotPicker value={props.robotId} onChange={props.setRobotId} />
      <div className="launch-actions">
        <div className="mode-actions">
          <button
            className="primary"
            type="button"
            disabled={props.busy}
            onClick={props.createSolo}
          >
            PLAY SOLO <span>→</span>
          </button>
          <button
            className="secondary"
            type="button"
            disabled={props.busy}
            onClick={props.createRoom}
          >
            CREATE ONLINE ROOM
          </button>
        </div>
        <div className="join-row">
          <input
            aria-label="Room code"
            value={props.roomCode}
            maxLength={10}
            placeholder="ROOM CODE"
            onChange={(event) => props.setRoomCode(event.target.value.toUpperCase())}
          />
          <button
            type="button"
            disabled={props.busy || props.roomCode.length < 10}
            onClick={props.joinRoom}
          >
            JOIN
          </button>
        </div>
      </div>
      {props.error && (
        <p className="error" role="alert">
          {props.error}
        </p>
      )}
      <div className="feature-row">
        <span>1–8 players</span>
        <span>No account needed</span>
        <span>Made for a little chaos</span>
      </div>
    </aside>
  );
}

export function JoinPanel(props: {
  roomCode: string;
  name: string;
  setName: (value: string) => void;
  robotId: string;
  setRobotId: (value: string) => void;
  join: () => void;
  busy: boolean;
  error: string;
}) {
  return (
    <aside className="cozy-panel join-panel">
      <p className="kicker">YOU FOUND A WORKSHOP</p>
      <h2>{props.roomCode}</h2>
      <label className="field-label">
        DRIVER NAME
        <input
          value={props.name}
          maxLength={24}
          placeholder="Your workshop nickname"
          onChange={(event) => props.setName(event.target.value)}
        />
      </label>
      <RobotPicker value={props.robotId} onChange={props.setRobotId} />
      <button className="primary" disabled={props.busy} onClick={props.join}>
        CLAIM THIS ROBOT <span>→</span>
      </button>
      {props.error && <p className="error">{props.error}</p>}
    </aside>
  );
}

function RobotPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <fieldset className="robot-picker">
      <legend>
        YOUR LITTLE COPILOT <strong>{ROBOT_BY_ID.get(value)?.name}</strong>
      </legend>
      <div>
        {ROBOTS.map((robot) => (
          <button
            key={robot.id}
            className={value === robot.id ? "selected" : ""}
            style={{ "--robot": robot.color } as React.CSSProperties}
            type="button"
            aria-pressed={value === robot.id}
            title={robot.name}
            onClick={() => onChange(robot.id)}
          >
            <img src={robot.portraitUrl} alt="" />
            <span>{robot.marker}</span>
            <small>{robot.name.replace(" Bot", "")}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function LobbyPanel({
  view,
  roomCode,
  isHost,
  courseId,
  setCourseId,
  fourLives,
  setFourLives,
  start,
  error,
}: {
  view: PrivateMatchView;
  roomCode: string;
  isHost: boolean;
  courseId: string;
  setCourseId: (value: string) => void;
  fourLives: boolean;
  setFourLives: (value: boolean) => void;
  start: () => void;
  error: string;
}) {
  const solo = view.public.mode === "solo";
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/?room=${roomCode}`);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  };
  return (
    <aside className="cozy-panel lobby-panel">
      <div className="lobby-head">
        <div>
          <p className="kicker">{solo ? "SOLO WORKSHOP" : "PRIVATE WORKSHOP"}</p>
          <h2>{solo ? "CPU RACE" : roomCode}</h2>
        </div>
        {!solo && (
          <button type="button" onClick={copyInvite}>
            {copied ? "INVITE COPIED ✓" : "COPY INVITE"}
          </button>
        )}
      </div>
      {copyError && (
        <p className="error" role="alert">
          Copy this invite:{" "}
          {`${typeof location !== "undefined" ? location.origin : ""}/?room=${roomCode}`}
        </p>
      )}
      <p className="lobby-intro">
        {solo
          ? "Your little crew is ready. Pick somewhere lovely to race."
          : "Good company. Questionable plans. Choose your course."}
      </p>
      <div className="seat-grid">
        {view.public.robots.map((robot) => {
          const identity = ROBOT_BY_ID.get(robot.robotId)!;
          return (
            <div className="seat" key={robot.seatId}>
              <img src={identity.portraitUrl} alt="" />
              <div>
                <strong>{robot.displayName}</strong>
                <small>
                  {identity.name}
                  {robot.seatId === view.public.hostSeatId
                    ? " · HOST"
                    : robot.controller === "bot"
                      ? " · CPU"
                      : ""}
                </small>
              </div>
              {robot.controller === "bot" ? (
                <b className="cpu-badge">CPU</b>
              ) : (
                <i className={robot.connected ? "online" : ""} />
              )}
            </div>
          );
        })}
        {!solo &&
          Array.from({ length: Math.max(0, 2 - view.public.robots.length) }, (_, index) => (
            <div className="seat empty" key={index}>
              A tiny robot is still on its way…
            </div>
          ))}
      </div>
      {isHost && (
        <>
          <p className="section-label">CHOOSE YOUR PLAYGROUND</p>
          <div className="course-picker" role="radiogroup" aria-label="Course">
            {COURSES.map((course) => (
              <button
                type="button"
                role="radio"
                aria-checked={courseId === course.id}
                className={courseId === course.id ? "selected" : ""}
                onClick={() => setCourseId(course.id)}
                key={course.id}
              >
                <CourseArt src={COURSE_IMAGES[course.id]} />
                <span>
                  <strong>{course.name}</strong>
                  <small>
                    {course.difficulty} · {course.boards.length} board
                    {course.boards.length > 1 ? "s" : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {view.public.robots.length >= 5 && (
            <label className="check">
              <input
                type="checkbox"
                checked={fourLives}
                onChange={(event) => setFourLives(event.target.checked)}
              />{" "}
              Give everyone a fourth life
            </label>
          )}
          <button className="primary" disabled={view.public.robots.length < 2} onClick={start}>
            START THE DIORAMA <span>→</span>
          </button>
        </>
      )}
      {!isHost && <p className="waiting">The host is arranging the factory…</p>}
      {error && <p className="error">{error}</p>}
    </aside>
  );
}

export function MatchHud({
  view,
  sceneRobots,
  selected,
  toggle,
  moveSelected,
  submit,
  powerDown,
  activateOption,
  resolveDecision,
  reducedMotion,
  setReducedMotion,
  playback,
  submittedPlan,
}: {
  view: PrivateMatchView;
  sceneRobots: PublicRobotView[];
  selected: string[];
  toggle: (card: ProgramCard) => void;
  moveSelected: (id: string, amount: number) => void;
  submit: () => void;
  powerDown: (enabled: boolean) => void;
  activateOption: (optionId: string, payload: Record<string, unknown>) => void;
  resolveDecision: (choice: string) => void;
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
  playback: PlaybackView;
  submittedPlan: PublicRobotView["registers"];
}) {
  const robot = view.public.robots.find((candidate) => candidate.seatId === view.seatId)!;
  const unlocked = robot.registers.filter((register) => !register.locked).length;
  const ordered = selected.map((id) => view.hand.find((card) => card.id === id)!).filter(Boolean);
  const registers =
    (playback.playing || robot.finishedProgramming) && submittedPlan.length === 5
      ? submittedPlan
      : robot.registers;
  const canEdit =
    !playback.playing && !robot.finishedProgramming && view.public.phase === "programming";
  const targetSeatId = view.public.robots.find(
    (candidate) => candidate.seatId !== view.seatId && !candidate.eliminated,
  )?.seatId;
  return (
    <>
      <aside className="roster-panel" aria-label="Drivers">
        <p className="section-label">
          THE LITTLE CREW <span>{sceneRobots.length} DRIVERS</span>
        </p>
        {sceneRobots.map((entry) => {
          const identity = ROBOT_BY_ID.get(entry.robotId)!;
          return (
            <div className={entry.seatId === view.seatId ? "you" : ""} key={entry.seatId}>
              <img src={identity.portraitUrl} alt="" />
              <span>
                <strong>
                  {entry.displayName}
                  {entry.seatId === view.seatId && <b className="you-badge">YOU</b>}
                </strong>
                <small>
                  {entry.controller === "bot" ? "CPU · " : ""}♥ {entry.lives}　⚡ {entry.damage}　⚑{" "}
                  {entry.checkpoint}
                </small>
              </span>
              <i className={entry.connected ? "online" : ""} />
            </div>
          );
        })}
      </aside>
      <aside className="drawer-stack">
        {view.options.length > 0 && (
          <details className="hud-drawer">
            <summary>
              Installed options <b>{view.options.length}</b>
            </summary>
            {view.options.map((installed) => {
              const option = OPTION_BY_ID.get(installed.id)!;
              return (
                <button
                  key={installed.id}
                  title={option.summary}
                  disabled={!option.optional || playback.playing}
                  onClick={() =>
                    activateOption(installed.id, {
                      targetSeatId,
                      register: 1,
                      direction: robot.direction,
                      cardId: view.hand[0]?.id,
                    })
                  }
                >
                  <strong>{option.name}</strong>
                  <small>
                    {installed.charges === undefined
                      ? option.timing
                      : `${installed.charges} charges`}
                  </small>
                </button>
              );
            })}
          </details>
        )}
        <details className="hud-drawer">
          <summary>
            Factory feed <b>{view.events.length}</b>
          </summary>
          <EventLog events={view.events} />
        </details>
      </aside>
      {playback.playing && (
        <div className="action-toast" role="status" key={playback.active?.event.revision}>
          <small>{playback.active?.event.stage ?? "factory sequence"}</small>
          <strong>{playback.active?.event.message ?? "Winding the gears…"}</strong>
          <span>{playback.remaining + 1} actions queued</span>
        </div>
      )}
      <section className="program-console">
        <div className="console-head">
          <div>
            <p className="kicker">YOUR FIVE-STEP PLAN</p>
            <span>
              {playback.playing
                ? "The factory is acting it out…"
                : `Choose ${unlocked} cards in execution order. Keys 1–9 select; Enter submits.`}
            </span>
          </div>
          <div className="damage-meter" aria-label={`${robot.damage} damage`}>
            <small>DAMAGE</small>
            {Array.from({ length: 10 }, (_, index) => (
              <i key={index} className={index < robot.damage ? "hit" : ""} />
            ))}
          </div>
        </div>
        <div className="register-row">
          {registers.map((register, index) => {
            const card =
              register.locked || robot.finishedProgramming || playback.playing
                ? register.card
                : ordered.shift();
            return (
              <div
                className={`register ${register.locked ? "locked" : card ? "filled" : ""} ${playback.active?.event.register === index + 1 ? "executing" : ""}`}
                key={index}
              >
                <b>{index + 1}</b>
                {register.locked && <span className="lock">LOCKED</span>}
                {card ? (
                  <>
                    <strong>{ICONS[card.kind]}</strong>
                    <small>{PROGRAM_LABELS[card.kind]}</small>
                    <em>{card.priority}</em>
                    {!register.locked && canEdit && (
                      <div>
                        <button onClick={() => moveSelected(card.id, -1)} aria-label="Move earlier">
                          ‹
                        </button>
                        <button onClick={() => toggle(card)} aria-label="Remove card">
                          ×
                        </button>
                        <button onClick={() => moveSelected(card.id, 1)} aria-label="Move later">
                          ›
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="empty-slot">choose a card</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="hand-row" aria-label="Program card hand">
          {view.hand.map((card, index) => (
            <button
              aria-label={`${PROGRAM_LABELS[card.kind]}, priority ${card.priority}`}
              aria-pressed={selected.includes(card.id)}
              className={`program-card ${selected.includes(card.id) ? "selected" : ""} type-${card.kind}`}
              onClick={() => toggle(card)}
              key={card.id}
              disabled={!canEdit}
            >
              <kbd>{index + 1}</kbd>
              <span className="card-category">
                {card.kind.startsWith("move")
                  ? "TRAVEL"
                  : card.kind === "backup"
                    ? "REVERSE"
                    : "ROTATE"}
              </span>
              <strong>{ICONS[card.kind]}</strong>
              <span>{PROGRAM_LABELS[card.kind]}</span>
              <em>
                <span>PRIORITY</span> {card.priority}
              </em>
            </button>
          ))}
        </div>
        {robot.poweredDown && view.public.phase === "programming" ? (
          <div className="power-down-choice">
            <span>Your robot is safely powered down. Run one CPU turn, then choose again.</span>
            <button type="button" disabled={playback.playing} onClick={() => powerDown(true)}>
              STAY POWERED DOWN
            </button>
            <button
              className="primary"
              type="button"
              disabled={playback.playing}
              onClick={() => powerDown(false)}
            >
              POWER UP AFTER THIS TURN <span>→</span>
            </button>
          </div>
        ) : (
          <div className="console-actions">
            <button
              type="button"
              className={robot.powerDownNext ? "active" : ""}
              disabled={playback.playing}
              onClick={() => powerDown(!robot.powerDownNext)}
            >
              POWER DOWN NEXT TURN
            </button>
            <label>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(event) => setReducedMotion(event.target.checked)}
              />{" "}
              REDUCED MOTION
            </label>
            <button
              className="primary"
              type="button"
              disabled={
                playback.playing || selected.length !== unlocked || robot.finishedProgramming
              }
              onClick={submit}
            >
              {robot.finishedProgramming
                ? "PLAN LOCKED"
                : playback.playing
                  ? "ROBOTS AT WORK"
                  : `LOCK IN ${selected.length}/${unlocked}`}{" "}
              <span>→</span>
            </button>
          </div>
        )}
      </section>
      {view.decision && (
        <div className="modal-backdrop">
          <section className="decision-modal" role="dialog" aria-modal="true">
            <p className="kicker">YOUR ROBOT NEEDS HELP</p>
            <h2>Choose what happens next</h2>
            <div>
              {view.decision.choices.map((choice) => (
                <button className="primary" key={choice} onClick={() => resolveDecision(choice)}>
                  {choice}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export function SoloResultPanel({
  view,
  returnHome,
}: {
  view: PrivateMatchView;
  returnHome: () => void;
}) {
  const human = view.public.robots.find((robot) => robot.seatId === view.seatId)!;
  const winner = view.public.robots.find((robot) => robot.seatId === view.public.winnerSeatId);
  const victory = winner?.seatId === human.seatId;
  const message = victory
    ? `${human.displayName} reached every checkpoint first.`
    : view.public.completionReason === "human-eliminated"
      ? `${human.displayName} ran out of archive copies.`
      : `${winner?.displayName ?? "A CPU robot"} reached the final checkpoint first.`;
  return (
    <div className="modal-backdrop solo-result-backdrop">
      <section
        className={`result-modal ${victory ? "victory" : "defeat"}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="solo-result-title"
      >
        <p className="kicker">
          {view.public.mode === "solo" ? "SOLO RACE COMPLETE" : "WORKSHOP RACE COMPLETE"}
        </p>
        <div className="result-portrait">
          <span>✦</span>
          <img
            src={ROBOT_BY_ID.get((victory ? human : (winner ?? human)).robotId)?.portraitUrl}
            alt=""
          />
          <span>✧</span>
        </div>
        <h2 id="solo-result-title">{victory ? "Factory champion!" : "Back to the workbench."}</h2>
        <p>{message}</p>
        <div className="result-stats">
          <span>
            <b>{human.checkpoint}</b> CHECKPOINTS
          </span>
          <span>
            <b>{human.lives}</b> LIVES LEFT
          </span>
          <span>
            <b>{view.public.robots.length}</b> LITTLE RACERS
          </span>
        </div>
        <button className="primary" type="button" onClick={returnHome}>
          RETURN TO THE WORKSHOP <span>→</span>
        </button>
      </section>
    </div>
  );
}

function CourseArt({ src }: { src: string }) {
  return (
    <div
      className="course-art"
      role="img"
      aria-label="Illustrated garden race course"
      style={{ backgroundPosition: `${src} center` }}
    />
  );
}

function EventLog({ events }: { events: MatchEvent[] }) {
  return (
    <div className="event-log">
      {events
        .slice(-8)
        .reverse()
        .map((item) => (
          <p key={item.revision}>
            <time>#{item.revision}</time>
            {item.message}
          </p>
        ))}
    </div>
  );
}

export function LegalPanel({ close }: { close: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={close}>
      <section
        className="legal-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={close}>
          ×
        </button>
        <p className="kicker">ABOUT THIS LITTLE WORLD</p>
        <h2 id="legal-title">Built for improbable plans.</h2>
        <p>
          Vibe Robots is an independent, unofficial, non-commercial browser adaptation inspired by
          the 2005 RoboRally rules. RoboRally is referenced only to identify rules compatibility.
        </p>
        <p>
          All art, robot models, sounds, interface design, layouts, and wording are original. No
          official logos, scans, textures, card prose, or promotional artwork are included.
        </p>
        <p>
          Private rooms hold match data for reconnection, then expire automatically. No account,
          chat, ranking, or player profile is created.
        </p>
        <button className="primary" onClick={close}>
          BACK TO THE WORKSHOP
        </button>
      </section>
    </div>
  );
}

export function CourseChip({ courseId }: { courseId: string }) {
  const course = COURSES.find((candidate) => candidate.id === courseId) ?? COURSES[0];
  return (
    <div className="course-chip">
      <small>NOW RACING</small>
      <strong>{course.name}</strong>
      <span>{course.boards.map((board) => BOARD_BY_ID.get(board.boardId)?.name).join(" + ")}</span>
    </div>
  );
}

export function HowToPlay({ close }: { close: () => void }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        const buttons = root.current?.querySelectorAll<HTMLButtonElement>("button");
        if (!buttons?.length) return;
        if (
          event.shiftKey &&
          (document.activeElement === buttons[0] || document.activeElement === root.current)
        ) {
          event.preventDefault();
          buttons[buttons.length - 1].focus();
        } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) {
          event.preventDefault();
          buttons[0].focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [close]);
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <section
        ref={root}
        tabIndex={-1}
        className="guide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={close} aria-label="Close instructions">
          ×
        </button>
        <p className="kicker">A SMALL GUIDE TO BIG ADVENTURES</p>
        <h2 id="guide-title">
          A good plan.
          <br />
          <em>A little happy chaos.</em>
        </h2>
        <div className="guide-steps">
          <article>
            <b>01</b>
            <h3>Plan five moves</h3>
            <p>
              Pick cards in order. Arrows move your robot forward; turns change which way it faces.
              Reorder with ‹ and ›.
            </p>
          </article>
          <article>
            <b>02</b>
            <h3>Watch it unfold</h3>
            <p>
              Everyone moves together, one register at a time. Higher priority cards go first.
              Belts, gears, and lasers act after each register.
            </p>
          </article>
          <article>
            <b>03</b>
            <h3>Follow the flags</h3>
            <p>
              Visit numbered checkpoints in order. Reach the last one first to win. Green repair
              tiles heal damage; pits cost a life.
            </p>
          </article>
        </div>
        <div className="guide-note">
          ✿ Need a breather? Power down next turn to repair damage. Your robot stays put while the
          workshop keeps moving.
        </div>
        <button className="primary" onClick={close}>
          LET’S MAKE A LITTLE CHAOS <span>→</span>
        </button>
      </section>
    </div>
  );
}
