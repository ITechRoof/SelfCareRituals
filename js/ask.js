import { state, save, logsOn } from './store.js';
import { PLAN_TEXT, routineLabel, suggestRoutine } from './plan.js';
import { getConditions, describeConditions } from './weather.js';
import { esc, miniMarkdown, dateKey, dayKey, skinDate, addDays, weekStart, fmtDate, DAY_LONG } from './util.js';

const SUGGESTIONS = [
  'Why do I wait between some steps?',
  'My skin is stinging today. What should I change?',
  'Can I skip tonight’s routine if I’m tired?',
  'How long until I see results?',
];

let busy = false;
let lastError = '';

async function systemPrompt() {
  const now = new Date();
  const day = skinDate(now);
  const c = await getConditions();
  const s = state.settings;
  const recent = [...Array(14)]
    .map((_, i) => {
      const d = addDays(day, -i);
      const logs = logsOn(dateKey(d));
      return `${fmtDate(d)}: ${logs.length ? logs.map((l) => routineLabel(l.routine, d, s) + (l.skipped?.length ? ` (skipped ${l.skipped.length})` : '') + (l.swaps?.length ? ' (used the gentler alternative)' : '')).join(', ') : 'nothing logged'}`;
    })
    .join('\n');
  const notes = state.notes[dateKey(weekStart(day))] || '';
  const w = c.weather;

  return `You are the assistant inside the user's personal skincare routine app. Help them follow and understand their own plan below, troubleshoot it, and stay motivated.

${PLAN_TEXT}

TODAY
${DAY_LONG[day.getDay()]} (local time ${now.toLocaleString()}). Gym days: ${s.gymDays.map((d) => DAY_LONG[d]).join(', ') || 'none set'}.
Season mode: ${describeConditions(c)}${w ? `. Now ${w.temp}°C, humidity ${w.humidity}%, today ${w.min}–${w.max}°C, UV max ${w.uv}` : ''}.
Routine most likely due now: ${routineLabel(suggestRoutine(now, s, logsOn(dayKey())), day, s)}.

LAST 14 DAYS
${recent}

THIS WEEK'S SKIN NOTES
${notes || '(none)'}

GUIDANCE
- Answer from the plan first. If something isn't in the plan, say so and give general, cautious skincare information.
- Keep answers short and practical: they're reading on a phone, often mid-routine.
- Respect the plan's rules about which products must not be combined on the same night or used before exercise. Never suggest breaking them.
- For persistent stinging, burning, swelling, rashes, eye irritation or anything worrying, suggest pausing actives and seeing a pharmacist, GP or dermatologist. You are not a doctor.`;
}

export function renderAsk(el) {
  const hasKey = !!state.settings.apiKey;
  el.innerHTML = `
    <section class="hero tight">
      <h1 class="display">Ask</h1>
      <p class="muted">Questions about your routine, products or progress. It knows your plan, today’s weather and what you’ve logged.</p>
      ${state.chat.length ? '<button class="link-btn clear-chat">Clear conversation</button>' : ''}
    </section>
    <div class="chat" aria-live="polite"></div>
    ${
      hasKey
        ? `<form class="composer">
            <textarea rows="1" placeholder="Ask about your routine" aria-label="Message"></textarea>
            <button class="primary" type="submit">Send</button>
          </form>`
        : `<div class="empty">Add your Anthropic API key in Settings to turn on chat. It stays on this phone.<br><button class="ghost" data-go-settings>Open settings</button></div>`
    }`;

  const chat = el.querySelector('.chat');
  const paint = () => {
    chat.innerHTML = state.chat.length
      ? state.chat
          .map((m) => `<div class="msg ${m.role}">${m.role === 'assistant' ? miniMarkdown(m.content) : esc(m.content)}</div>`)
          .join('') + (busy ? '<div class="msg assistant typing"><span></span><span></span><span></span></div>' : '')
      : hasKey
        ? `<div class="suggest">${SUGGESTIONS.map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`
        : '';
    if (lastError) {
      chat.insertAdjacentHTML('beforeend', `<p class="chat-error">${esc(lastError)}</p>`);
      lastError = '';
    }
    chat.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => send(b.dataset.q)));
    chat.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  };
  paint();

  el.querySelector('[data-go-settings]')?.addEventListener('click', () => (location.hash = 'settings'));
  el.querySelector('.clear-chat')?.addEventListener('click', () => {
    if (!confirm('Clear this conversation?')) return;
    state.chat = [];
    save();
    renderAsk(el);
  });

  const form = el.querySelector('.composer');
  const input = form?.querySelector('textarea');
  input?.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  });
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q || busy) return;
    input.value = '';
    input.style.height = 'auto';
    send(q);
  });

  async function send(q) {
    state.chat.push({ role: 'user', content: q });
    save();
    busy = true;
    paint();
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': state.settings.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: state.settings.model,
          max_tokens: 1024,
          system: await systemPrompt(),
          messages: state.chat.slice(-20).map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`);
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      state.chat.push({ role: 'assistant', content: text || 'No answer came back. Try asking again.' });
    } catch (err) {
      state.chat.pop(); // don't keep a question that got no answer
      lastError = `Couldn’t reach Claude: ${err.message}. Check your API key and model in Settings, and that you’re online.`;
      if (input) input.value = q;
    }
    busy = false;
    save();
    paint();
    if (!el.querySelector('.clear-chat') && state.chat.length) renderAsk(el);
  }
}
