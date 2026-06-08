// Beckett side panel — v4 (Analyze only)

const $ = id => document.getElementById(id);
const BECKETT_API = 'https://www.meetbeckett.co/api';

let state = {
  plan: 'free',
  mode: 'personal',
  context: null,
  lastResult: null,
  linkedInProfile: null,
  safePeople: [],
  meetTimer: null,
  meetSeconds: 0,
  voiceSampleCounts: { personal: 0, business: 0 },
  lastMeetingPayload: null,
  currentSender: null,
  currentSenderEmail: null,
  contactHistoryCache: {},
  beckettToken: null,
};

// ── Init ──────────────────────────────────────────────────────

async function init() {
  const [settings, contextRes] = await Promise.all([
    msg('GET_SETTINGS'),
    msg('GET_CURRENT_CONTEXT'),
  ]);

  state.plan = settings.plan || 'free';
  state.mode = settings.mode || 'personal';
  state.linkedInProfile = settings.linkedInProfile || null;
  state.safePeople = settings.safePeople || [];
  state.voiceSampleCounts = settings.voiceSampleCounts || { personal: 0, business: 0 };
  state.beckettToken = settings.beckettToken || null;

  applyPlan();
  applyMode(state.mode);
  renderProfile(state.linkedInProfile);
  renderAuthState();
  updateVoiceBadge();
  setEmptyStateForCurrentTab();

  if (contextRes.context && state.beckettToken) {
    state.context = contextRes.context;
    $('emptyState').hidden = true;
    $('analyzeBtn').style.display = '';
  }

  if (isPro()) loadCalendarEvents();
}

// ── Empty state — platform-aware ──────────────────────────────

async function setEmptyStateForCurrentTab() {
  try {
    const [tab] = await new Promise(resolve =>
      chrome.tabs.query({ active: true, currentWindow: true }, resolve)
    );
    const url = tab?.url || '';
    const msgEl = $('emptyStateMsg');
    if (url.includes('mail.google.com')) {
      msgEl.innerHTML = 'Open an email to get started.';
      if (state.beckettToken) $('analyzeBtn').style.display = '';
    } else if (url.includes('app.slack.com')) {
      msgEl.innerHTML = 'Open a conversation to get started.';
      if (state.beckettToken) $('analyzeBtn').style.display = '';
    } else {
      msgEl.innerHTML = 'Beckett works on Gmail and Slack.<br>Navigate to one of those to get started.';
      // Hide the analyze button entirely on non-supported pages
      $('analyzeBtn').style.display = 'none';
    }
  } catch (_) {}
}

// ── Plan gating ───────────────────────────────────────────────

function applyPlan() {
  const badge = $('planBadge');
  if (state.plan === 'beta') {
    badge.textContent = 'Beta';
    badge.className = 'plan-badge beta';
    badge.hidden = false;
  } else if (state.plan === 'pro') {
    badge.textContent = 'Pro';
    badge.className = 'plan-badge pro';
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
  $('businessLock').hidden = isPro();
}

function isPro() { return state.plan === 'pro' || state.plan === 'beta'; }
function isBeta() { return state.plan === 'beta'; }

function requirePro(featureName) {
  if (isPro()) return true;
  showUpgrade(`${featureName} is available on Pro.`);
  return false;
}

function showUpgrade(message) {
  $('upgradeMsg').textContent = message;
  $('upgradePrompt').hidden = false;
}

$('dismissUpgrade').onclick = () => { $('upgradePrompt').hidden = true; };

// ── Mode toggle ───────────────────────────────────────────────

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (mode === 'business' && !requirePro('Business mode')) return;
    applyMode(mode);
    msg('SAVE_SETTING', { key: 'lumenMode', value: mode });
    updateVoiceBadge();
  });
});

function applyMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
}

// ── Profile pill ──────────────────────────────────────────────

function renderProfile(profile) {
  const pill = $('profilePill');
  if (!profile?.name) { pill.hidden = true; return; }
  const initials = profile.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  pill.innerHTML = `<div class="profile-pill-avatar">${initials}</div><span>${profile.name}</span>`;
  pill.hidden = false;
}

// ── Beckett auth ───────────────────────────────────────────────

function renderAuthState() {
  const isLoggedIn = !!state.beckettToken;
  $('authCard').hidden = isLoggedIn;
  if (!isLoggedIn) {
    $('analyzeBtn').style.display = 'none';
    $('emptyState').hidden = true;
  }
}

async function connectBeckettFromPanel() {
  const btn = $('connectBeckettBtn');
  const error = $('authError');
  btn.disabled = true;
  btn.textContent = 'Connecting...';
  error.hidden = true;

  const res = await msg('CONNECT_BECKETT');
  btn.disabled = false;
  btn.textContent = 'Log in with Beckett';

  if (res.error) {
    error.textContent = res.error;
    error.hidden = false;
    return;
  }

  const settings = await msg('GET_SETTINGS');
  state.plan = settings.plan || 'beta';
  state.beckettToken = settings.beckettToken || null;
  applyPlan();
  renderAuthState();
  setEmptyStateForCurrentTab();

  const contextRes = await msg('GET_CURRENT_CONTEXT');
  if (contextRes.context) {
    state.context = contextRes.context;
    $('emptyState').hidden = true;
    $('analyzeBtn').style.display = '';
  }
}

$('connectBeckettBtn').onclick = connectBeckettFromPanel;

// ── Voice calibration badge ───────────────────────────────────

function updateVoiceBadge() {
  const count = state.voiceSampleCounts[state.mode] || 0;
  const badge = $('voiceBadge');
  if (isPro() && count >= 10) {
    badge.title = `Beckett has learned from ${count} of your messages in ${state.mode} mode.`;
    badge.hidden = false;
  } else {
    badge.hidden = true;
  }
}

$('settingsBtn').onclick = () => {
  if (!state.beckettToken) {
    connectBeckettFromPanel();
    return;
  }
  chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
};

$('voiceBadge').onclick = () => {
  const count = state.voiceSampleCounts[state.mode] || 0;
  alert(`Beckett has learned from ${count} of your messages in ${state.mode} mode.`);
};

function logVoiceSample(text) {
  if (!isPro() || !text) return;
  msg('LOG_VOICE_SAMPLE', { text, mode: state.mode, platform: state.context?.platform || 'unknown' })
    .then(async () => {
      const stats = await msg('GET_VOICE_STATS');
      state.voiceSampleCounts = { personal: stats.personal || 0, business: stats.business || 0 };
      updateVoiceBadge();
    });
}

// ── Analyze ───────────────────────────────────────────────────

$('analyzeBtn').onclick = async () => {
  if (!state.beckettToken) {
    renderAuthState();
    return;
  }

  setAnalyzeLoading(true);
  clearResults();

  const response = await msg('TRIGGER_ANALYZE', { mode: state.mode });
  setAnalyzeLoading(false);

  if (response.error) { showError($('errorBox'), response.error); return; }
  showResults(response.result, response.isSafePerson);
  state.lastResult = response.result;
  state.currentSender = response.sender || null;
  state.currentSenderEmail = response.senderEmail || null;

  if (state.currentSender && state.currentSender.includes('@') && isPro()) {
    $('contactNameDisplay').textContent = state.currentSender;
    $('contactHistoryRow').hidden = false;
    $('historyBadge').hidden = true;
    $('refreshHistoryBtn').hidden = true;
    $('seeHistoryBtn').hidden = false;
  }

  // Look up contact in Beckett
  lookupContact();
};

function setAnalyzeLoading(on) {
  $('statusBar').hidden = !on;
  $('analyzeBtn').disabled = on;
  $('errorBox').hidden = true;
}

function clearResults() {
  $('results').hidden = true;
  $('meetingResults').hidden = true;
  $('feedbackRow').hidden = true;
  $('feedbackConfirm').hidden = true;
  $('feedbackImprove').hidden = true;
  $('contactHistoryRow').hidden = true;
  $('askSection').hidden = true;
  $('askAnswerCard').hidden = true;
  $('contactStrip').hidden = true;
}

function showResults(data, isSafePerson) {
  if (!data) return;
  $('safeBadge').hidden = !isSafePerson;
  $('rIntent').textContent = data.intent || '—';
  $('rTone').textContent = data.tone || '—';
  $('rWant').textContent = data.want || '—';

  const container = $('responses');
  container.innerHTML = (data.responses || []).map(r => `
    <div class="response-item">
      <span class="response-tag ${r.tag}">${r.label}</span>
      <p class="response-text">${escHtml(r.text)}</p>
      <div class="response-actions">
        <button class="copy-btn" data-text="${escAttr(r.text)}">Copy</button>
        <button class="use-btn" data-text="${escAttr(r.text)}">Send ↗</button>
      </div>
    </div>
  `).join('');

  $('results').hidden = false;
  $('askSection').hidden = false;
  $('askInput').value = '';
  $('askAnswerCard').hidden = true;
  $('feedbackRow').hidden = !isBeta();
}

// ── Contacts lookup ───────────────────────────────────────────

async function lookupContact() {
  if (!state.beckettToken) return;
  const identifier = state.currentSenderEmail || state.currentSender;
  if (!identifier) return;

  const platform = state.currentSenderEmail ? 'email' : 'slack';
  const strip = $('contactStrip');
  const label = $('contactStripLabel');
  const addBtn = $('contactStripAdd');

  strip.hidden = false;
  label.textContent = '…';
  addBtn.hidden = true;

  try {
    const res = await fetch(
      `${BECKETT_API}/contacts/lookup?platform=${platform}&identifier=${encodeURIComponent(identifier.toLowerCase())}`,
      { headers: { Authorization: `Bearer ${state.beckettToken}` } }
    );
    const data = await res.json();
    if (data.contact) {
      const icon = data.contact.trusted ? '💛' : '◎';
      const suffix = data.contact.trusted ? '— trusted contact' : '— in contacts';
      label.textContent = `${icon} ${data.contact.name} ${suffix}`;
      addBtn.hidden = true;
    } else {
      const name = state.currentSender || identifier;
      label.textContent = '';
      addBtn.textContent = `+ Add ${name} to contacts`;
      addBtn.hidden = false;
      addBtn.onclick = () => addContact(name, platform, identifier);
    }
  } catch (_) {
    strip.hidden = true;
  }
}

async function addContact(name, platform, identifier) {
  if (!state.beckettToken) return;
  const addBtn = $('contactStripAdd');
  addBtn.disabled = true;
  addBtn.textContent = 'Adding…';

  try {
    const body = { name };
    if (platform === 'email') body.email = identifier;
    else if (platform === 'slack') body.slack_handle = identifier;

    const res = await fetch(`${BECKETT_API}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${state.beckettToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      $('contactStripLabel').textContent = `◎ ${name} — in contacts`;
      addBtn.hidden = true;
    } else {
      addBtn.textContent = 'Error — try again';
      addBtn.disabled = false;
    }
  } catch (_) {
    addBtn.textContent = 'Error — try again';
    addBtn.disabled = false;
  }
}

// ── Ask a question ────────────────────────────────────────────

$('askBtn').onclick = async () => {
  const question = $('askInput').value.trim();
  if (!question || !state.lastResult) return;

  $('askStatus').hidden = false;
  $('askAnswerCard').hidden = true;
  $('askBtn').disabled = true;

  const response = await msg('ASK_ABOUT_CONTEXT', {
    question,
    context: state.context,
    lastResult: state.lastResult,
    mode: state.mode,
  });

  $('askStatus').hidden = true;
  $('askBtn').disabled = false;

  if (response.error) { showError($('errorBox'), response.error); return; }
  $('askAnswer').textContent = response.answer;
  $('askAnswerCard').hidden = false;
};

$('askInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('askBtn').click();
});

// Log voice samples on copy/send
document.addEventListener('click', e => {
  if (e.target.matches('.copy-btn[data-text]')) {
    const text = e.target.dataset.text;
    navigator.clipboard.writeText(text).then(() => {
      const orig = e.target.textContent;
      e.target.textContent = 'Copied!';
      setTimeout(() => { e.target.textContent = orig; }, 1500);
    }).catch(() => {});
    logVoiceSample(text);
  }
  if (e.target.matches('.use-btn[data-text]')) {
    const text = e.target.dataset.text;
    msg('INJECT_DRAFT', { text });
    logVoiceSample(text);
  }
});

// ── Contact history ───────────────────────────────────────────

$('seeHistoryBtn').onclick = () => fetchContactHistory(state.currentSender, false);
$('refreshHistoryBtn').onclick = () => fetchContactHistory(state.currentSender, true);

async function fetchContactHistory(email, forceRefresh) {
  if (!email || !isPro()) return;
  $('seeHistoryBtn').textContent = 'Loading…';
  $('seeHistoryBtn').disabled = true;

  if (forceRefresh) {
    delete state.contactHistoryCache[email];
    await chrome.storage.local.remove(`contact_history_${email.replace(/[^a-z0-9]/gi, '_')}`);
  }

  const res = await msg('FETCH_CONTACT_HISTORY', { email });
  $('seeHistoryBtn').disabled = false;
  $('seeHistoryBtn').textContent = 'See history';

  if (res.error) { showError($('errorBox'), `History: ${res.error}`); return; }

  state.contactHistoryCache[email] = res;
  $('historyBadge').hidden = false;
  $('refreshHistoryBtn').hidden = false;
  $('seeHistoryBtn').hidden = true;

  renderContactHistory(res.threads || [], res.slackMessages || []);
}

function renderContactHistory(threads, slackMessages) {
  const existing = $('contactHistoryDetail');
  if (existing) existing.remove();

  if (!threads.length && !slackMessages.length) return;

  const el = document.createElement('div');
  el.id = 'contactHistoryDetail';
  el.className = 'card';
  el.style.marginTop = '8px';

  let html = '';
  if (threads.length) {
    html += `<div class="card-label">Gmail — recent threads</div>`;
    html += threads.slice(0, 5).map(t =>
      `<p class="card-text" style="margin:2px 0;font-size:12px;">• ${escHtml(t.subject)}</p>`
    ).join('');
  }
  if (slackMessages.length) {
    html += `<div class="card-label" style="margin-top:8px;">Slack — recent messages</div>`;
    html += slackMessages.slice(0, 5).map(m =>
      `<p class="card-text" style="margin:2px 0;font-size:12px;">• ${escHtml(m.text.slice(0, 80))}${m.text.length > 80 ? '…' : ''}</p>`
    ).join('');
  }

  el.innerHTML = html;
  $('contactHistoryRow').after(el);
}

// ── Meeting live mode ─────────────────────────────────────────

function showMeetingResults(data) {
  $('emptyState').hidden = true;
  $('analyzeBtn').style.display = 'none';
  $('mHappening').textContent = data.happening || '—';
  $('mEmotion').textContent = data.emotion || '—';
  $('mSuggestion').textContent = data.suggestion || '—';
  $('mTips').textContent = data.tips || '—';
  $('meetingResults').hidden = false;
}

function startMeetTimer() {
  if (state.meetTimer) return;
  state.meetSeconds = 0;
  state.meetTimer = setInterval(() => {
    state.meetSeconds++;
    const m = Math.floor(state.meetSeconds / 60);
    const s = String(state.meetSeconds % 60).padStart(2, '0');
    $('meetTimer').textContent = `${m}:${s}`;
  }, 1000);
}

function stopMeetTimer() {
  clearInterval(state.meetTimer);
  state.meetTimer = null;
}

// ── Debrief notification ──────────────────────────────────────

function showDebriefOffer() {
  $('debriefOffer').hidden = false;
  $('debriefPill').hidden = true;
  $('meetingResults').hidden = true;
}

$('debriefDismissBtn').onclick = () => {
  $('debriefOffer').hidden = true;
  state.lastMeetingPayload = null;
};

$('startDebriefBtn').onclick = async () => {
  $('debriefOffer').hidden = true;
  await runDebrief();
};

$('skipDebriefBtn').onclick = () => {
  $('debriefOffer').hidden = true;
  $('debriefPill').hidden = false;
};

$('startDebriefMiniBtn').onclick = async () => {
  $('debriefPill').hidden = true;
  await runDebrief();
};

$('debriefPillCloseBtn').onclick = () => {
  $('debriefPill').hidden = true;
  state.lastMeetingPayload = null;
};

async function runDebrief() {
  if (!state.lastMeetingPayload) return;
  $('statusBar').hidden = false;
  $('statusText').textContent = 'Generating debrief…';

  const res = await msg('GENERATE_DEBRIEF', state.lastMeetingPayload);
  $('statusBar').hidden = true;
  state.lastMeetingPayload = null;

  if (res.error) { showError($('errorBox'), res.error); return; }
  renderDebrief(res.result);
}

function renderDebrief(text) {
  const sections = text.split(/\n(?=\d+\.)/).map(s => s.replace(/^\d+\.\s*/, '').trim());
  const [wentWell = '', differently = '', followUp = ''] = sections;
  $('dWentWell').textContent = wentWell || text;
  $('dDifferently').textContent = differently;
  $('dFollowUp').textContent = followUp;
  $('debriefResults').hidden = false;
}

$('closeDebriefBtn').onclick = () => { $('debriefResults').hidden = true; };

$('copyFollowUpBtn').onclick = () => {
  const text = $('dFollowUp').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const orig = $('copyFollowUpBtn').textContent;
    $('copyFollowUpBtn').textContent = 'Copied!';
    setTimeout(() => { $('copyFollowUpBtn').textContent = orig; }, 1500);
  }).catch(() => {});
};

$('sendFollowUpBtn').onclick = () => {
  msg('INJECT_DRAFT', { text: $('dFollowUp').textContent });
};

// ── Calendar / pre-meeting briefs ─────────────────────────────

async function loadCalendarEvents() {
  const res = await msg('GET_CALENDAR_EVENTS');
  if (res.error || !res.events?.length) return;

  const now = Date.now();
  const soon = res.events.filter(e => {
    const start = new Date(e.start?.dateTime).getTime();
    const mins = (start - now) / 60000;
    return mins >= 0 && mins <= 120;
  });

  if (soon.length) renderMeetingBriefs(soon);
}

function renderMeetingBriefs(events) {
  const container = $('meetingBriefs');
  container.innerHTML = '';
  events.forEach(event => {
    const start = new Date(event.start.dateTime);
    const minsAway = Math.round((start - Date.now()) / 60000);
    const timeLabel = minsAway <= 5 ? 'Starting now' : `In ${minsAway} min`;
    const attendees = (event.attendees || []).filter(a => !a.self).map(a => a.displayName || a.email);

    const card = document.createElement('div');
    card.className = 'meeting-brief-card';
    card.innerHTML = `
      <div class="brief-time">📅 ${timeLabel} · ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
      <div class="brief-title">${escHtml(event.summary || 'Meeting')}</div>
      ${attendees.length ? `<div class="brief-attendees">${escHtml(attendees.slice(0, 4).join(', '))}</div>` : ''}
      <div class="brief-body" id="brief-body-${event.id}" hidden></div>
      <div class="brief-actions">
        <button class="btn-brief-prepare">Prepare →</button>
        <button class="btn-text dismiss-brief">Dismiss</button>
      </div>
    `;

    card.querySelector('.dismiss-brief').onclick = () => card.remove();
    card.querySelector('.btn-brief-prepare').onclick = async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Preparing…';
      const attendeeEmails = (event.attendees || []).filter(a => !a.self && a.email).map(a => a.email);
      const res = await msg('GENERATE_MEETING_BRIEF', {
        meetingTitle: event.summary || 'Meeting',
        attendees: attendees.slice(0, 5),
        attendeeEmails,
      });
      btn.remove();
      const bodyEl = card.querySelector(`#brief-body-${event.id}`);
      bodyEl.textContent = res.error ? res.error : res.result;
      bodyEl.hidden = false;
    };

    container.appendChild(card);
  });
}

// ── Feedback (Beta only) ──────────────────────────────────────

document.querySelectorAll('.feedback-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const value = btn.dataset.value;
    msg('SUBMIT_FEEDBACK', {
      feedback: value,
      responseText: state.lastResult?.responses?.[0]?.text || '',
      mode: state.mode,
      timestamp: Date.now(),
    });
    if (value === 'yes') {
      $('feedbackConfirm').hidden = false;
      $('feedbackImprove').hidden = true;
    } else {
      $('feedbackImprove').hidden = false;
      $('feedbackConfirm').hidden = true;
    }
  });
});

$('submitFeedbackText').onclick = () => {
  const text = $('feedbackText').value.trim();
  if (text) msg('SUBMIT_FEEDBACK', { feedback: 'no', improvementNote: text, timestamp: Date.now() });
  $('feedbackImprove').hidden = true;
  $('feedbackConfirm').hidden = false;
  $('feedbackConfirm').textContent = 'Thanks — this helps Beckett improve.';
};

$('dismissFeedback').onclick = () => { $('feedbackImprove').hidden = true; };

// ── Incoming messages from background ────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'CONTENT_UPDATED':
      state.context = message.context;
      if (state.beckettToken) {
        $('emptyState').hidden = true;
        $('analyzeBtn').style.display = '';
      } else {
        renderAuthState();
      }
      // Auto-analyze on Slack when a new incoming message is detected
      if (state.beckettToken && message.context?.autoAnalyze && message.context?.platform === 'slack') {
        $('analyzeBtn').click();
      }
      break;

    case 'MEETING_RESULT':
      if (!isPro()) return;
      showMeetingResults(message.data);
      startMeetTimer();
      break;

    case 'MEETING_ENDED': {
      stopMeetTimer();
      const endPayload = message.payload || message.data || {};
      if (!state.lastMeetingPayload &&
          endPayload.transcript &&
          endPayload.transcript.trim().split(/\s+/).length >= 50) {
        state.lastMeetingPayload = endPayload;
        showDebriefOffer();
      }
      break;
    }
  }
});

// ── Utils ─────────────────────────────────────────────────────

function msg(type, payload = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, payload }, res => {
      resolve(res || { error: 'No response.' });
    });
  });
}

function showError(el, text) {
  el.textContent = text;
  el.hidden = false;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Boot ──────────────────────────────────────────────────────

init();
