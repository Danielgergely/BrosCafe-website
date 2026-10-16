// Bros Cafe — today's takings, as an iPhone home-screen widget.
//
// Runs in the free Scriptable app (https://scriptable.app). Setup:
//   1. Install Scriptable, tap +, paste this whole file, name it "Bros forgalom".
//   2. Replace PASTE-THE-KEY-HERE below with the LIVE_SALES_KEY from Coolify.
//   3. Home screen: long-press → + → Scriptable → small or medium widget →
//      long-press it → Edit Widget → Script: "Bros forgalom".
//
// Figures are gross (VAT included), as the till shows them. The arrow compares
// today so far with earlier weeks' same weekday up to the same minute.

const URL = "https://broscafe.hu/api/live-sales";
const KEY = "PASTE-THE-KEY-HERE";

const OLIVE = new Color("#66734A");
const CREAM = new Color("#F5F0E6");
const INK = new Color("#2F3324");
const MUTED = new Color("#66734A", 0.7);
const UP = new Color("#2E7D32");
const DOWN = new Color("#C62828");
const WEEKDAYS = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"];
// Older than this during the day means the server stopped updating.
const STALE_MINUTES = 45;

const money = (n) => `${Math.round(n).toLocaleString("hu-HU")} Ft`;
const hhmm = (d) => d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });

async function load() {
  const request = new Request(URL);
  request.headers = { Authorization: `Bearer ${KEY}` };
  request.timeoutInterval = 15;
  const data = await request.loadJSON();
  if (request.response.statusCode !== 200) {
    throw new Error(request.response.statusCode === 404 ? "Hibás kulcs" : "Még nincs adat");
  }
  return data;
}

function text(stack, value, size, color, weight = "regular") {
  const t = stack.addText(value);
  t.font = weight === "bold" ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}

function build(data, error) {
  const widget = new ListWidget();
  widget.backgroundColor = CREAM;
  widget.setPadding(14, 14, 14, 14);
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);

  text(widget, "MAI FORGALOM", 11, OLIVE, "bold");
  widget.addSpacer(4);

  if (error) {
    text(widget, "Nem elérhető", 18, INK, "bold");
    widget.addSpacer(2);
    text(widget, error.message || String(error), 11, MUTED);
    return widget;
  }

  const today = new Date();
  const isToday = data.date === today.toLocaleDateString("sv-SE"); // YYYY-MM-DD
  if (!isToday) {
    text(widget, "Ma még nincs adat", 16, INK, "bold");
    widget.addSpacer(2);
    text(widget, `Utolsó nap (${data.date}): ${money(data.total)}`, 11, MUTED);
    return widget;
  }

  text(widget, money(data.total), 26, INK, "bold");
  widget.addSpacer(4);

  if (data.diff_pct === null || data.diff_pct === undefined) {
    text(widget, "Még nincs mihez hasonlítani", 11, MUTED);
  } else {
    const up = data.diff_pct >= 0;
    const row = widget.addStack();
    row.centerAlignContent();
    text(row, `${up ? "▲" : "▼"} ${up ? "+" : ""}${data.diff_pct.toLocaleString("hu-HU")}%`, 15, up ? UP : DOWN, "bold");
    row.addSpacer(6);
    const weekday = WEEKDAYS[new Date(data.date).getDay()];
    text(row, `vs. ${data.compared_days} korábbi ${weekday}`, 11, MUTED);
    widget.addSpacer(2);
    text(widget, `Átlag eddig: ${money(data.average_so_far)}`, 11, MUTED);
  }

  widget.addSpacer();
  const updated = new Date(data.updated_at);
  const stale = (Date.now() - updated.getTime()) / 60000 > STALE_MINUTES;
  text(widget, `${stale ? "⚠︎ régi adat · " : ""}frissítve ${hhmm(updated)}`, 10, stale ? DOWN : MUTED);
  return widget;
}

let widget;
try {
  widget = build(await load());
} catch (error) {
  widget = build(null, error);
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}
Script.complete();
