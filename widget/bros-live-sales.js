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
//   - ▲/▼ against earlier weeks' same weekday up to the same minute
//   - how much is still missing, and at today's pace roughly when it'll be in
//   - 🏆 when today beats the best day for this weekday (🏆🏆: best day ever)
//   - medium size: today's takings per hour against the usual pattern, and
//     today's best seller
// Figures are gross (VAT included), as the till shows them.

const URL = "https://broscafe.hu/api/live-sales";
const KEY = "PASTE-THE-KEY-HERE";

const OLIVE = new Color("#66734A");
const CREAM = new Color("#F5F0E6");
const INK = new Color("#2F3324");
const MUTED = new Color("#4E5838");
const WATER_BACK = new Color("#C9D1AE", 0.55);
const WATER_FRONT = new Color("#AEBB86", 0.6);
const UP = new Color("#2E7D32");
const DOWN = new Color("#C62828");
const WEEKDAYS = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"];
// Older than this means the server stopped updating.
const STALE_MINUTES = 45;

const money = (n) => `${Math.round(n).toLocaleString("hu-HU")} Ft`;
const hhmm = (d) => d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
const pct = (n) => `${n >= 0 ? "+" : ""}${n.toLocaleString("hu-HU", { maximumFractionDigits: 1 })}%`;

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

// ---- drawing -----------------------------------------------------------

/** The glass: water up to `level` (0–1) with a two-layer wavy surface. */
function glass(size, level, reached) {
  const ctx = new DrawContext();
  ctx.size = size;
  ctx.opaque = true;
  ctx.respectScreenScale = true;
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

/** Today's takings per hour as bars, the usual for this weekday as dots.
 *  On the olive "reached" background the bars turn cream to stay visible. */
function chart(size, data, reached) {
  const bar = reached ? new Color("#F5F0E6", 0.9) : OLIVE;
  const dot = reached ? new Color("#1E2216") : INK;
  const label = reached ? CREAM : MUTED;
  const ctx = new DrawContext();
  ctx.size = size;
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const hours = [...Object.keys(data.hours), ...Object.keys(data.average_hours || {})].map(Number);
  if (!hours.length) return ctx.getImage();
  const from = Math.min(...hours), to = Math.max(...hours);
  const values = [...Object.values(data.hours), ...Object.values(data.average_hours || {})];
  const max = Math.max(...values, 1);
  const slot = size.width / (to - from + 1);
  const base = size.height - 12;
  const top = 4;
  for (let h = from; h <= to; h++) {
    const x = (h - from) * slot;
    const today = data.hours[h] || 0;
    if (today) {
      const height = ((base - top) * today) / max;
      ctx.setFillColor(bar);
      ctx.fillRect(new Rect(x + slot * 0.18, base - height, slot * 0.64, height));
    }
    const usual = (data.average_hours || {})[h];
    if (usual) {
      const y = base - ((base - top) * usual) / max;
      ctx.setFillColor(dot);
      ctx.fillEllipse(new Rect(x + slot / 2 - 2, y - 2, 4, 4));
    }
    if ((h - from) % 3 === 0) {
      ctx.setFont(Font.systemFont(8));
      ctx.setTextColor(label);
      ctx.drawTextInRect(String(h), new Rect(x, base + 1, slot * 2, 10));
    }
  }
  return ctx.getImage();
}

/** Lock Screen gauge: a ring that closes as the day reaches break-even. */
function gauge(progress) {
  const size = new Size(60, 60);
  const ctx = new DrawContext();
  ctx.size = size;
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const ring = (fraction, alpha) => {
    const path = new Path();
    const steps = Math.max(2, Math.round(60 * fraction));
    for (let i = 0; i <= steps; i++) {
      const angle = -Math.PI / 2 + 2 * Math.PI * fraction * (i / steps);
      const point = new Point(30 + 25 * Math.cos(angle), 30 + 25 * Math.sin(angle));
      i === 0 ? path.move(point) : path.addLine(point);
    }
    ctx.addPath(path);
    ctx.setStrokeColor(new Color("#FFFFFF", alpha));
    ctx.setLineWidth(6);
    ctx.strokePath();
  };
  ring(1, 0.25);
  if (progress > 0) ring(Math.min(progress, 1), 1);
  ctx.setFont(Font.boldSystemFont(14));
  ctx.setTextColor(Color.white());
  ctx.setTextAlignedCenter();
  ctx.drawTextInRect(progress >= 1 ? "✓" : `${Math.round(progress * 100)}%`, new Rect(0, 21, 60, 20));
  return ctx.getImage();
}

// ---- layout ------------------------------------------------------------

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

function summary(stack, data, reached) {
  const ink = reached ? CREAM : INK;
  const muted = reached ? CREAM : MUTED;
  text(stack, `MAI FORGALOM${trophies(data)}`, 11, reached ? CREAM : OLIVE, true);
  stack.addSpacer(2);
  text(stack, money(data.total), 24, ink, true);
  stack.addSpacer(3);
  if (data.diff_pct === null || data.diff_pct === undefined) {
    text(stack, "Még nincs mihez hasonlítani", 11, muted);
  } else {
    const up = data.diff_pct >= 0;
    const weekday = WEEKDAYS[new Date(data.date).getDay()];
    text(stack, `${up ? "▲" : "▼"} ${pct(data.diff_pct)} · ${data.compared_days} ${weekday}`, 12,
      reached ? CREAM : up ? UP : DOWN, true);
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

function homeWidget(data, family) {
  const widget = new ListWidget();
  widget.setPadding(12, 12, 12, 12);
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  const reached = Boolean(data.target_reached_at);
  const size = family === "medium" ? new Size(338, 158) : new Size(158, 158);
  widget.backgroundImage = glass(size, data.target_progress || 0, reached);

  if (family !== "medium") {
    summary(widget, data, reached);
    widget.addSpacer();
    footer(widget, data, reached);
    return widget;
  }

  const row = widget.addStack();
  const left = row.addStack();
  left.layoutVertically();
  summary(left, data, reached);
  left.addSpacer();
  footer(left, data, reached);
  row.addSpacer(10);
  const right = row.addStack();
  right.layoutVertically();
  right.addImage(chart(new Size(150, 96), data, reached)).imageSize = new Size(150, 96);
  right.addSpacer(4);
  if (data.top_product) {
    text(right, `Top: ${data.top_product.name} · ${data.top_product.count} db`, 10, reached ? CREAM : INK, true);
  }
  return widget;
}

function lockWidget(data, family) {
  const widget = new ListWidget();
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const arrow = data.diff_pct === null || data.diff_pct === undefined ? "" : data.diff_pct >= 0 ? " ▲" : " ▼";
  const change = arrow ? `${arrow}${Math.abs(Math.round(data.diff_pct))}%` : "";
  if (family === "accessoryCircular") {
    widget.addImage(gauge(data.target_progress || 0));
  } else if (family === "accessoryInline") {
    widget.addText(`☕ ${money(data.total)}${change}`);
  } else {
    text(widget, `☕ ${money(data.total)}${change}${trophies(data)}`, 14, Color.white(), true);
    const line = targetLine(data);
    if (line) text(widget, line, 12, Color.white());
  }
  return widget;
}

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
