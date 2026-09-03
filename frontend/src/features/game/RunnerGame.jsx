import { useCallback, useEffect, useRef, useState } from "react";

import palette from "@/config/palette";
import {
  MAX_TICKS, PLAYER_H, PLAYER_W, PLAYER_X, TICK_RATE, UNITS, WORLD_W, createRun,
} from "@/features/game/runnerSim";
import { useI18n } from "@/i18n";

// Taller than the jump needs, so a boosted arc has headroom rather than
// clipping the top of the frame.
const WORLD_H = 300;
const GROUND_Y = WORLD_H - 46;

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

      // Four things to jump: a bean, a portafilter, a sack, a grinder. The
      // physics is the same box either way — the shapes are so a player can
      // tell at a glance how much height they need.
      for (const [ox, ow, oh, base, kind] of state.obstacles) {
        const top = GROUND_Y - base - oh;
        ctx.fillStyle = palette.olive;
        if (kind === 0) {
          ctx.beginPath();
          ctx.ellipse(ox + ow / 2, GROUND_Y - oh / 2, ow / 2, oh / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = palette.cream;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(ox + ow / 2, top + 3);
          ctx.lineTo(ox + ow / 2, GROUND_Y - 3);
          ctx.stroke();
        } else if (kind === 1) {
          ctx.fillRect(ox + ow / 2 - 3, top, 6, oh);
          ctx.fillRect(ox, top, ow, 13);
          ctx.fillStyle = palette.oliveSoft;
          ctx.fillRect(ox + 3, top + 3, ow - 6, 4);
        } else if (kind === 2) {
          ctx.beginPath();
          ctx.moveTo(ox, GROUND_Y);
          ctx.lineTo(ox + 6, top + 4);
          ctx.lineTo(ox + ow - 6, top + 4);
          ctx.lineTo(ox + ow, GROUND_Y);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = palette.oliveSoft;
          ctx.fillRect(ox + 10, top + 10, ow - 20, 4);
        } else if (kind === 3) {
          ctx.fillRect(ox + 4, top + 16, ow - 8, oh - 16);
          ctx.fillRect(ox, top, ow, 14);
          ctx.fillStyle = palette.oliveSoft;
          ctx.fillRect(ox + 7, top + 22, ow - 14, 5);
          ctx.fillStyle = palette.olive;
          ctx.fillRect(ox + ow - 3, top + 20, 7, 10);
        } else {
          // A shelf of cups hanging overhead. Deliberately drawn with legs
          // that stop short of the ground, so it reads as something to run
          // under rather than something to jump.
          ctx.fillRect(ox, top, ow, 10);
          for (let i = 0; i < 3; i += 1) {
            const cx = ox + 10 + i * ((ow - 20) / 2);
            ctx.fillRect(cx - 6, top + 10, 12, 13);
          }
          ctx.fillStyle = palette.oliveSoft;
          ctx.fillRect(ox + 2, top + 2, ow - 4, 3);
        }
      }

      const py = GROUND_Y - PLAYER_H - Math.floor(state.y / UNITS);
      ctx.fillStyle = palette.ink;
      ctx.fillRect(PLAYER_X, py, PLAYER_W, PLAYER_H);
      ctx.fillStyle = palette.cream;
      ctx.fillRect(PLAYER_X + 5, py + 7, PLAYER_W - 10, 5);
      ctx.fillStyle = palette.ink;
      ctx.fillRect(PLAYER_X + PLAYER_W, py + 12, 7, 12);
      // A wisp of steam while the boost is still available, so the player can
      // see they have one in hand.
      if (state.y > 0 && !state.boosted) {
        ctx.strokeStyle = palette.oliveSoft;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(PLAYER_X + 10, py - 4);
        ctx.quadraticCurveTo(PLAYER_X + 18, py - 12, PLAYER_X + 12, py - 20);
        ctx.stroke();
      }
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
