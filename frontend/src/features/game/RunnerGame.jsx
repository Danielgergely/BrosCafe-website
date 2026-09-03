import { useCallback, useEffect, useRef, useState } from "react";

import palette from "@/config/palette";
import {
  MAX_TICKS, PLAYER_H, PLAYER_W, PLAYER_X, TICK_RATE, UNITS, WORLD_W, createRun,
} from "@/features/game/runnerSim";
import { useI18n } from "@/i18n";

const WORLD_H = 220;
const GROUND_Y = WORLD_H - 30;

/**
 * The playable game.
 *
 * Draws whatever the shared simulation says, and records nothing but the ticks
 * the player pressed on — those go to the server, which replays them and
 * decides the score. This component never computes a score worth trusting, on
 * purpose: anything it worked out could be edited in a console.
 *
 * The loop runs on a fixed timestep and catches up on dropped frames, so a
 * stutter costs no distance and, more importantly, produces the same run the
 * server will replay.
 */
export default function RunnerGame({ seed, onFinish, paused = false }) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const runRef = useRef(null);
  const jumpsRef = useRef([]);
  const pendingJump = useRef(false);
  const [score, setScore] = useState(0);
  const [over, setOver] = useState(false);

  const jump = useCallback(() => {
    pendingJump.current = true;
  }, []);

  useEffect(() => {
    if (!seed || paused) return undefined;
    runRef.current = createRun(seed);
    jumpsRef.current = [];
    setScore(0);
    setOver(false);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const scale = window.devicePixelRatio || 1;
    canvas.width = WORLD_W * scale;
    canvas.height = WORLD_H * scale;
    ctx.scale(scale, scale);

    let raf = 0;
    let last = performance.now();
    let carry = 0;
    const stepMs = 1000 / TICK_RATE;
    let finished = false;

    const draw = (state) => {
      ctx.clearRect(0, 0, WORLD_W, WORLD_H);
      ctx.fillStyle = palette.cream;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      ctx.strokeStyle = palette.creamDark;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y + 1);
      ctx.lineTo(WORLD_W, GROUND_Y + 1);
      ctx.stroke();

      // Obstacles: coffee beans on the ground, portafilters standing tall.
      ctx.fillStyle = palette.olive;
      for (const [ox, ow, oh] of state.obstacles) {
        ctx.fillRect(ox, GROUND_Y - oh, ow, oh);
        ctx.fillStyle = palette.oliveSoft;
        ctx.fillRect(ox + 4, GROUND_Y - oh + 5, ow - 8, 3);
        ctx.fillStyle = palette.olive;
      }

      const py = GROUND_Y - PLAYER_H - Math.floor(state.y / UNITS);
      ctx.fillStyle = palette.ink;
      ctx.fillRect(PLAYER_X, py, PLAYER_W, PLAYER_H);
      ctx.fillStyle = palette.cream;
      ctx.fillRect(PLAYER_X + 5, py + 7, PLAYER_W - 10, 5);
      ctx.fillStyle = palette.ink;
      ctx.fillRect(PLAYER_X + PLAYER_W, py + 12, 7, 12);
    };

    const frame = (now) => {
      const run = runRef.current;
      carry += now - last;
      last = now;
      // Cap catch-up so a backgrounded tab does not fast-forward the run.
      if (carry > 250) carry = 250;

      while (carry >= stepMs && !run.state.dead && run.state.tick < MAX_TICKS) {
        const pressed = pendingJump.current;
        pendingJump.current = false;
        if (pressed && run.state.y === 0) jumpsRef.current.push(run.state.tick);
        run.step(pressed);
        carry -= stepMs;
      }

      draw(run.state);
      setScore(run.state.distance);

      if ((run.state.dead || run.state.tick >= MAX_TICKS) && !finished) {
        finished = true;
        setOver(true);
        onFinish?.(jumpsRef.current.slice(), run.state.distance);
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    const onKey = (event) => {
      if (event.code === "Space" || event.code === "ArrowUp") {
        event.preventDefault();
        jump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [seed, paused, jump, onFinish]);

  return (
    <div className="select-none">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-label text-olive">
          {t("game.distance")}
        </span>
        <span data-testid="game-score" className="font-display text-3xl tabular-nums text-ink">
          {score}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        data-testid="game-canvas"
        onPointerDown={(event) => {
          event.preventDefault();
          jump();
        }}
        role="button"
        tabIndex={0}
        aria-label={t("game.jump")}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") jump();
        }}
        className="mt-2 w-full cursor-pointer rounded-card border border-line bg-cream"
        style={{ aspectRatio: `${WORLD_W} / ${WORLD_H}`, touchAction: "manipulation" }}
      />
      <p className="mt-2 text-center text-xs text-muted">
        {over ? t("game.gameOver") : t("game.howTo")}
      </p>
    </div>
  );
}
