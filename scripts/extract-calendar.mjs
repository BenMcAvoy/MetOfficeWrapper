import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { createRequire } from 'module';
const workerPath = new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).href;
GlobalWorkerOptions.workerSrc = workerPath;

const __dir = dirname(fileURLToPath(import.meta.url));
const pdfPath = join(__dir, '..', 'NoR-2026.pdf');

const data = new Uint8Array(readFileSync(pdfPath));
const pdf = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise;

const MONTHS = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

// Extract all text items with positions from every page
const allLines = [];
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const content = await page.getTextContent();
  // Group items by Y position (same line = within 3 units)
  const byY = new Map();
  for (const item of content.items) {
    if (!('str' in item)) continue;
    const y = Math.round(item.transform[5] / 3) * 3;
    if (!byY.has(y)) byY.set(y, []);
    byY.get(y).push({ x: item.transform[4], text: item.str.trim() });
  }
  // Sort lines top-to-bottom (higher Y = higher on page in PDF coords)
  const sortedYs = [...byY.keys()].sort((a, b) => b - a);
  for (const y of sortedYs) {
    const items = byY.get(y).sort((a, b) => a.x - b.x);
    const lineText = items.map(i => i.text).filter(Boolean).join(' ').trim();
    if (lineText) allLines.push({ page: p, y, text: lineText });
  }
}

// Now parse the calendar structure
// The table has columns: Date | Day | Warning Signal | Classes | Event
// Lines look like:
//   "1 Thu" -> date header
//   "10:55 C Cruisers New Year Day Pursuit" -> event line
//   "JANUARY" -> month header

const events = [];
let currentMonth = null;
let currentYear = 2026;
let currentDate = null;
let currentDay = null;

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DATE_DAY_RE = /^(\d{1,2})\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(.*)$/;

for (const { text } of allLines) {
  const upper = text.toUpperCase();

  // Month header
  const monthIdx = MONTHS.indexOf(upper.trim());
  if (monthIdx !== -1) {
    if (monthIdx === 0 && currentMonth !== null) currentYear = 2027;
    currentMonth = monthIdx;
    continue;
  }

  if (currentMonth === null) continue;

  // Skip page headers / footers
  if (upper.includes('PAGE |') || upper.includes('DATE') && upper.includes('WARNING') && upper.includes('CLASSES')) continue;
  if (upper.includes('NOTICE OF RACE')) continue;

  // Date + day line: "1 Thu" or "1 Thu 10:55 C Cruisers..."
  const dateMatch = text.match(DATE_DAY_RE);
  if (dateMatch) {
    currentDate = parseInt(dateMatch[1]);
    currentDay = dateMatch[2];
    const rest = dateMatch[3].trim();
    if (rest) {
      // inline event on same line as date
      parseEventLine(rest, currentMonth, currentDate, currentYear, events);
    }
    continue;
  }

  if (currentDate === null) continue;

  // Event line (starts with time or is a named event/all-day)
  parseEventLine(text, currentMonth, currentDate, currentYear, events);
}

function parseEventLine(text, month, date, year, out) {
  // Skip pure day-of-week lines, page markers, blank
  if (!text || text.length < 3) return;
  if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/.test(text)) return;
  if (/^Page\s*\|/i.test(text)) return;
  if (/^(Date|Day|Warning|Classes|Event)\s*$/i.test(text)) return;

  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

  // Does it start with a time?
  const timeMatch = text.match(/^(\d{1,2}:\d{2})\s*(.*)/);
  if (timeMatch) {
    const time = timeMatch[1];
    const rest = timeMatch[2].trim();
    // Classes are in the form: single letters/numbers and comma-separated combos, optionally
    // with parenthesized sub-classes like "1,(1a, 1b, & 2),3,R,4".
    // Event names start with a Capital word (e.g. "Cruiser", "Laser", "Dinghy", "Youth"...).
    // Strategy: find the first token that looks like a capitalised English word (Title Case, length > 2,
    // not purely digits/uppercase single chars).
    let classes = null;
    let name = rest;
    const tokens = rest.split(/\s+/);
    let splitAt = -1;
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      // A proper event name word: starts with uppercase, has lowercase letters, length > 2
      if (/^[A-Z][a-z]{2,}/.test(t)) { splitAt = i; break; }
    }
    if (splitAt > 0) {
      classes = tokens.slice(0, splitAt).join(' ').replace(/[,\s]+$/, '').trim() || null;
      name = tokens.slice(splitAt).join(' ').trim();
    } else if (splitAt === 0) {
      name = rest;
    }
    if (name) out.push({ date: dateStr, time, name, classes: classes || undefined });
  } else {
    // All-day / named event with no time
    if (/^\d+$/.test(text)) return;
    if (/^\(.*\)$/.test(text.trim())) return; // parenthetical qualifier like "(D First Race Only)"
    if (/^\*/.test(text)) return; // footnote markers
    out.push({ date: dateStr, time: null, name: text, classes: undefined });
  }
}

// Deduplicate
const seen = new Set();
const deduped = events.filter(e => {
  const key = `${e.date}|${e.time}|${e.name}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

// Output as TypeScript
const lines = deduped.map(e => {
  const classes = e.classes ? `, classes: '${e.classes.replace(/'/g, "\\'")}'` : '';
  const time = e.time ? `'${e.time}'` : 'null';
  return `  { date: '${e.date}', time: ${time}, name: '${e.name.replace(/'/g, "\\'")}' ${classes}},`;
});

const output = `export interface RaceEvent {
  date: string;
  time: string | null;
  name: string;
  classes?: string;
}

export const RACE_CALENDAR: RaceEvent[] = [
${lines.join('\n')}
];

export function getEventsForDay(date: Date): RaceEvent[] {
  const key = \`\${date.getFullYear()}-\${String(date.getMonth() + 1).padStart(2, '0')}-\${String(date.getDate()).padStart(2, '0')}\`;
  return RACE_CALENDAR.filter(e => e.date === key);
}
`;

const outPath = join(__dir, '..', 'src', 'lib', 'calendar.ts');
writeFileSync(outPath, output);
console.log(`Written ${deduped.length} events to ${outPath}`);

// Also print a sample for verification
console.log('\nSample events:');
deduped.slice(0, 20).forEach(e => console.log(JSON.stringify(e)));
