// Bros Cafe — today's takings, as an iPhone home-screen and Lock Screen widget.
//
// Runs in the free Scriptable app (https://scriptable.app). Setup:
//   1. Install Scriptable, tap +, paste this whole file, name it "Bros forgalom".
//   2. Replace PASTE-THE-KEY-HERE below with the LIVE_SALES_KEY from Coolify.
//   3. Home screen: Edit Home Screen → Edit → Add Widget → Scriptable → small
//      or medium → then long-press the widget → Edit Widget → Script.
//      Lock Screen: hold the Lock Screen → Customize → Lock Screen → add a
//      Scriptable widget (round, rectangular or the line above the clock).
//
// What it shows:
//   - the background fills like a glass towards the day's break-even, and turns
//     olive once it's reached
//   - ▲/▼ against earlier weeks' same weekday up to the same minute (on a
//     public holiday: Saturdays, until there are a few earlier holidays)
//   - how much is still missing, and at today's pace roughly when it'll be in
//   - 🏆 when today beats the best day for this weekday (🏆🏆: best day ever)
//   - small: today's best seller; medium: today per hour against the usual
//     (dark bar = beat it, light = fell short, line = the usual), and the top 3
//   - Lock Screen: a ring closing at break-even with the total inside, or the
//     total, a progress bar and what's still missing
//   - a tap opens the live sales dashboard in /admin (fresh figures, forecasts)
// Figures are gross (VAT included), as the till shows them.

const URL = "https://broscafe.hu/api/live-sales";
const KEY = "PASTE-THE-KEY-HERE";
// Tapping the widget opens the live sales dashboard (staff login, once).
const DASHBOARD = "https://broscafe.hu/admin?tab=live";

const OLIVE = new Color("#66734A");
const CREAM = new Color("#F5F0E6");
const INK = new Color("#2F3324");
const MUTED = new Color("#4E5838");
const WATER_BACK = new Color("#C9D1AE", 0.55);
const WATER_FRONT = new Color("#AEBB86", 0.6);
const UP = new Color("#2E7D32");
const DOWN = new Color("#C62828");
const WHITE = (alpha = 1) => new Color("#FFFFFF", alpha);
const WEEKDAYS = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"];
const MEDALS = ["🥇", "🥈", "🥉"];
// Older than this means the server stopped updating.
const STALE_MINUTES = 45;

const money = (n) => `${Math.round(n).toLocaleString("hu-HU")} Ft`;
const thousands = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : `${(n / 1000).toLocaleString("hu-HU", { maximumFractionDigits: 1 })}k`);
const hhmm = (d) => d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
const pct = (n) => `${n >= 0 ? "+" : ""}${n.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}%`;
const hasDiff = (data) => data.diff_pct !== null && data.diff_pct !== undefined;
const arrow = (data) => (data.diff_pct >= 0 ? "▲" : "▼");

async function load() {
  const request = new Request(URL);
  request.headers = { Authorization: `Bearer ${KEY.trim()}` };
  request.timeoutInterval = 15;
  const data = await request.loadJSON();
  if (request.response.statusCode !== 200) {
    throw new Error(request.response.statusCode === 404 ? "Hibás kulcs" : "Még nincs adat");
  }
  return data;
}

function canvas(size, opaque = false) {
  const ctx = new DrawContext();
  ctx.size = size;
  ctx.opaque = opaque;
  ctx.respectScreenScale = true;
  return ctx;
}

function polyline(ctx, points, color, width) {
  if (points.length < 2) return;
  const path = new Path();
  points.forEach((p, i) => (i === 0 ? path.move(p) : path.addLine(p)));
  ctx.addPath(path);
  ctx.setStrokeColor(color);
  ctx.setLineWidth(width);
  ctx.strokePath();
}

// ---- home screen drawing -----------------------------------------------

/** The glass: water up to `level` (0–1) with a two-layer wavy surface. */
function glass(size, level, reached) {
  const ctx = canvas(size, true);
  ctx.setFillColor(reached ? OLIVE : CREAM);
  ctx.fillRect(new Rect(0, 0, size.width, size.height));
  if (reached || level <= 0) return ctx.getImage();

  const surface = size.height * (1 - level);
  const wave = (amplitude, phase, color) => {
    const path = new Path();
    path.move(new Point(0, size.height));
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const x = (size.width * i) / steps;
      const y = surface + amplitude * Math.sin((i / steps) * Math.PI * 2 + phase);
      path.addLine(new Point(x, Math.max(0, y)));
    }
    path.addLine(new Point(size.width, size.height));
    path.closeSubpath();
    ctx.addPath(path);
    ctx.setFillColor(color);
    ctx.fillPath();
  };
  wave(5, 0, WATER_BACK);
  wave(4, Math.PI * 0.8, WATER_FRONT);
  return ctx.getImage();
}

/**
 * Today per hour against the usual for this weekday. A finished hour is a
 * dark bar if it beat the usual and a light one if it fell short; the usual
 * is a short line across each slot, so the gap reads at a glance. The hour
 * still running is an outline — it isn't fair to judge it yet — and hours to
 * come show only where the usual day would be.
 */
function hourBars(size, data, reached) {
  const ctx = canvas(size);
  const strong = reached ? CREAM : OLIVE;
  const weak = reached ? new Color("#F5F0E6", 0.35) : new Color("#66734A", 0.5);
  const tick = reached ? new Color("#1E2216") : INK;
  const label = reached ? CREAM : MUTED;

  const today = data.hours || {};
  const usual = data.average_hours || {};
  const hours = [...Object.keys(today), ...Object.keys(usual)].map(Number);
  if (!hours.length) return ctx.getImage();
  const from = Math.min(...hours), to = Math.max(...hours);
  const max = Math.max(...Object.values(today), ...Object.values(usual), 1);
  const now = new Date(data.updated_at).getHours();

  const slot = size.width / (to - from + 1);
  const bottom = size.height - 12, ceiling = 3;
  const y = (v) => bottom - (v / max) * (bottom - ceiling);
  for (let h = from; h <= to; h++) {
    const x = (h - from) * slot;
    const barX = x + slot * 0.2, barW = slot * 0.6;
    const value = today[h] || 0, normal = usual[h] || 0;
    if (value && h < now) {
      ctx.setFillColor(value >= normal ? strong : weak);
      ctx.fillRect(new Rect(barX, y(value), barW, bottom - y(value)));
    } else if (value && h === now) {
      const outline = new Path();
      outline.addRect(new Rect(barX + 0.75, y(value) + 0.75, barW - 1.5, bottom - y(value) - 0.75));
      ctx.addPath(outline);
      ctx.setStrokeColor(strong);
      ctx.setLineWidth(1.5);
      ctx.strokePath();
    }
    if (normal) {
      ctx.setFillColor(tick);
      ctx.fillRect(new Rect(x + slot * 0.08, y(normal) - 1, slot * 0.84, 2));
    }
    if ((h - from) % 3 === 0) {
      ctx.setFont(Font.systemFont(8));
      ctx.setTextColor(label);
      ctx.drawTextInRect(String(h), new Rect(x, bottom + 2, slot * 2, 10));
    }
  }
  return ctx.getImage();
}

// ---- home screen layout ------------------------------------------------

function text(stack, value, size, color, bold = false) {
  const t = stack.addText(value);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}

function trophies(data) {
  return data.record_ever ? " 🏆🏆" : data.record_weekday ? " 🏆" : "";
}

/** The target line: what's missing and when, or when it was reached. */
function targetLine(data) {
  if (!data.target) return null;
  if (data.target_reached_at) return `🎉 Nullszaldó ${data.target_reached_at}-kor`;
  const eta = data.target_eta ? ` · ≈${data.target_eta}` : "";
  return `Még ${money(data.target_missing)}${eta}`;
}

// What today is compared with: the same weekday, or on a holiday Saturdays
// (or earlier holidays), on a working Saturday ordinary weekdays.
function comparedWith(data) {
  const basis = (data.day || {}).basis || "weekday";
  if (basis === "saturdays") return "szombat";
  if (basis === "holidays") return "ünnep";
  if (basis === "weekdays") return "hétköznap";
  if (basis === "all") return "nap";
  return WEEKDAYS[new Date(data.date).getDay()];
}

function topProducts(data) {
  return data.top_products || (data.top_product ? [data.top_product] : []);
}

function summary(stack, data, reached) {
  const ink = reached ? CREAM : INK;
  const muted = reached ? CREAM : MUTED;
  text(stack, `MAI FORGALOM${trophies(data)}`, 11, reached ? CREAM : OLIVE, true);
  stack.addSpacer(2);
  text(stack, money(data.total), 24, ink, true);
  stack.addSpacer(3);
  if (!hasDiff(data)) {
    text(stack, "Még nincs mihez hasonlítani", 11, muted);
  } else {
    text(stack, `${arrow(data)} ${pct(data.diff_pct)} · ${data.compared_days} ${comparedWith(data)}`, 12,
      reached ? CREAM : data.diff_pct >= 0 ? UP : DOWN, true);
  }
  const line = targetLine(data);
  if (line) {
    stack.addSpacer(2);
    text(stack, line, 11, ink, true);
  }
}

function footer(stack, data, reached) {
  const updated = new Date(data.updated_at);
  const stale = (Date.now() - updated.getTime()) / 60000 > STALE_MINUTES;
  text(stack, `${stale ? "⚠︎ régi adat · " : ""}frissítve ${hhmm(updated)}`, 9,
    stale ? DOWN : reached ? CREAM : MUTED);
}

function smallWidget(data, reached) {
  const widget = new ListWidget();
  summary(widget, data, reached);
  widget.addSpacer();
  const best = topProducts(data)[0];
  if (best) {
    text(widget, `🥇 ${best.name} · ${best.count} db`, 11, reached ? CREAM : INK, true);
    widget.addSpacer(3);
  }
  footer(widget, data, reached);
  return widget;
}

function mediumWidget(data, reached) {
  const widget = new ListWidget();
  const row = widget.addStack();

  const left = row.addStack();
  left.layoutVertically();
  summary(left, data, reached);
  left.addSpacer();
  footer(left, data, reached);

  row.addSpacer(10);

  // Spacers above and below centre the chart and the list in the column.
  const right = row.addStack();
  right.layoutVertically();
  right.addSpacer();
  const chartSize = new Size(150, 72);
  right.addImage(hourBars(chartSize, data, reached)).imageSize = chartSize;
  const top = topProducts(data);
  if (top.length) {
    right.addSpacer(4);
    top.forEach((product, i) => {
      text(right, `${MEDALS[i]} ${product.name} · ${product.count}`, 10, reached ? CREAM : INK, i === 0);
    });
  }
  right.addSpacer();
  return widget;
}

function homeWidget(data, family) {
  const reached = Boolean(data.target_reached_at);
  const widget = family === "medium" ? mediumWidget(data, reached) : smallWidget(data, reached);
  widget.setPadding(12, 12, 12, 12);
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const size = family === "medium" ? new Size(338, 158) : new Size(158, 158);
  widget.backgroundImage = glass(size, data.target_progress || 0, reached);
  widget.url = DASHBOARD;
  return widget;
}

// ---- Lock Screen -------------------------------------------------------
// iOS tints Lock Screen widgets itself, so these use white at different
// strengths and let shape, not colour, carry the meaning.

/** A ring that closes at break-even, today's total inside, ▲/▼ below it. */
function gauge(data) {
  const S = 72, centre = S / 2, radius = S / 2 - 4;
  const ctx = canvas(new Size(S, S));
  const ring = (fraction, alpha) => {
    const steps = Math.max(2, Math.round(90 * fraction));
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const angle = -Math.PI / 2 + 2 * Math.PI * fraction * (i / steps);
      points.push(new Point(centre + radius * Math.cos(angle), centre + radius * Math.sin(angle)));
    }
    polyline(ctx, points, WHITE(alpha), 6);
  };
  ring(1, 0.25);
  const progress = data.target_progress || 0;
  if (progress > 0) ring(Math.min(progress, 1), 1);

  ctx.setTextAlignedCenter();
  ctx.setTextColor(WHITE());
  ctx.setFont(Font.boldSystemFont(19));
  ctx.drawTextInRect(thousands(data.total), new Rect(0, 19, S, 24));
  ctx.setFont(Font.boldSystemFont(11));
  const below = data.target_reached_at ? "✓ 0-pont" : hasDiff(data) ? `${arrow(data)} ${Math.abs(Math.round(data.diff_pct))}%` : "";
  ctx.drawTextInRect(below, new Rect(0, 42, S, 14));
  return ctx.getImage();
}

/** A thin progress bar to break-even. */
function bar(width, progress) {
  const size = new Size(width, 8);
  const ctx = canvas(size);
  const track = new Path();
  track.addRoundedRect(new Rect(0, 1, width, 6), 3, 3);
  ctx.addPath(track);
  ctx.setFillColor(WHITE(0.3));
  ctx.fillPath();
  const fill = new Path();
  fill.addRoundedRect(new Rect(0, 1, Math.max(6, width * Math.min(progress, 1)), 6), 3, 3);
  ctx.addPath(fill);
  ctx.setFillColor(WHITE());
  ctx.fillPath();
  return ctx.getImage();
}

function lockWidget(data, family) {
  const widget = new ListWidget();
  widget.url = DASHBOARD;
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const change = hasDiff(data) ? ` ${arrow(data)}${Math.abs(Math.round(data.diff_pct))}%` : "";

  if (family === "accessoryCircular") {
    widget.setPadding(0, 0, 0, 0);
    widget.addImage(gauge(data)).imageSize = new Size(72, 72);
  } else if (family === "accessoryInline") {
    widget.addText(`☕ ${money(data.total)}${change}`);
  } else {
    widget.setPadding(0, 2, 0, 2);
    const head = widget.addStack();
    text(head, `☕ ${money(data.total)}`, 15, WHITE(), true);
    head.addSpacer();
    text(head, `${change.trim()}${trophies(data)}`, 13, WHITE(), true);
    if (data.target) {
      widget.addSpacer(4);
      const row = widget.addStack();
      row.centerAlignContent();
      row.addImage(bar(118, data.target_progress || 0)).imageSize = new Size(118, 8);
      row.addSpacer(6);
      text(row, `${Math.round((data.target_progress || 0) * 100)}%`, 11, WHITE(), true);
      widget.addSpacer(3);
      text(widget, targetLine(data), 12, WHITE(0.85));
    }
  }
  return widget;
}

// ---- entry -------------------------------------------------------------

function messageWidget(title, detail) {
  const widget = new ListWidget();
  widget.backgroundColor = CREAM;
  widget.setPadding(14, 14, 14, 14);
  text(widget, "MAI FORGALOM", 11, OLIVE, true);
  widget.addSpacer(4);
  text(widget, title, 16, INK, true);
  if (detail) {
    widget.addSpacer(2);
    text(widget, detail, 11, MUTED);
  }
  return widget;
}

function build(data, error, family) {
  if (error) return messageWidget("Nem elérhető", error.message || String(error));
  const isToday = data.date === new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD
  if (!isToday) return messageWidget("Ma még nincs adat", `Utolsó nap (${data.date}): ${money(data.total)}`);
  return family.startsWith("accessory") ? lockWidget(data, family) : homeWidget(data, family);
}

// In the app (▶︎) there is no widget family; preview the medium one.
const family = config.widgetFamily || "medium";
let widget;
try {
  widget = build(await load(), null, family);
} catch (error) {
  widget = build(null, error, family);
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (family === "small") {
  await widget.presentSmall();
} else {
  await widget.presentMedium();
}
Script.complete();
