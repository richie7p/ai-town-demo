// The town journal: the latest sixty matching events, newest first.
//
// A row never changes once an event exists, so each row element is built once
// and reused. Stepping forward only inserts the new rows and drops the oldest,
// instead of re-parsing sixty rows and their portraits on every tick.
import { dayOf, slotOf } from '../config.js';
import { escapeHTML as esc } from './dom.js';
import { EVENT_LABELS, FAILURE_KINDS, JOURNAL_FILTERS } from './labels.js';
import { portrait } from './panels.js';

const VISIBLE_ROWS = 60;
/** Cached rows beyond this are trimmed to those currently shown. */
const CACHE_LIMIT = 480;
const EMPTY_HTML =
  '<div class="empty"><span class="empty-icon">☷</span>還沒有這一類片段。<br>開始生活，讓故事慢慢發生。</div>';
const twoDigits = n => String(n).padStart(2, '0');

export function createJournal(list) {
  let rows = new Map();
  let town = null;
  let shownKey = null;

  function rowFor(event, resident) {
    let row = rows.get(event.id);
    if (row) return row;
    const author = resident(event.participants[0]);
    const template = document.createElement('template');
    template.innerHTML =
      `<button class="event-row" data-event="${event.id}">` +
      `<span class="event-time">DAY ${twoDigits(dayOf(event.tick))}<small>時段 ${twoDigits(slotOf(event.tick))}</small></span>` +
      `<span class="event-portrait">${author ? portrait(author) : ''}</span>` +
      `<span class="event-body"><strong>${esc(author?.name ?? '小鎮')}</strong>` +
      `<span class="event-tag">${EVENT_LABELS[event.type] || esc(event.type)}</span><p>${esc(event.text)}</p></span>` +
      `<span class="event-arrow">↗</span></button>`;
    row = template.content.firstElementChild;
    rows.set(event.id, row);
    return row;
  }

  /** Place exactly `wanted` in order, moving existing nodes and removing the rest. */
  function arrange(wanted) {
    let cursor = list.firstElementChild;
    for (const row of wanted) {
      if (row === cursor) cursor = cursor.nextElementSibling;
      else list.insertBefore(row, cursor);
    }
    while (cursor) {
      const next = cursor.nextElementSibling;
      cursor.remove();
      cursor = next;
    }
  }

  /**
   * Show the journal for `filter` ("all", "life", "social", "equipment" or "failed").
   * `townId` identifies the run: names and portraits belong to one town, so a new
   * or imported town starts with fresh rows. Returns the counts for the footer.
   */
  function render({ pastEvents, filter, resident, townId }) {
    const kinds = Object.hasOwn(JOURNAL_FILTERS, filter) ? JOURNAL_FILTERS[filter] : FAILURE_KINDS;
    const matching = pastEvents.filter(e => filter === 'all' || kinds.includes(e.type));
    const visible = matching.slice(-VISIBLE_ROWS).reverse();
    if (town !== townId) {
      town = townId;
      rows = new Map();
      shownKey = null;
    }
    const key = visible.map(e => e.id).join();
    if (key !== shownKey) {
      if (!visible.length) list.innerHTML = EMPTY_HTML;
      else {
        if (!shownKey) list.replaceChildren();
        arrange(visible.map(event => rowFor(event, resident)));
        if (rows.size > CACHE_LIMIT) {
          const shown = new Set(visible.map(e => e.id));
          for (const id of rows.keys()) if (!shown.has(id)) rows.delete(id);
        }
      }
      shownKey = key;
    }
    return { total: matching.length, shown: visible.length };
  }

  return { render };
}
