// Sidebar CSS injected into Shadow DOM — isolated from host app styles
const LUMEN_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:host { all: initial; }

.panel {
  width: 40px;
  min-height: 56px;
  background: #fff;
  border-radius: 12px 0 0 12px;
  box-shadow: -2px 0 20px rgba(0,0,0,0.14);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.22s cubic-bezier(.4,0,.2,1);
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 13px;
  color: #111;
  max-height: 90vh;
}

.panel.expanded { width: 320px; }

@media (prefers-color-scheme: dark) {
  .panel { background: #1a1a1a; color: #f0f0f0; box-shadow: -2px 0 20px rgba(0,0,0,0.4); }
  .card { background: #252525; border-color: #333; }
  .mode-btn { background: #2a2a2a; color: #aaa; }
  .mode-btn.active { background: #BA7517; color: #fff; }
  .analyze-btn { background: #BA7517; }
  .response-item { border-color: #333; }
  .copy-btn { background: #2a2a2a; color: #ccc; }
  .use-btn { background: #BA7517; }
}

/* Collapsed pill — just the toggle button */
.toggle-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 40px;
  min-height: 56px;
  cursor: pointer;
  padding: 10px 0;
  gap: 5px;
  flex-shrink: 0;
  user-select: none;
}

.toggle-btn .lumen-logo { font-size: 16px; }
.toggle-btn .lumen-wordmark {
  writing-mode: vertical-rl;
  font-size: 10px;
  font-weight: 700;
  color: #BA7517;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.panel.expanded .toggle-btn { display: none; }

/* Expanded panel content */
.panel-inner {
  display: none;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-width: 320px;
}

.panel.expanded .panel-inner { display: flex; }

/* Header */
.panel-header {
  padding: 12px 14px 10px;
  border-bottom: 1px solid #eee;
  flex-shrink: 0;
}

@media (prefers-color-scheme: dark) {
  .panel-header { border-bottom-color: #333; }
}

.header-top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.header-top .lumen-logo { font-size: 15px; }
.header-top .lumen-wordmark { font-size: 13px; font-weight: 700; color: #BA7517; flex: 1; }

.live-indicator {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
}

.live-dot {
  color: #ef4444;
  font-size: 10px;
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

.live-label { font-size: 10px; font-weight: 800; color: #ef4444; letter-spacing: 0.1em; }
.timer { font-size: 11px; color: #737373; font-variant-numeric: tabular-nums; }

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #aaa;
  font-size: 18px;
  line-height: 1;
  padding: 0 2px;
  display: flex;
  align-items: center;
}

.close-btn:hover { color: #555; }

/* Mode toggle */
.mode-row {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.mode-btn {
  flex: 1;
  padding: 5px 8px;
  border: none;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: #f3f4f6;
  color: #6b7280;
  transition: background 0.15s, color 0.15s;
  font-family: inherit;
}

.mode-btn.active { background: #BA7517; color: #fff; }

/* Profile pill */
.profile-pill {
  display: none;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: #FAEEDA;
  border-radius: 20px;
  font-size: 11px;
  color: #854F0B;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-pill.visible { display: flex; }

.profile-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #BA7517;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* Body */
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.panel-body::-webkit-scrollbar { width: 4px; }
.panel-body::-webkit-scrollbar-thumb { background: #ddd; border-radius: 2px; }

/* Status */
.status {
  font-size: 12px;
  color: #6b7280;
  text-align: center;
  padding: 6px 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #e5e7eb;
  border-top-color: #BA7517;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Error */
.error-box {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  color: #991b1b;
  line-height: 1.5;
}

/* Analyze button */
.analyze-btn {
  width: 100%;
  padding: 10px;
  background: #BA7517;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s;
}

.analyze-btn:hover { background: #854F0B; }
.analyze-btn:disabled { opacity: 0.5; cursor: default; }

/* Cards */
.card {
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
}

.card.highlight {
  background: #FAEEDA;
  border-color: #EF9F27;
}

.card-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: #6b7280;
  margin-bottom: 6px;
}

.card-text {
  font-size: 13px;
  line-height: 1.6;
  color: #111;
}

@media (prefers-color-scheme: dark) {
  .card-text { color: #e5e7eb; }
  .card.highlight { background: rgba(186,117,23,0.18); border-color: #BA7517; }
}

/* Responses */
.response-item {
  border-top: 1px solid #e5e7eb;
  padding-top: 10px;
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.response-item:first-child { border-top: none; padding-top: 0; margin-top: 0; }

.response-tag {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 700;
  width: fit-content;
}

.response-tag.direct   { background: #DBEAFE; color: #1E40AF; }
.response-tag.warm     { background: #D1FAE5; color: #065F46; }
.response-tag.boundary { background: #FEF3C7; color: #92400E; }

.response-text {
  font-size: 12px;
  line-height: 1.6;
  color: #374151;
}

@media (prefers-color-scheme: dark) {
  .response-text { color: #d1d5db; }
  .response-item { border-top-color: #333; }
}

.response-actions {
  display: flex;
  gap: 6px;
}

.copy-btn, .use-btn {
  flex: 1;
  padding: 5px 8px;
  border: none;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.15s;
}

.copy-btn { background: #f3f4f6; color: #374151; }
.copy-btn:hover { background: #e5e7eb; }
.use-btn { background: #BA7517; color: #fff; }
.use-btn:hover { background: #854F0B; }

/* Empty state */
.empty-state {
  text-align: center;
  padding: 16px 0;
  color: #9ca3af;
  font-size: 12px;
  line-height: 1.6;
}
`;

const MESSAGE_TEMPLATE = `
<div class="toggle-btn" role="button" aria-label="Open Beckett">
  <span class="lumen-logo">☀</span>
  <span class="lumen-wordmark">Beckett</span>
</div>
<div class="panel-inner">
  <div class="panel-header">
    <div class="header-top">
      <span class="lumen-logo">☀</span>
      <span class="lumen-wordmark">Beckett</span>
      <button class="close-btn" title="Collapse" aria-label="Collapse Beckett">×</button>
    </div>
    <div class="mode-row">
      <button class="mode-btn active" data-mode="personal">Personal</button>
      <button class="mode-btn" data-mode="business">Business</button>
    </div>
    <div class="profile-pill" aria-label="LinkedIn profile"></div>
  </div>
  <div class="panel-body">
    <div class="status" hidden>
      <div class="spinner"></div>
      <span class="status-text">Analyzing…</span>
    </div>
    <div class="error-box" hidden></div>
    <div class="empty-state">Open an email or message,<br>then click Analyze.</div>
    <button class="analyze-btn" hidden>Analyze message</button>
    <div class="results" hidden>
      <div class="card">
        <div class="card-label">What's happening</div>
        <p class="result-intent card-text"></p>
      </div>
      <div class="card">
        <div class="card-label">Tone</div>
        <p class="result-tone card-text"></p>
      </div>
      <div class="card">
        <div class="card-label">What they want</div>
        <p class="result-want card-text"></p>
      </div>
      <div class="card">
        <div class="card-label">Suggested responses</div>
        <div class="responses"></div>
      </div>
    </div>
  </div>
</div>
`;

const MEETING_TEMPLATE = `
<div class="toggle-btn" role="button" aria-label="Open Beckett">
  <span class="lumen-logo">☀</span>
  <span class="lumen-wordmark">Beckett</span>
</div>
<div class="panel-inner">
  <div class="panel-header">
    <div class="header-top">
      <div class="live-indicator">
        <span class="live-dot">●</span>
        <span class="live-label">LIVE</span>
        <span class="timer">0:00</span>
      </div>
      <button class="close-btn" title="Collapse" aria-label="Collapse Beckett">×</button>
    </div>
    <div class="mode-row">
      <button class="mode-btn active" data-mode="personal">Personal</button>
      <button class="mode-btn" data-mode="business">Business</button>
    </div>
    <div class="profile-pill" aria-label="LinkedIn profile"></div>
  </div>
  <div class="panel-body">
    <div class="status" hidden>
      <div class="spinner"></div>
      <span class="status-text">Listening…</span>
    </div>
    <div class="error-box" hidden></div>
    <div class="empty-state">Waiting for captions to start…</div>
    <div class="results" hidden>
      <div class="card">
        <div class="card-label">What's happening</div>
        <p class="result-happening card-text"></p>
      </div>
      <div class="card">
        <div class="card-label">Emotional undercurrent</div>
        <p class="result-emotion card-text"></p>
      </div>
      <div class="card highlight">
        <div class="card-label">Say this now</div>
        <p class="result-suggestion card-text"></p>
      </div>
      <div class="card">
        <div class="card-label">Watch for</div>
        <p class="result-tips card-text"></p>
      </div>
    </div>
  </div>
</div>
`;

class LumenSidebar {
  constructor({ platform = 'generic', isMeeting = false } = {}) {
    this.platform = platform;
    this.isMeeting = isMeeting;
    this.mode = 'personal';
    this.expanded = false;
    this._context = null;

    this._create();
    this._bind();
    this._restore();
  }

  _create() {
    this.host = document.createElement('div');
    this.host.id = 'lumen-sidebar-host';
    Object.assign(this.host.style, {
      position: 'fixed',
      right: '0',
      zIndex: '999999',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      ...(this.isMeeting
        ? { bottom: '80px', top: 'auto' }
        : { top: '50%', transform: 'translateY(-50%)' }
      ),
    });

    this.shadow = this.host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = LUMEN_CSS;
    this.shadow.appendChild(style);

    this.panel = document.createElement('div');
    this.panel.className = 'panel';
    this.panel.innerHTML = this.isMeeting ? MEETING_TEMPLATE : MESSAGE_TEMPLATE;
    this.shadow.appendChild(this.panel);

    document.body.appendChild(this.host);
  }

  _bind() {
    const $ = s => this.shadow.querySelector(s);

    $('.toggle-btn').addEventListener('click', () => this.expand());
    $('.close-btn').addEventListener('click', () => this.collapse());

    this.shadow.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });

    const analyzeBtn = $('.analyze-btn');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => {
        this.host.dispatchEvent(new CustomEvent('lumen:analyze', { bubbles: true }));
      });
    }

    // Delegated: copy and use-response buttons inside .responses
    this.shadow.addEventListener('click', e => {
      if (e.target.classList.contains('copy-btn')) {
        const text = e.target.dataset.text;
        navigator.clipboard.writeText(text).then(() => {
          e.target.textContent = 'Copied!';
          setTimeout(() => { e.target.textContent = 'Copy'; }, 1600);
        }).catch(() => {});
      }
      if (e.target.classList.contains('use-btn')) {
        this.host.dispatchEvent(new CustomEvent('lumen:use-response', {
          detail: { text: e.target.dataset.text },
          bubbles: true,
        }));
      }
    });
  }

  _safeChrome(fn) {
    try { fn(); } catch (e) {
      if (e?.message?.includes('Extension context invalidated')) {
        this.setError('Beckett was reloaded. Reload this page to reconnect.');
      }
    }
  }

  _restore() {
    try {
      chrome.storage.local.get(['lumenExpanded', 'lumenMode', 'linkedInProfile'], res => {
        try {
          if (res?.lumenMode) this._applyMode(res.lumenMode);
          if (res?.lumenExpanded) this.expand();
          if (res?.linkedInProfile) this.setProfile(res.linkedInProfile);
        } catch (e) { this._safeChrome(() => { throw e; }); }
      });
    } catch (e) { this._safeChrome(() => { throw e; }); }
  }

  expand() {
    this.expanded = true;
    this.panel.classList.add('expanded');
    this._safeChrome(() => chrome.storage.local.set({ lumenExpanded: true }));
  }

  collapse() {
    this.expanded = false;
    this.panel.classList.remove('expanded');
    this._safeChrome(() => chrome.storage.local.set({ lumenExpanded: false }));
  }

  setMode(mode) {
    this._applyMode(mode);
    this._safeChrome(() => chrome.storage.local.set({ lumenMode: mode }));
    this.host.dispatchEvent(new CustomEvent('lumen:mode-change', { detail: { mode }, bubbles: true }));
  }

  _applyMode(mode) {
    this.mode = mode;
    this.shadow.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  setProfile(profile) {
    const pill = this.shadow.querySelector('.profile-pill');
    if (!pill || !profile?.name) return;
    const initials = profile.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    pill.innerHTML = `<div class="profile-avatar">${initials}</div><span>${profile.name}</span>`;
    pill.classList.add('visible');
  }

  setContext(context) {
    this._context = context;
    const analyzeBtn = this.shadow.querySelector('.analyze-btn');
    const emptyState = this.shadow.querySelector('.empty-state');
    if (analyzeBtn) analyzeBtn.hidden = false;
    if (emptyState) emptyState.hidden = true;
  }

  setLoading(loading, text = 'Analyzing…') {
    const status = this.shadow.querySelector('.status');
    const statusText = this.shadow.querySelector('.status-text');
    if (status) status.hidden = !loading;
    if (statusText) statusText.textContent = text;
    const analyzeBtn = this.shadow.querySelector('.analyze-btn');
    if (analyzeBtn) analyzeBtn.disabled = loading;
  }

  setError(msg) {
    this.setLoading(false);
    const box = this.shadow.querySelector('.error-box');
    if (!box) return;
    box.textContent = msg;
    box.hidden = !msg;
  }

  showResults(data) {
    this.setLoading(false);
    this.shadow.querySelector('.error-box').hidden = true;
    this.shadow.querySelector('.empty-state').hidden = true;

    const set = (sel, val) => {
      const el = this.shadow.querySelector(sel);
      if (el) el.textContent = val || '—';
    };

    set('.result-intent', data.intent);
    set('.result-tone', data.tone);
    set('.result-want', data.want);

    const container = this.shadow.querySelector('.responses');
    if (container && Array.isArray(data.responses)) {
      container.innerHTML = data.responses.map(r => `
        <div class="response-item">
          <span class="response-tag ${r.tag}">${r.label}</span>
          <p class="response-text">${this._escape(r.text)}</p>
          <div class="response-actions">
            <button class="copy-btn" data-text="${this._attr(r.text)}">Copy</button>
            <button class="use-btn" data-text="${this._attr(r.text)}">Send ↗</button>
          </div>
        </div>
      `).join('');
    }

    this.shadow.querySelector('.results').hidden = false;
  }

  showMeetingResults(data) {
    this.setLoading(false);
    this.shadow.querySelector('.error-box').hidden = true;
    this.shadow.querySelector('.empty-state').hidden = true;

    const set = (sel, val) => {
      const el = this.shadow.querySelector(sel);
      if (el) el.textContent = val || '—';
    };

    set('.result-happening', data.happening);
    set('.result-emotion', data.emotion);
    set('.result-suggestion', data.suggestion);
    set('.result-tips', data.tips);

    this.shadow.querySelector('.results').hidden = false;
  }

  updateTimer(seconds) {
    const el = this.shadow.querySelector('.timer');
    if (!el) return;
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
  }

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  _attr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}

// Expose globally so platform content scripts can instantiate it
window.LumenSidebar = LumenSidebar;
