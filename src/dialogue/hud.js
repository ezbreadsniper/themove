/**
 * Dialogue HUD in plain DOM, styled like the rest of the project (Courier, hard 1px shadows,
 * dark translucent panels): letterbox bars, subtitles with speaker colour and a typewriter reveal,
 * a choice list (number keys / W-S + E / mouse) with tone tags, skill-check odds and greyed locked
 * options with the reason, an optional choice timer, a scrollable history log (H) and floating barks.
 */
export const TONE_COLORS = {
  friendly: '#8fe08f', neutral: '#c8c8d8', rude: '#ff7a6a', aggressive: '#ff5a4a', curious: '#8fd3ff', flirty: '#ff9ad5',
  apologetic: '#d8c48f', intimidate: '#ffa04a', bribe: '#e8d24a', defuse: '#a0e0c0', calm: '#a0e0c0', firm: '#d0b0ff', charming: '#ffb0e0',
};

const CSS = `
.dlg-root{position:absolute;inset:0;pointer-events:none;font-family:"Courier New",monospace;color:#e8e8f0;text-shadow:1px 1px 0 #000;z-index:20;overflow:hidden}
.dlg-bar{position:absolute;left:0;right:0;height:0;background:#000;transition:height .45s ease}
.dlg-bar.top{top:0}.dlg-bar.bottom{bottom:0}
.dlg-root.on .dlg-bar{height:10.5vh}
.dlg-sub{position:absolute;left:50%;bottom:12.5vh;transform:translateX(-50%);max-width:min(760px,86vw);text-align:center;font-size:17px;line-height:1.35;padding:6px 12px;background:#0009;opacity:0}
.dlg-sub.show{opacity:1}
.dlg-name{font-weight:bold;margin-right:.6em;letter-spacing:.04em}
.dlg-choices{position:absolute;left:50%;bottom:12.5vh;transform:translateX(-50%);min-width:min(560px,90vw);max-width:min(760px,92vw);background:#05051ccc;border:1px solid #3a3a7a;padding:6px 0;pointer-events:auto;display:none}
.dlg-choices.show{display:block}
.dlg-prompt{padding:2px 14px 6px;color:#9a9ac8;font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.dlg-opt{display:flex;gap:10px;align-items:baseline;padding:4px 14px;font-size:15px;cursor:pointer;white-space:normal}
.dlg-opt .n{color:#7a7aa8;min-width:1.4em}
.dlg-opt .tone{font-size:11px;letter-spacing:.08em;text-transform:uppercase;min-width:7.5em}
.dlg-opt .chk{margin-left:auto;font-size:11px;color:#ffd34a;white-space:nowrap}
.dlg-opt.sel{background:#2a2a8a}
.dlg-opt.locked{color:#6a6a7a;cursor:not-allowed}
.dlg-opt.locked .tone,.dlg-opt.locked .chk{color:#5a5a6a !important}
.dlg-opt .why{margin-left:auto;font-size:11px;color:#a06a6a;white-space:nowrap}
.dlg-timer{height:3px;background:#ffd34a;margin:6px 14px 0;transform-origin:left}
.dlg-hint{position:absolute;right:14px;bottom:3vh;font-size:11px;color:#8a8aa8;opacity:0;transition:opacity .3s}
.dlg-root.on .dlg-hint{opacity:1}
.dlg-log{position:absolute;right:16px;top:12vh;width:min(420px,44vw);max-height:60vh;overflow:auto;background:#05051ce6;border:1px solid #3a3a7a;padding:8px 12px;font-size:13px;display:none;pointer-events:auto}
.dlg-log.show{display:block}
.dlg-log .e{margin:3px 0}.dlg-log .chk{color:#ffd34a}.dlg-log .end{color:#7a7aa8}
.dlg-bark{position:absolute;transform:translate(-50%,-100%);font-size:13px;padding:2px 6px;background:#000a;white-space:nowrap;max-width:320px;text-overflow:ellipsis;overflow:hidden}
.dlg-bark b{font-weight:bold;margin-right:.4em}
`;

function el(tag, cls, parent, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export class DialogueHud {
  constructor(container = document.body) {
    if (!document.getElementById('dlg-style')) {
      const style = el('style', null, document.head);
      style.id = 'dlg-style';
      style.textContent = CSS;
    }
    this.root = el('div', 'dlg-root', container);
    el('div', 'dlg-bar top', this.root);
    el('div', 'dlg-bar bottom', this.root);
    this.barks = el('div', null, this.root);
    this.sub = el('div', 'dlg-sub', this.root);
    this.choices = el('div', 'dlg-choices', this.root);
    this.log = el('div', 'dlg-log', this.root);
    this.hint = el('div', 'dlg-hint', this.root, '[Space/E] next   [1-9] choose   [W/S] select   [H] log   [Esc] leave');
    this.reveal = null;
    this.selected = 0;
    this.onPick = null;
    this.barkEls = new Map();
  }

  setLetterbox(on) {
    this.root.classList.toggle('on', on);
  }

  /** Subtitle with typewriter reveal (chars / s). */
  showLine({ name, color = '#fff', text, emotion }, { cps = 55 } = {}) {
    this.hideChoices();
    this.sub.innerHTML = '';
    const n = el('span', 'dlg-name', this.sub, name);
    this.sub.dataset.emotion = emotion ?? '';
    n.style.color = color;
    this.textEl = el('span', null, this.sub, '');
    this.reveal = { text, shown: 0, cps };
    this.sub.classList.add('show');
  }

  /** True while the typewriter is still revealing. */
  get revealing() {
    return !!this.reveal && this.reveal.shown < this.reveal.text.length;
  }

  finishReveal() {
    if (this.reveal) this.reveal.shown = this.reveal.text.length;
    this.tick(0);
  }

  hideLine() {
    this.sub.classList.remove('show');
    this.reveal = null;
  }

  showChoices(options, { prompt = null, onPick = null, selected = 0 } = {}) {
    this.hideLine();
    this.options = options;
    this.onPick = onPick;
    this.choices.innerHTML = '';
    if (prompt) el('div', 'dlg-prompt', this.choices, prompt);
    this.optEls = options.map((o, i) => {
      const row = el('div', `dlg-opt${o.locked ? ' locked' : ''}`, this.choices);
      el('span', 'n', row, `${i + 1}.`);
      const tone = el('span', 'tone', row, o.tone ? `[${o.tone}]` : '');
      tone.style.color = TONE_COLORS[o.tone] ?? '#c8c8d8';
      el('span', 't', row, o.text);
      if (o.locked) el('span', 'why', row, `[${o.reason}]`);
      else if (o.check) el('span', 'chk', row, `[${o.check.skill} ${o.check.dc} · ${Math.round(o.check.chance * 100)}%]`);
      row.addEventListener('mouseenter', () => this.select(i));
      row.addEventListener('click', () => !o.locked && this.onPick?.(i));
      return row;
    });
    this.timerEl = el('div', 'dlg-timer', this.choices);
    this.timerEl.style.display = 'none';
    this.choices.classList.add('show');
    this.select(selected);
  }

  select(i) {
    if (!this.optEls?.length) return;
    this.selected = (i + this.optEls.length) % this.optEls.length;
    this.optEls.forEach((e, j) => e.classList.toggle('sel', j === this.selected));
  }

  setTimer(frac) {
    if (!this.timerEl) return;
    this.timerEl.style.display = frac === null ? 'none' : 'block';
    if (frac !== null) this.timerEl.style.transform = `scaleX(${Math.max(0, frac)})`;
  }

  hideChoices() {
    this.choices.classList.remove('show');
    this.optEls = null;
  }

  addLog(entry, speakers = {}) {
    const e = el('div', `e${entry.kind === 'check' ? ' chk' : entry.kind === 'end' ? ' end' : ''}`, this.log);
    if (entry.kind === 'check') e.textContent = `[${entry.skill} ${entry.dc}: ${entry.success ? 'success' : 'failure'}]`;
    else if (entry.kind === 'end') e.textContent = '— end —';
    else {
      const s = speakers[entry.speaker] ?? { name: entry.speaker, color: '#ccc' };
      const n = el('b', null, e, `${s.name}: `);
      n.style.color = s.color;
      el('span', null, e, entry.text);
    }
    this.log.scrollTop = this.log.scrollHeight;
  }

  toggleLog(on = !this.log.classList.contains('show')) {
    this.log.classList.toggle('show', on);
  }

  /** Floating barks: list of { id, name, text, color, x, y (px), visible }. */
  showBarks(list) {
    const seen = new Set();
    for (const b of list) {
      seen.add(b.id);
      let e = this.barkEls.get(b.id);
      if (!e) {
        e = el('div', 'dlg-bark', this.barks);
        this.barkEls.set(b.id, e);
      }
      if (e.dataset.text !== b.text) {
        e.innerHTML = '';
        const n = el('b', null, e, b.name);
        n.style.color = b.color ?? '#8fd3ff';
        el('span', null, e, b.text);
        e.dataset.text = b.text;
      }
      e.style.display = b.visible === false ? 'none' : 'block';
      e.style.left = `${b.x}px`;
      e.style.top = `${b.y}px`;
    }
    for (const [id, e] of this.barkEls) {
      if (seen.has(id)) continue;
      e.remove();
      this.barkEls.delete(id);
    }
  }

  tick() {
    if (!this.reveal || !this.textEl) return;
    this.textEl.textContent = this.reveal.text.slice(0, Math.floor(this.reveal.shown));
  }

  update(dt) {
    if (this.reveal && this.reveal.shown < this.reveal.text.length) {
      this.reveal.shown = Math.min(this.reveal.text.length, this.reveal.shown + dt * this.reveal.cps);
      this.tick();
    }
  }

  clear() {
    this.hideLine();
    this.hideChoices();
    this.setLetterbox(false);
  }
}
