"use client";

import { useEffect, useRef, useState } from "react";
import { courseBounds, courseTile } from "@/game/content/boards";
import { robotInspection, tileInspection, TURN_STAGES, type Inspection } from "@/game/inspection";
import { PROGRAM_LABELS } from "@/game/content/programs";
import type {
  MatchEvent,
  ProgramCard,
  CourseDefinition,
  ProgramKind,
  PublicRobotView,
} from "@/game/types";
import type { PlaybackView } from "./game-ui";

export function ProgramArt({ kind }: { kind: ProgramKind }) {
  const distance = kind === "move3" ? 3 : kind === "move2" ? 2 : 1;
  const movement = kind.startsWith("move") || kind === "backup";
  return (
    <svg className="program-art" viewBox="0 0 120 76" fill="none" aria-hidden="true">
      <path
        d="M14 62H106M14 38H106M14 14H106M36 8V68M60 8V68M84 8V68"
        stroke="currentColor"
        opacity=".10"
      />
      {movement ? (
        <g transform={kind === "backup" ? "translate(120 76) rotate(180)" : undefined}>
          <path
            d="M60 60V17M43 33L60 16L77 33"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {Array.from({ length: distance }, (_, i) => (
            <rect
              key={i}
              x={91}
              y={50 - i * 15}
              width="8"
              height="10"
              rx="2"
              fill="currentColor"
              opacity={0.5 + i * 0.2}
            />
          ))}
          <circle cx="60" cy="61" r="5" fill="currentColor" />
        </g>
      ) : (
        <g transform={kind === "left" ? "translate(120 0) scale(-1 1)" : undefined}>
          <path
            d={
              kind === "uturn"
                ? "M38 60V34C38 9 80 9 80 34V55M65 42L80 57L94 42"
                : "M39 61V39C39 25 49 22 61 22H83M69 8L84 22L69 36"
            }
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={kind === "uturn" ? 38 : 39} cy="61" r="5" fill="currentColor" />
        </g>
      )}
    </svg>
  );
}

export function TurnTimeline({ playback }: { playback: PlaybackView }) {
  const stage = playback.active?.event.stage ?? "program";
  const current = TURN_STAGES.findIndex((item) => item.id === stage);
  return (
    <section
      className={`turn-timeline ${playback.playing ? "is-playing" : ""}`}
      aria-label="Turn sequence"
    >
      <div
        className="turn-heading"
        data-help="Choose five cards. Each register runs through the same factory sequence; after all five, the next turn begins."
      >
        <span className="live-dot" />
        <div>
          <small>{playback.playing ? "EXECUTING YOUR TURN" : "PLAN → EXECUTE → REPEAT"}</small>
          <strong>
            {playback.playing
              ? `Register ${playback.active?.event.register ?? "—"} of 5`
              : "The turn sequence"}
          </strong>
        </div>
      </div>
      <ol>
        {TURN_STAGES.map((item, index) => (
          <li
            key={item.id}
            tabIndex={0}
            data-help={item.detail}
            data-help-title={item.label}
            aria-current={playback.playing && current === index ? "step" : undefined}
            className={
              playback.playing
                ? index === current
                  ? "current"
                  : index < current
                    ? "done"
                    : ""
                : ""
            }
          >
            <b>{item.icon}</b>
            <span>{item.label}</span>
            <small>{index + 1}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function BoardLegend() {
  return (
    <div className="board-legend" aria-label="Board legend">
      <span className="legend-title">FIELD GUIDE</span>
      {[
        ["belt", "›", "Belt · 1×", "Amber belts carry robots one square per register."],
        [
          "express",
          "»",
          "Express · 2×",
          "Blue express belts move in two stages, up to two squares per register. Double arrows and 2× markings identify them.",
        ],
        ["gear", "↻", "Gear", "Turn 90° in the direction marked on the gear."],
        ["laser", "⌖", "Laser", "Fires after gears. Walls and robots block the beam."],
        [
          "repair",
          "+",
          "Repair",
          "End your turn here to repair damage and save your archive. A diamond marks an upgrade workshop.",
        ],
        ["pit", "!", "Pit", "An open shaft. Entering it destroys your robot and costs a life."],
        ["flag", "⚑", "Checkpoint", "Visit numbered flags in order, after lasers resolve."],
      ].map(([id, icon, label, help]) => (
        <span
          className={`legend-item legend-${id}`}
          key={id}
          tabIndex={0}
          data-help={help}
          data-help-title={label}
        >
          <b>{icon}</b>
          {label}
        </span>
      ))}
    </div>
  );
}

export function Inspector({ info }: { info?: Inspection }) {
  return (
    <aside
      className={`tile-inspector ${info ? "inspecting" : ""}`}
      aria-label="Board inspector"
      style={{ "--inspect": info?.color ?? "#42715d" } as React.CSSProperties}
    >
      <small>{info?.eyebrow ?? "BOARD INSPECTOR"}</small>
      <strong>{info?.title ?? "Every square has a story."}</strong>
      <p>
        {info?.detail ??
          "Hover a tile or robot to inspect it. On touch screens, tap to reveal its rules and status."}
      </p>
    </aside>
  );
}

// One tooltip layer serves pointer and keyboard users, including disabled controls.
export function GameTooltips() {
  const [tip, setTip] = useState<{ title: string; detail?: string; x: number; y: number }>();
  useEffect(() => {
    const show = (event: Event) => {
      const element = event.target as Element;
      const target = element?.closest?.<HTMLElement>("[data-help]") ?? element?.closest?.<HTMLElement>("button,summary,input,.field-label");
      if (!target || target.closest(".map-grid")) {
        setTip(undefined);
        return;
      }
      const rect = target.getBoundingClientRect();
      const detail =
        target.dataset.help ??
        (target.matches(".program-card")
          ? undefined
          : target.matches(".course-picker button")
            ? "Select this course to update the live 3D preview. Open Explore map to inspect its exact layout."
            : target.matches(".robot-picker button")
              ? "Choose this robot as your driver. Each robot follows the same movement rules."
              : undefined);
      const title =
        target.dataset.helpTitle ??
        target.getAttribute("title") ??
        target.getAttribute("aria-label") ??
        target.getAttribute("placeholder") ??
        target.textContent?.trim().replace(/\s+/g, " ").slice(0, 70) ??
        "";
      setTip({
        title,
        detail,
        x: Math.max(12, Math.min(window.innerWidth - 320, rect.left + rect.width / 2 - 150)),
        y: rect.top > window.innerHeight / 2 ? rect.top - 12 : rect.bottom + 12,
      });
    };
    const clear = () => setTip(undefined);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") clear();
    };
    document.addEventListener("pointerover", show);
    document.addEventListener("focusin", show);
    document.addEventListener("pointerdown", clear);
    document.addEventListener("keydown", escape);
    document.addEventListener("scroll", clear, true);
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("pointerover", show);
      document.removeEventListener("focusin", show);
      document.removeEventListener("pointerdown", clear);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("scroll", clear, true);
      window.removeEventListener("blur", clear);
    };
  }, []);
  return tip ? (
    <div
      className="game-tooltip"
      role="tooltip"
      style={{
        left: tip.x,
        top: tip.y,
        transform: tip.y > window.innerHeight / 2 ? "translateY(-100%)" : undefined,
      }}
    >
      <strong>{tip.title}</strong>
      {tip.detail && <p>{tip.detail}</p>}
    </div>
  ) : null;
}

export function CourseMap({
  course,
  robots = [],
  close,
}: {
  course: CourseDefinition;
  robots?: PublicRobotView[];
  close: () => void;
}) {
  const root = useRef<HTMLElement>(null);
  const [inspection, setInspection] = useState<Inspection>();
  const { width, height } = courseBounds(course);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = root.current?.querySelectorAll<HTMLElement>('button,[tabindex="0"]');
        if (!nodes?.length) return;
        if (e.shiftKey && document.activeElement === nodes[0]) {
          e.preventDefault();
          nodes[nodes.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) {
          e.preventDefault();
          nodes[0].focus();
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
    <div className="modal-backdrop map-backdrop" onMouseDown={close}>
      <section
        ref={root}
        className="map-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="map-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header>
          <div>
            <p className="kicker">
              TACTICAL MAP · {width} × {height}
            </p>
            <h2 id="map-title">{course.name}</h2>
          </div>
          <button className="map-close" onClick={close} aria-label="Close map preview">
            Close ×
          </button>
        </header>
        <div className="map-content">
          <svg
            className="map-grid"
            viewBox={`-1 -1 ${width + 1.4} ${height + 2.7}`}
            role="group"
            aria-label="Interactive course map"
          >
            {Array.from({ length: width }, (_, x) => (
              <text
                key={`x${x}`}
                x={x + 0.5}
                y={-0.3}
                textAnchor="middle"
                fontSize=".28"
                fill="#647d70"
              >
                {String.fromCharCode(65 + x)}
              </text>
            ))}
            {Array.from({ length: height + 1 }, (_, y) => (
              <text
                key={`y${y}`}
                x={-0.4}
                y={y + 0.58}
                textAnchor="middle"
                fontSize=".25"
                fill="#647d70"
              >
                {y + 1}
              </text>
            ))}
            {Array.from({ length: width * (height + 1) }, (_, index) => {
              const x = index % width,
                y = Math.floor(index / width),
                tile = courseTile(course, x, y);
              const dock = course.docks.find((d) => d.x === x && d.y === y);
              if (!tile && !dock) return null;
              const info = tileInspection(course, x, y);
              const occupant = robots.find(
                (r) => !r.destroyed && !r.eliminated && r.position.x === x && r.position.y === y,
              );
              const fill = tile?.pit
                ? "#263b3e"
                : tile?.conveyor
                  ? tile.conveyor.speed === 2
                    ? "#cee7f6"
                    : "#f5deac"
                  : tile?.repair
                    ? "#bce1cc"
                    : dock
                      ? "#d9d3ec"
                      : "#f3f1e7";
              const angle = { north: 0, east: 90, south: 180, west: 270 }[
                tile?.conveyor?.direction ?? tile?.laser?.direction ?? "north"
              ];
              return (
                <g
                  key={index}
                  role="button"
                  tabIndex={0}
                  aria-label={`${info.eyebrow}: ${info.title}`}
                  onMouseEnter={() => setInspection(info)}
                  onFocus={() => setInspection(info)}
                  onClick={() => setInspection(occupant ? robotInspection(occupant) : info)}
                >
                  <rect
                    x={x + 0.035}
                    y={y + 0.035}
                    width=".93"
                    height=".93"
                    rx=".09"
                    fill={fill}
                    stroke="#b7c5bc"
                    strokeWidth=".025"
                  />
                  {tile?.conveyor && (
                    <g
                      transform={`translate(${x + 0.5} ${y + 0.5}) rotate(${angle})`}
                      fill="none"
                      stroke={tile.conveyor.speed === 2 ? "#1b71a6" : "#9b611b"}
                      strokeWidth=".095"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M-.2 .1L0 -.1L.2 .1" />
                      {tile.conveyor.speed === 2 && <path d="M-.2 -.14L0 -.34L.2 -.14" />}
                    </g>
                  )}
                  {tile?.gear && (
                    <text x={x + 0.5} y={y + 0.7} textAnchor="middle" fontSize=".65" fill="#916533">
                      {tile.gear === "right" ? "↻" : "↺"}
                    </text>
                  )}
                  {tile?.repair && (
                    <text x={x + 0.5} y={y + 0.7} textAnchor="middle" fontSize=".6" fill="#256b50">
                      {tile.optionSite ? "✚" : "+"}
                    </text>
                  )}
                  {tile?.pit && (
                    <text x={x + 0.5} y={y + 0.7} textAnchor="middle" fontSize=".6" fill="#f9c164">
                      !
                    </text>
                  )}
                  {tile?.laser && (
                    <g transform={`translate(${x + 0.5} ${y + 0.5}) rotate(${angle})`}>
                      <path
                        d="M0 .3V-.35M-.12 -.2L0 -.35L.12 -.2"
                        fill="none"
                        stroke="#cc5047"
                        strokeWidth=".1"
                      />
                    </g>
                  )}
                  {tile?.pusher && (
                    <text x={x + 0.5} y={y + 0.7} textAnchor="middle" fontSize=".5">
                      ⇥
                    </text>
                  )}
                  {tile?.walls?.map((wall) => (
                    <path
                      key={wall}
                      d={
                        wall === "north"
                          ? `M${x},${y + 0.05}h1`
                          : wall === "south"
                            ? `M${x},${y + 0.95}h1`
                            : wall === "east"
                              ? `M${x + 0.95},${y}v1`
                              : `M${x + 0.05},${y}v1`
                      }
                      stroke="#3c5d50"
                      strokeWidth=".12"
                    />
                  ))}
                  {tile?.checkpoint && (
                    <>
                      <circle
                        cx={x + 0.5}
                        cy={y + 0.5}
                        r=".34"
                        fill="#ffcc67"
                        stroke="#9a6b23"
                        strokeWidth=".04"
                      />
                      <text
                        x={x + 0.5}
                        y={y + 0.65}
                        textAnchor="middle"
                        fontSize=".45"
                        fontWeight="bold"
                        fill="#5a3b16"
                      >
                        {tile.checkpoint}
                      </text>
                    </>
                  )}
                  {dock && (
                    <text x={x + 0.5} y={y + 0.65} textAnchor="middle" fontSize=".4" fill="#74618d">
                      {dock.number}
                    </text>
                  )}
                  {occupant && (
                    <circle
                      cx={x + 0.77}
                      cy={y + 0.22}
                      r=".19"
                      fill={robotInspection(occupant).color}
                      stroke="white"
                      strokeWidth=".07"
                    />
                  )}
                </g>
              );
            })}
          </svg>
          <div className="map-sidebar">
            <p className="map-intro">Your route to the finish.</p>
            <p>
              Visit flags <b>1 → 2 → 3</b> in order. Hover, focus or tap a square to learn what it
              does.
            </p>
            <Inspector info={inspection} />
            <BoardLegend />
          </div>
        </div>
      </section>
    </div>
  );
}

export function actionDescription(event?: MatchEvent, robots: PublicRobotView[] = []) {
  if (!event) return "Preparing the factory sequence…";
  const name = robots.find((robot) => robot.seatId === event.seatId)?.displayName ?? "Robot";
  const card = event.data?.card as ProgramCard | undefined;
  if (event.type === "program" && card)
    return `${name} plays ${PROGRAM_LABELS[card.kind]} · priority ${card.priority}`;
  if (
    event.from &&
    event.to &&
    ["move", "push", "conveyor", "express-conveyor", "pusher"].includes(event.type)
  ) {
    const direction =
      event.to.x > event.from.x
        ? "east"
        : event.to.x < event.from.x
          ? "west"
          : event.to.y > event.from.y
            ? "south"
            : "north";
    const square = (p: { x: number; y: number }) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
    const verb =
      event.type === "push" || event.type === "pusher"
        ? "is pushed"
        : event.source === "express-conveyor"
          ? "rides an express belt"
          : event.type === "conveyor"
            ? "rides a belt"
            : "moves";
    return `${name} ${verb} ${direction} · ${square(event.from)} → ${square(event.to)}`;
  }
  if (event.type === "turn" || event.type === "gear")
    return `${name} turns ${event.fromDirection} → ${event.toDirection}${event.source === "conveyor-bend" ? " with the belt" : event.type === "gear" ? " on a gear" : ""}`;
  return event.message;
}
