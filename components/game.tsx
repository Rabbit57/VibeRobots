"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { COURSES } from "@/game/content/boards";
import { ROBOTS } from "@/game/content/robots";
import {
  appendPresentationBatch,
  applyPresentationEvent,
  eventDuration,
  isVisualEvent,
  reconcilePresentation,
  resetPresentation,
  type PresentationStep,
} from "@/game/presentation";
import type {
  MatchEvent,
  MatchMode,
  PrivateMatchView,
  ProgramCard,
  PublicRobotView,
} from "@/game/types";
import {
  CourseChip,
  HowToPlay,
  HomePanel,
  JoinPanel,
  LegalPanel,
  LobbyPanel,
  MatchHud,
  SoloResultPanel,
  type PlaybackView,
} from "./game-ui";
import { CourseMap, GameTooltips, Inspector } from "./game-details";
import { TURN_STAGES, type Inspection } from "@/game/inspection";
import type { GraphicsQuality } from "./factory-scene";
import type { VisualFixture } from "@/game/visual-fixtures";

const FactoryScene = lazy(() =>
  import("./factory-scene").then((module) => ({ default: module.FactoryScene })),
);

type Screen = "home" | "lobby" | "match";
type RoomReply = { code: string; seatId: string; seatToken: string; view: PrivateMatchView };

export function VibeRobotsGame({ title }: { title: string }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  const [robotId, setRobotId] = useState(ROBOTS[0].id);
  const [view, setView] = useState<PrivateMatchView>();
  const [selected, setSelected] = useState<string[]>([]);
  const [submittedPlan, setSubmittedPlan] = useState<PublicRobotView["registers"]>([]);
  const [courseId, setCourseId] = useState(COURSES[0].id);
  const [fourLives, setFourLives] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [fast, setFast] = useState(false);
  const [quality, setQuality] = useState<GraphicsQuality>("auto");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [inspection, setInspection] = useState<Inspection>();
  const closeMap = useCallback(() => setMapOpen(false), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const [hydrated, setHydrated] = useState(false);
  const [cameraReset, setCameraReset] = useState(0);
  const [visualFixture, setVisualFixture] = useState<VisualFixture>();
  const [connectionEpoch, setConnectionEpoch] = useState(0);
  const [readyCourseId, setReadyCourseId] = useState("");
  const socket = useRef<WebSocket | undefined>(undefined);
  const audio = useRef<AudioContext | undefined>(undefined);
  const reconnectTimer = useRef<number | undefined>(undefined);
  const shuttingDown = useRef(false);

  const publicState = view?.public;
  const ownRobot = publicState?.robots.find((robot) => robot.seatId === view?.seatId);
  const isHost = publicState?.hostSeatId === view?.seatId;
  const selectedCourse =
    COURSES.find(
      (course) =>
        course.id ===
        (screen === "lobby" && isHost ? courseId : (publicState?.courseId ?? courseId)),
    ) ?? COURSES[0];
  const markSceneReady = useCallback(
    () => setReadyCourseId(selectedCourse.id),
    [selectedCourse.id],
  );
  const scheduledPlayback = usePresentationPlayback(view, fast, reducedMotion, connectionEpoch);
  const playback: PlaybackView = visualFixture
    ? {
        robots: visualFixture.view?.public.robots ?? [],
        active: visualFixture.activeEvent
          ? { event: visualFixture.activeEvent, durationMs: 1_000 }
          : undefined,
        remaining: 0,
        playing: Boolean(visualFixture.activeEvent),
      }
    : scheduledPlayback;

  const playSfx = useCallback(
    (event?: MatchEvent) => {
      if (muted || typeof window === "undefined") return;
      const context = audio.current ?? new AudioContext();
      audio.current = context;
      if (context.state === "suspended") void context.resume();
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const type = event?.type;
      oscillator.type =
        type === "damage" || type === "destroyed" || type === "laser-fired" ? "triangle" : "sine";
      if (type === "checkpoint" || type === "victory") {
        [523.25, 659.25, 783.99, ...(type === "victory" ? [1046.5] : [])].forEach((note, index) => {
          const chime = context.createOscillator();
          const envelope = context.createGain();
          chime.type = "sine";
          chime.frequency.value = note;
          const at = now + index * 0.09;
          envelope.gain.setValueAtTime(0, at);
          envelope.gain.linearRampToValueAtTime(0.04, at + 0.015);
          envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
          chime.connect(envelope).connect(context.destination);
          chime.start(at);
          chime.stop(at + 0.5);
        });
      }
      const frequency =
        type === "laser-fired"
          ? 620
          : type === "damage"
            ? 105
            : type === "checkpoint" || type === "victory"
              ? 520
              : type === "move"
                ? 170
                : 240;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        type === "laser-fired" ? 130 : Math.max(70, frequency * 1.24),
        now + 0.13,
      );
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(type === "damage" ? 0.045 : 0.026, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (type === "victory" ? 0.32 : 0.16));
      const pan = context.createStereoPanner();
      const x = event?.to?.x ?? event?.from?.x ?? 6;
      pan.pan.value = Math.max(-0.72, Math.min(0.72, (x - 6) / 8));
      oscillator.connect(gain).connect(pan).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + (type === "victory" ? 0.34 : 0.18));
    },
    [muted],
  );

  useEffect(() => {
    if (playback.active && playback.active.event.type !== "stage") playSfx(playback.active.event);
  }, [playback.active?.event.revision, playSfx]);

  const connect = useCallback((code: string, seatId: string, seatToken: string) => {
    shuttingDown.current = false;
    window.clearTimeout(reconnectTimer.current);
    socket.current?.close();
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/api/rooms/${code}/socket`);
    socket.current = ws;
    setConnectionEpoch((value) => value + 1);
    ws.addEventListener("open", () => {
      setError("");
      ws.send(JSON.stringify({ type: "authenticate", seatId, seatToken }));
    });
    ws.addEventListener("message", (message) => {
      const payload = JSON.parse(String(message.data)) as {
        type: string;
        view?: PrivateMatchView;
        error?: string;
      };
      if (payload.view) {
        setView(payload.view);
        if (payload.view.public.phase === "lobby") setCourseId(payload.view.public.courseId);
        setScreen(payload.view.public.phase === "lobby" ? "lobby" : "match");
        setError("");
      }
      if (payload.error) setError(payload.error);
    });
    ws.addEventListener("close", () => {
      if (socket.current !== ws || shuttingDown.current) return;
      setError("The factory paused while the connection catches up…");
      reconnectTimer.current = window.setTimeout(() => connect(code, seatId, seatToken), 1_200);
    });
  }, []);

  useEffect(() => {
    setHydrated(true);
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const params = new URLSearchParams(window.location.search);
    const visual = params.get("visual");
    if (visual && process.env.NODE_ENV !== "production") {
      void import("@/game/visual-fixtures").then(({ makeVisualFixture }) => {
        const fixture = makeVisualFixture(visual);
        if (!fixture) return;
        setVisualFixture(fixture);
        setScreen(fixture.screen);
        setView(fixture.view);
        setCourseId(fixture.view?.public.courseId ?? COURSES[0].id);
      });
      return;
    }
    const code = params.get("room")?.toUpperCase() ?? "";
    if (!code) return;
    setRoomCode(code);
    setScreen("lobby");
    const saved = loadSeat(code);
    if (saved) {
      connect(code, saved.seatId, saved.seatToken);
      return;
    }
    void fetch(`/api/rooms/${code}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Room not found or expired.");
        const metadata = (await response.json()) as PrivateMatchView["public"];
        if (metadata.mode === "solo") {
          history.replaceState(null, "", location.pathname);
          setRoomCode("");
          setScreen("home");
          throw new Error(
            "That solo workshop can only be reopened in the browser that created it.",
          );
        }
        const used = new Set(metadata.robots.map((robot) => robot.robotId));
        setRobotId(ROBOTS.find((robot) => !used.has(robot.id))?.id ?? ROBOTS[0].id);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Room unavailable."));
  }, [connect]);

  async function createRoom(mode: MatchMode) {
    setBusy(true);
    setError("");
    playSfx();
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() || "Host", robotId, mode }),
      });
      const data = (await response.json()) as RoomReply & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Room creation failed.");
      saveSeat(data.code, data.seatId, data.seatToken);
      history.replaceState(null, "", `?room=${data.code}`);
      setRoomCode(data.code);
      setView(data.view);
      setScreen("lobby");
      connect(data.code, data.seatId, data.seatToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create room.");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom() {
    setBusy(true);
    setError("");
    playSfx();
    try {
      const code = roomCode.replace(/[^A-Z0-9]/g, "").slice(0, 10);
      const saved = loadSeat(code);
      if (saved) {
        connect(code, saved.seatId, saved.seatToken);
        return;
      }
      const response = await fetch(`/api/rooms/${code}/join`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: name.trim() || "Driver", robotId }),
      });
      const data = (await response.json()) as RoomReply & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not join that room.");
      saveSeat(code, data.seatId, data.seatToken);
      history.replaceState(null, "", `?room=${code}`);
      setView(data.view);
      setScreen("lobby");
      connect(code, data.seatId, data.seatToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not join room.");
    } finally {
      setBusy(false);
    }
  }

  const send = useCallback(
    (type: string, extra: Record<string, unknown> = {}) => {
      if (!socket.current || !view) return;
      socket.current.send(
        JSON.stringify({
          type: "command",
          command: { type, id: crypto.randomUUID(), revision: view.public.revision, ...extra },
        }),
      );
    },
    [view],
  );

  const returnHome = useCallback(() => {
    shuttingDown.current = true;
    window.clearTimeout(reconnectTimer.current);
    socket.current?.close(1000, "Returning to workshop");
    socket.current = undefined;
    if (roomCode) sessionStorage.removeItem(`vibe-robots:${roomCode}`);
    history.replaceState(null, "", location.pathname);
    setView(undefined);
    setVisualFixture(undefined);
    setSelected([]);
    setSubmittedPlan([]);
    setRoomCode("");
    setError("");
    setScreen("home");
  }, [roomCode]);

  function toggleCard(card: ProgramCard) {
    if (ownRobot?.finishedProgramming || playback.playing || publicState?.phase !== "programming")
      return;
    const openRegisters = ownRobot?.registers.filter((register) => !register.locked).length ?? 5;
    setSelected((current) =>
      current.includes(card.id)
        ? current.filter((id) => id !== card.id)
        : current.length < openRegisters
          ? [...current, card.id]
          : current,
    );
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

  function submitPlan() {
    if (!view || !ownRobot || playback.playing || ownRobot.finishedProgramming) return;
    const cards = selected.map((id) => view.hand.find((card) => card.id === id)!);
    if (cards.length !== ownRobot.registers.filter((register) => !register.locked).length) return;
    setSubmittedPlan(
      ownRobot.registers.map((register) => ({
        ...register,
        card: register.locked ? register.card : (cards.shift() ?? null),
      })),
    );
    send("program", { cards: selected });
  }

  useEffect(() => {
    if (!playback.playing && !ownRobot?.finishedProgramming) setSubmittedPlan([]);
  }, [playback.playing, ownRobot?.finishedProgramming]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        screen !== "match" ||
        !view ||
        playback.playing ||
        helpOpen ||
        mapOpen ||
        legalOpen ||
        view.public.phase !== "programming" ||
        ownRobot?.finishedProgramming ||
        /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)
      )
        return;
      const digit = Number(event.key);
      if (digit >= 1 && digit <= 9 && view.hand[digit - 1]) toggleCard(view.hand[digit - 1]);
      if (
        event.key === "Enter" &&
        (event.target as HTMLElement)?.closest("button:not(.program-card)")
      )
        return;
      if (
        event.key === "Enter" &&
        selected.length === ownRobot?.registers.filter((register) => !register.locked).length
      ) {
        event.preventDefault();
        submitPlan();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  useEffect(() => setSelected([]), [view?.hand.map((card) => card.id).join("|")]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      (window as typeof window & { __VIBE_MATCH__?: PrivateMatchView }).__VIBE_MATCH__ = view;
    }
  }, [view]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production")
      (window as typeof window & { __VIBE_PLAYBACK__?: PlaybackView }).__VIBE_PLAYBACK__ = playback;
  }, [playback]);

  const showScene = Boolean(view) && screen !== "home";
  return (
    <div
      data-playback={playback.playing ? "playing" : "idle"}
      className={`game-root ${fast ? "speed-fast" : ""} ${reducedMotion ? "reduce-motion" : ""}`}
      data-screen={screen}
      data-ready={hydrated}
      data-visual={visualFixture?.mode}
    >
      <GameTooltips />
      <div className="phone-gate">
        <span className="phone-robot">◉‿◉</span>
        <h1>Factory floor too small</h1>
        <p>
          The diorama likes a wider table. Turn a tablet sideways or open Vibe Robots on a desktop
          to play.
        </p>
      </div>
      <header className="topbar">
        <button
          className="brand"
          type="button"
          onClick={screen === "home" ? undefined : returnHome}
          aria-label="Vibe Robots home"
        >
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
          </span>
          <span>
            {title}
            <small>A LITTLE WORKSHOP ADVENTURE</small>
          </span>
        </button>
        <div className={`status-strip ${publicState?.phase === "paused" ? "is-paused" : ""}`}>
          <i className={publicState?.phase === "paused" ? "amber" : ""} />
          <span>
            {publicState?.phase === "paused"
              ? "Paused · reconnecting"
              : playback.playing
                ? playbackLabel(playback.active?.event)
                : publicState
                  ? phaseLabel(publicState.phase)
                  : "Workshop ready"}
          </span>
        </div>
        <nav className="top-actions" aria-label="Presentation settings">
          <button
            type="button"
            data-help="Switch between the default cinematic pace and 2.5× faster playback. You can change speed during a turn."
            data-help-title="Playback speed"
            aria-pressed={fast}
            onClick={() => setFast(!fast)}
          >
            {fast ? "2.5×" : "1×"}
          </button>
          <button
            type="button"
            aria-pressed={muted}
            onClick={() => {
              setMuted(!muted);
              playSfx();
            }}
            data-help="Toggle movement sounds, laser effects and checkpoint chimes."
            data-help-title="Game sound"
          >
            {muted ? "SOUND OFF" : "SOUND ON"}
          </button>
          <button
            type="button"
            data-help="Cycle Auto, High and Eco. High adds sharper edges and shadows. Eco reduces graphics cost on slower devices."
            data-help-title="Graphics quality"
            onClick={() => setQuality(nextQuality(quality))}
          >
            GRAPHICS {quality.toUpperCase()}
          </button>
          {showScene && (
            <button
              type="button"
              data-help="Reset the camera to show the whole course. Drag to orbit, right-drag to pan, and scroll to zoom."
              data-help-title="Center the board"
              onClick={() => setCameraReset((value) => value + 1)}
            >
              CENTER
            </button>
          )}
          <button
            type="button"
            data-help="Read the rules for programming, factory actions and winning the race."
            onClick={() => setHelpOpen(true)}
          >
            HOW TO PLAY
          </button>
        </nav>
      </header>
      <section
        className={`factory-viewport ${showScene ? "scene-live" : "hero-live"} ${showScene && readyCourseId === selectedCourse.id ? "scene-ready" : ""} ${screen === "match" ? "match-live" : ""}`}
        aria-label={showScene ? `3D view of ${selectedCourse.name}` : "Cozy robot workshop"}
      >
        <picture className="key-art">
          <img
            src="/assets/images/garden-workshop.webp"
            alt="Friendly little robots racing through a sunlit garden workshop"
          />
        </picture>
        {showScene && (
          <Suspense fallback={<SceneLoader />}>
            <FactoryScene
              course={selectedCourse}
              robots={
                screen === "lobby"
                  ? playback.robots
                      .filter((robot) => robot.spawnDock)
                      .map((robot) => ({
                        ...robot,
                        position: selectedCourse.docks.find(
                          (dock) => dock.number === robot.spawnDock,
                        )!,
                        direction: selectedCourse.docks.find(
                          (dock) => dock.number === robot.spawnDock,
                        )!.direction,
                      }))
                  : playback.robots
              }
              activeEvent={playback.active?.event}
              stepDurationMs={playback.active?.durationMs ?? 0}
              reducedMotion={reducedMotion}
              quality={quality}
              cameraReset={cameraReset}
              onReady={markSceneReady}
              ownSeatId={view?.seatId}
              ambientMotion={!visualFixture}
              onInspect={setInspection}
              onPresented={scheduledPlayback.onPresented}
            />
          </Suspense>
        )}
        <div className="warm-vignette" />
        {!showScene && (
          <>
            <div className="floating-petals" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => (
                <i key={i} style={{ "--i": i } as React.CSSProperties} />
              ))}
            </div>
            <div className="art-caption">
              <span>✿</span>
              <div>
                <small>WELCOME TO YOUR HAPPY PLACE</small>
                <strong>The garden workshop</strong>
              </div>
              <b>LET THE GOOD TIMES ROLL</b>
            </div>
          </>
        )}
        {publicState && (
          <CourseChip
            courseId={selectedCourse.id}
            preview={screen === "lobby"}
            openMap={() => setMapOpen(true)}
          />
        )}
        {showScene && <Inspector info={inspection} />}
        {showScene && (
          <div className="scene-hint">
            <span>↔ Drag to explore</span>
            <span>⊕ Scroll to zoom</span>
            <span>⚑ Visit flags in order</span>
          </div>
        )}
      </section>
      {screen === "home" && (
        <HomePanel
          name={name}
          setName={setName}
          robotId={robotId}
          setRobotId={setRobotId}
          roomCode={roomCode}
          setRoomCode={setRoomCode}
          createSolo={() => createRoom("solo")}
          createRoom={() => createRoom("multiplayer")}
          joinRoom={joinRoom}
          busy={busy || !hydrated}
          error={error}
        />
      )}
      {screen === "lobby" && view && (
        <LobbyPanel
          view={view}
          roomCode={roomCode || view.public.roomCode}
          isHost={isHost}
          courseId={courseId}
          setCourseId={(courseId) => {
            setCourseId(courseId);
            send("choose-course", { courseId });
          }}
          fourLives={fourLives}
          setFourLives={setFourLives}
          chooseSpawn={(dock) => send("choose-spawn", { dock })}
          start={() => send("start", { courseId, fourLifeRule: fourLives })}
          error={error}
        />
      )}
      {screen === "lobby" && !view && (
        <JoinPanel
          roomCode={roomCode}
          name={name}
          setName={setName}
          robotId={robotId}
          setRobotId={setRobotId}
          join={joinRoom}
          busy={busy || !hydrated}
          error={error}
        />
      )}
      {screen === "match" && view && (
        <MatchHud
          view={view}
          sceneRobots={playback.robots}
          selected={selected}
          toggle={toggleCard}
          moveSelected={moveSelected}
          submit={submitPlan}
          submittedPlan={submittedPlan}
          powerDown={(enabled) =>
            send(ownRobot?.poweredDown ? "stay-powered-down" : "announce-power-down", { enabled })
          }
          activateOption={(optionId, payload) => send("option", { optionId, payload })}
          resolveDecision={(choice) => send("decision", { choice })}
          reducedMotion={reducedMotion}
          setReducedMotion={setReducedMotion}
          playback={playback}
        />
      )}
      {screen === "match" && view && view.public.phase === "complete" && !playback.playing && (
        <SoloResultPanel view={view} returnHome={returnHome} />
      )}
      {helpOpen && <HowToPlay close={closeHelp} />}
      {mapOpen && (
        <CourseMap
          course={selectedCourse}
          robots={screen === "match" ? playback.robots : []}
          close={closeMap}
        />
      )}
      {screen === "home" && (
        <footer className="home-footer">
          <span>
            01 <b>Pick your robot</b>
            <i>⟶</i> 02 <b>Make a plan</b>
            <i>⟶</i> 03 <b>Enjoy the unexpected</b>
          </span>
          <button onClick={() => setLegalOpen(true)}>A small game with a lot of heart ↗</button>
        </footer>
      )}
      {screen === "match" && error && (
        <p className="connection-error" role="alert">
          {error}
        </p>
      )}
      {legalOpen && <LegalPanel close={() => setLegalOpen(false)} />}
    </div>
  );
}

function usePresentationPlayback(
  view: PrivateMatchView | undefined,
  fast: boolean,
  reducedMotion: boolean,
  connectionEpoch: number,
): PlaybackView {
  const [state, setState] = useState<{
    robots: PublicRobotView[];
    queue: PresentationStep[];
    active?: PresentationStep;
  }>({ robots: [], queue: [] });
  const [presentedRevision, acknowledge] = useState<number>();
  const lastQueued = useRef(0);
  const finalRobots = useRef<PublicRobotView[]>([]);
  const seenConnectionEpoch = useRef(-1);

  const skipToEnd = useCallback(() => {
    if (!view || view.public.mode !== "solo") return;
    const reset = resetPresentation(view.public.robots, view.public.eventRevision);
    acknowledge(undefined);
    lastQueued.current = reset.queue.lastRevision;
    finalRobots.current = view.public.robots;
    setState({ robots: reset.robots, queue: [] });
  }, [view]);

  useEffect(() => {
    if (!view) {
      acknowledge(undefined);
      lastQueued.current = 0;
      seenConnectionEpoch.current = -1;
      finalRobots.current = [];
      setState({ robots: [], queue: [] });
      return;
    }
    finalRobots.current = view.public.robots;
    if (seenConnectionEpoch.current !== connectionEpoch) {
      acknowledge(undefined);
      const reset = resetPresentation(view.public.robots, view.public.eventRevision);
      seenConnectionEpoch.current = connectionEpoch;
      lastQueued.current = reset.queue.lastRevision;
      setState({ robots: reset.robots, queue: [] });
      return;
    }
    const batch = appendPresentationBatch(
      { lastRevision: lastQueued.current, steps: [] },
      view.events,
      fast ? "fast" : "normal",
      reducedMotion,
    );
    lastQueued.current = batch.lastRevision;
    setState((current) => {
      const queue = [...current.queue, ...batch.steps];
      if (current.active) return { ...current, queue };
      const [active, ...rest] = queue;
      return active
        ? { robots: applyPresentationEvent(current.robots, active.event), active, queue: rest }
        : { robots: reconcilePresentation(current.robots, finalRobots.current), queue: [] };
    });
  }, [view, connectionEpoch]);

  const durationMs = state.active
    ? eventDuration(state.active.event, fast ? "fast" : "normal", reducedMotion)
    : 0;
  useEffect(() => {
    if (!state.active || presentedRevision !== state.active.event.revision) return;
    const timer = window.setTimeout(() => {
      setState((current) => {
        const [active, ...queue] = current.queue;
        return active
          ? { robots: applyPresentationEvent(current.robots, active.event), active, queue }
          : { robots: reconcilePresentation(current.robots, finalRobots.current), queue: [] };
      });
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [state.active, durationMs, presentedRevision]);

  const pendingVisuals =
    view?.events.some((event) => event.revision > lastQueued.current && isVisualEvent(event)) ??
    false;
  return {
    onPresented: acknowledge,
    skipToEnd: view?.public.mode === "solo" ? skipToEnd : undefined,
    presented: presentedRevision === state.active?.event.revision,
    robots: state.robots,
    active: state.active ? { ...state.active, durationMs } : undefined,
    remaining: state.queue.length,
    playing: Boolean(state.active || state.queue.length || pendingVisuals),
  };
}

function SceneLoader() {
  return (
    <div className="scene-loader" role="status">
      <i />
      <span>Assembling the tiny factory…</span>
    </div>
  );
}

function phaseLabel(phase: string) {
  return (
    (
      {
        lobby: "Friends gathering",
        programming: "Planning phase",
        executing: "Robots at work",
        paused: "Paused · reconnecting",
        complete: "Race complete",
        decision: "Decision waiting",
      } as Record<string, string>
    )[phase] ?? phase
  );
}

function playbackLabel(event?: MatchEvent) {
  if (!event) return "Winding the gears";
  const label = TURN_STAGES.find((stage) => stage.id === event.stage)?.label ?? event.type;
  return event.register ? `Register ${event.register} · ${label}` : label;
}

function nextQuality(quality: GraphicsQuality): GraphicsQuality {
  return quality === "auto" ? "high" : quality === "high" ? "eco" : "auto";
}

function saveSeat(code: string, seatId: string, seatToken: string) {
  sessionStorage.setItem(`vibe-robots:${code}`, JSON.stringify({ seatId, seatToken }));
}

function loadSeat(code: string): { seatId: string; seatToken: string } | undefined {
  try {
    return JSON.parse(sessionStorage.getItem(`vibe-robots:${code}`) ?? "null") ?? undefined;
  } catch {
    return;
  }
}
