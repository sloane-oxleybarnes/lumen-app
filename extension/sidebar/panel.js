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
  lastAnalysisMetadata: null,
  contactHistoryCache: {},
  beckettToken: null,
  activeWorkspace: 'analyze',
  draftTask: 'new',
  draftRevision: '',
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
  applyWorkspace('analyze');
  setEmptyStateForCurrentTab();

  if (contextRes.context && state.beckettToken) {
    state.context = contextRes.context;
    if (state.activeWorkspace === 'analyze') {
      $('emptyState').hidden = true;
      $('analyzeBtn').style.display = '';
    }
  }

  if (isPro()) loadCalendarEvents();
}

// ── Empty state — platform-aware ──────────────────────────────

async function setEmptyStateForCurrentTab() {
  if (state.activeWorkspace === 'draft') return;
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

// ── Draft / edit workspace ───────────────────────────────────

document.querySelectorAll('.draft-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => applyDraftTask(btn.dataset.draftTask));
});

document.querySelectorAll('.draft-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const value = btn.dataset.revision || '';
    state.draftRevision = state.draftRevision === value ? '' : value;
    document.querySelectorAll('.draft-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.revision === state.draftRevision);
    });
  });
});

$('generateDraftBtn').onclick = generateDraft;

function applyDraftTask(task) {
  state.draftTask = task === 'improve' ? 'improve' : 'new';
  document.querySelectorAll('.draft-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.draftTask === state.draftTask);
  });
  $('draftTextWrap').hidden = state.draftTask !== 'improve';
  $('generateDraftBtn').textContent = state.draftTask === 'improve' ? 'Improve draft' : 'Generate draft';
  $('draftErrorBox').hidden = true;
}

async function generateDraft() {
  if (!state.beckettToken) {
    renderAuthState();
    return;
  }

  const goal = $('draftGoal').value.trim();
  const draftText = $('draftText').value.trim();

  if (state.draftTask === 'new' && !goal) {
    showError($('draftErrorBox'), 'Add what you need to say first.');
    return;
  }
  if (state.draftTask === 'improve' && !draftText) {
    showError($('draftErrorBox'), 'Paste a draft to improve first.');
    return;
  }

  setDraftLoading(true);
  $('draftResultCard').hidden = true;
  $('draftErrorBox').hidden = true;

  const response = await msg('DRAFT_ASSIST', {
    task: state.draftTask,
    goal,
    draftText,
    revisionInstruction: state.draftRevision,
    context: state.context,
    mode: state.mode,
  });

  setDraftLoading(false);

  if (response.error) {
    showError($('draftErrorBox'), response.error);
    return;
  }

  renderDraftResult(response.result);
}

function setDraftLoading(on) {
  $('draftStatus').hidden = !on;
  $('generateDraftBtn').disabled = on;
  document.querySelectorAll('.draft-mode-btn, .draft-chip').forEach(btn => {
    btn.disabled = on;
  });
}

function renderDraftResult(result) {
  const note = result?.note || '';
  $('draftNote').textContent = note;
  $('draftNote').classList.toggle('draft-note-empty', !note);

  const drafts = Array.isArray(result?.drafts) ? result.drafts : [];
  $('draftOptions').innerHTML = drafts.map(draft => `
    <div class="draft-option">
      <div class="draft-option-header">
        <span class="draft-option-label">${escHtml(draft.label || 'Option')}</span>
      </div>
      ${draft.why ? `<p class="draft-option-why">${escHtml(draft.why)}</p>` : ''}
      <p class="draft-option-text">${escHtml(draft.text || '')}</p>
      <div class="response-actions">
        <button class="copy-btn" data-text="${escAttr(draft.text || '')}">Copy</button>
        <button class="use-btn" data-text="${escAttr(draft.text || '')}">Use in composer ↗</button>
      </div>
      <div class="draft-revise-row">
        <button class="draft-revise-btn" data-revision="Make it shorter" data-text="${escAttr(draft.text || '')}" type="button">Shorter</button>
        <button class="draft-revise-btn" data-revision="Make it warmer" data-text="${escAttr(draft.text || '')}" type="button">Warmer</button>
        <button class="draft-revise-btn" data-revision="Make it more direct" data-text="${escAttr(draft.text || '')}" type="button">More direct</button>
      </div>
    </div>
  `).join('');
  $('draftResultCard').hidden = !drafts.length;
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
  $('workspaceTabs').hidden = !isLoggedIn;
  if (!isLoggedIn) $('draftPanel').hidden = true;
  if (!isLoggedIn) {
    $('analyzeBtn').style.display = 'none';
    $('emptyState').hidden = true;
  }
}

document.querySelectorAll('.workspace-tab').forEach(btn => {
  btn.addEventListener('click', () => applyWorkspace(btn.dataset.workspace));
});

function applyWorkspace(workspace) {
  state.activeWorkspace = workspace === 'draft' ? 'draft' : 'analyze';
  const isDraft = state.activeWorkspace === 'draft';

  document.querySelectorAll('.workspace-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.workspace === state.activeWorkspace);
  });

  $('draftPanel').hidden = !isDraft || !state.beckettToken;

  if (isDraft) {
    $('emptyState').hidden = true;
    $('analyzeBtn').style.display = 'none';
    $('results').hidden = true;
    $('meetingResults').hidden = true;
    $('errorBox').hidden = true;
    return;
  }

  if (!state.beckettToken) return;
  if (state.lastResult) {
    $('results').hidden = false;
    $('askSection').hidden = false;
    $('emptyState').hidden = true;
    $('analyzeBtn').style.display = '';
    return;
  }
  setEmptyStateForCurrentTab();
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
  applyWorkspace(state.activeWorkspace);
  setEmptyStateForCurrentTab();

  const contextRes = await msg('GET_CURRENT_CONTEXT');
  if (contextRes.context) {
    state.context = contextRes.context;
    $('emptyState').hidden = true;
    $('analyzeBtn').style.display = '';
  }
}

$('connectBeckettBtn').onclick = connectBeckettFromPanel;

$('slackReconnectBtn').onclick = async () => {
  const btn = $('slackReconnectBtn');
  btn.disabled = true;
  btn.textContent = 'Connecting...';
  const res = await msg('CONNECT_SLACK');
  btn.disabled = false;
  btn.textContent = 'Reconnect Slack';
  if (res.error) {
    showError($('errorBox'), `Slack reconnect failed: ${res.error}`);
    return;
  }
  $('errorBox').hidden = true;
  btn.hidden = true;
};

$('gmailReconnectBtn').onclick = () => {
  chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
};

$('analysisDetailsToggle').onclick = () => {
  const panel = $('analysisMeta');
  const toggle = $('analysisDetailsToggle');
  const open = panel.hidden;
  panel.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
};

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
  state.lastAnalysisMetadata = response.metadata || null;
  if (response.context) state.context = response.context;
  showResults(response.result, response.isSafePerson);
  state.lastResult = response.result;
  state.currentSender = response.sender || null;
  state.currentSenderEmail = response.senderEmail || null;

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
  $('askSection').hidden = true;
  $('askAnswerCard').hidden = true;
  $('contactStrip').hidden = true;
  $('analysisDetails').hidden = true;
  $('analysisDetailsToggle').setAttribute('aria-expanded', 'false');
  $('analysisMeta').hidden = true;
  $('slackReconnectBtn').hidden = true;
  $('gmailReconnectCard').hidden = true;
}

function showResults(data, isSafePerson) {
  if (!data) return;
  $('safeBadge').hidden = !isSafePerson;
  renderAnalysisMetadata(state.lastAnalysisMetadata);
  renderBulletText($('rIntent'), data.intent || '—');
  renderBulletText($('rTone'), data.tone || '—');
  renderBulletText($('rWant'), data.want || '—');

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

function renderAnalysisMetadata(metadata) {
  const detailsShell = $('analysisDetails');
  const card = $('analysisMeta');
  const text = $('analysisMetaText');
  const summary = $('analysisDetailsSummary');
  const toggle = $('analysisDetailsToggle');
  const reconnect = $('slackReconnectBtn');
  const gmailReconnectCard = $('gmailReconnectCard');
  if (!metadata) {
    detailsShell.hidden = true;
    card.hidden = true;
    gmailReconnectCard.hidden = true;
    return;
  }

  const contextSource = metadata.contextSource || metadata.source;
  const sourceLabel = contextSource === 'slack_dom'
    ? 'Slack page context'
    : contextSource === 'gmail_api'
      ? 'Gmail full-thread API'
      : 'Page context';
  const count = Number(metadata.threadCount || 0);
  const details = [
    sourceLabel,
    metadata.contextStatus ? contextStatusLabel(metadata.contextStatus) : null,
    count ? `${count} message${count === 1 ? '' : 's'} included` : null,
    metadata.channelName ? `#${metadata.channelName}` : metadata.channelType || null,
  ].filter(Boolean);

  if (metadata.platform === 'gmail' && contextSource !== 'gmail_api' && metadata.gmailEnrichmentReason) {
    details.push(gmailReasonLabel(metadata.gmailEnrichmentReason));
  }

  renderGmailReconnectPrompt(metadata);

  if (metadata.platform === 'slack' && metadata.slackConnected === false) {
    details.push('Slack not connected locally');
    reconnect.hidden = false;
  } else {
    reconnect.hidden = true;
  }

  text.textContent = details.join(' · ');
  summary.textContent = buildAnalysisDetailsSummary(metadata, sourceLabel, count);
  detailsShell.hidden = false;
  card.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
}

function buildAnalysisDetailsSummary(metadata, sourceLabel, count) {
  if (metadata.platform === 'slack' && metadata.slackConnected === false) return 'Reconnect available';
  if (metadata.contextStatus === 'full_thread') return `Full thread${count ? ` · ${count}` : ''}`;
  if (metadata.contextStatus === 'visible_context') return 'Visible context';
  return sourceLabel;
}

function contextStatusLabel(status) {
  if (status === 'full_thread') return 'Full thread';
  if (status === 'visible_context') return 'Visible context only';
  if (status === 'page_context') return 'Page context';
  return status;
}

function renderGmailReconnectPrompt(metadata) {
  const card = $('gmailReconnectCard');
  const title = $('gmailReconnectTitle');
  const text = $('gmailReconnectText');
  const reason = metadata?.gmailEnrichmentReason;

  const contextSource = metadata?.contextSource || metadata?.source;
  if (metadata?.platform !== 'gmail' || contextSource === 'gmail_api' || !reason) {
    card.hidden = true;
    return;
  }

  if (reason === 'google_not_connected') {
    title.textContent = 'Connect Gmail for full threads';
    text.textContent = 'Beckett can analyze the visible message now, but it needs your Gmail connection in the web app to read the full thread.';
    card.hidden = false;
    return;
  }

  if (reason === 'gmail_token_expired') {
    title.textContent = 'Reconnect Gmail for full threads';
    text.textContent = 'Your Gmail connection needs to be refreshed before Beckett can include earlier messages in this thread.';
    card.hidden = false;
    return;
  }

  if (reason === 'google_refresh_token_missing') {
    title.textContent = 'Reconnect Gmail for full threads';
    text.textContent = 'Beckett can analyze the visible message now, but reconnecting Gmail in Settings lets it refresh full-thread access reliably.';
    card.hidden = false;
    return;
  }

  if (reason === 'thread_match_ambiguous') {
    title.textContent = 'Using visible Gmail context';
    text.textContent = 'Beckett found more than one possible full thread, so it used only the visible conversation instead of guessing.';
    card.hidden = false;
    return;
  }

  if (reason === 'beckett_not_connected') {
    title.textContent = 'Log in to Beckett first';
    text.textContent = 'Connect your Beckett account, then reconnect Gmail from Settings so full-thread analysis can work.';
    card.hidden = false;
    return;
  }

  card.hidden = true;
}

function gmailReasonLabel(reason) {
  if (reason === 'google_not_connected') return 'Gmail connection unavailable';
  if (reason === 'gmail_token_expired') return 'Reconnect Gmail for full threads';
  if (reason === 'google_refresh_token_missing') return 'Reconnect Gmail for server refresh';
  if (reason === 'google_refresh_not_configured') return 'Gmail refresh not configured';
  if (reason === 'thread_match_ambiguous') return 'Full thread match ambiguous';
  if (reason === 'thread_not_found') return 'Full thread not found';
  if (reason === 'beckett_not_connected') return 'Beckett login unavailable';
  if (reason?.startsWith('gmail_api_error')) return `Gmail API error (${reason})`;
  if (reason?.startsWith('gmail_backend_error')) return `Gmail backend error (${reason})`;
  return `Full thread unavailable (${reason || 'unknown'})`;
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
  const name = state.currentSender || identifier;

  strip.hidden = false;
  label.textContent = '…';
  addBtn.hidden = true;

  try {
    const params = new URLSearchParams({
      platform,
      identifier: identifier.toLowerCase(),
    });
    if (name) params.set('name', name);

    const res = await fetch(
      `${BECKETT_API}/contacts/lookup?${params.toString()}`,
      { headers: { Authorization: `Bearer ${state.beckettToken}` } }
    );
    const data = await res.json();
    if (data.contact) {
      const icon = data.contact.trusted ? '💛' : '◎';
      const suffix = data.contact.trusted ? '— trusted contact' : '— in contacts';
      label.textContent = `${icon} ${data.contact.name} ${suffix}`;
      addBtn.textContent = `See ${data.contact.name}'s Contact Card`;
      addBtn.hidden = false;
      addBtn.onclick = () => chrome.runtime.sendMessage({ type: 'OPEN_CONTACTS' });
    } else {
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
  renderBulletText($('askAnswer'), response.answer);
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
  if (e.target.matches('.draft-revise-btn[data-text]')) {
    const text = e.target.dataset.text;
    const revision = e.target.dataset.revision || '';
    applyWorkspace('draft');
    applyDraftTask('improve');
    $('draftText').value = text;
    state.draftRevision = revision;
    document.querySelectorAll('.draft-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.revision === revision);
    });
    generateDraft();
  }
});

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
    submitBetaFeedback(value);
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
  if (text) submitBetaFeedback('no', text);
  $('feedbackImprove').hidden = true;
  $('feedbackConfirm').hidden = false;
  $('feedbackConfirm').textContent = 'Thanks — this helps Beckett improve.';
};

$('dismissFeedback').onclick = () => { $('feedbackImprove').hidden = true; };

function submitBetaFeedback(feedback, improvementNote = '') {
  return msg('SUBMIT_FEEDBACK', {
    feedback,
    improvementNote,
    responseText: state.lastResult?.responses?.[0]?.text || '',
    mode: state.mode,
    context: state.context,
    metadata: state.lastAnalysisMetadata || {},
    result: state.lastResult || {},
    timestamp: Date.now(),
  });
}

// ── Incoming messages from background ────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'CONTENT_UPDATED':
      state.context = message.context;
      if (state.beckettToken && state.activeWorkspace === 'analyze') {
        $('emptyState').hidden = true;
        $('analyzeBtn').style.display = '';
      } else {
        renderAuthState();
      }
      // Auto-analyze on Slack when a new incoming message is detected
      if (state.beckettToken && state.activeWorkspace === 'analyze' && message.context?.autoAnalyze && message.context?.platform === 'slack') {
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

function renderBulletText(el, value) {
  const text = String(value || '').trim();
  if (!text || text === '—') {
    el.textContent = text || '—';
    return;
  }

  const bullets = text
    .split(/\n+/)
    .map(line => line.trim().replace(/^[-•]\s*/, ''))
    .map(line => line.replace(/^(?:\d+\s*)?bullet(?:\s*point)?s?\s*:\s*/i, '').trim())
    .filter(Boolean);

  if (bullets.length <= 1 && !/^[-•]\s*/.test(text)) {
    el.innerHTML = `<ul class="beckett-bullets"><li>${escHtml(text)}</li></ul>`;
    return;
  }

  el.innerHTML = `<ul class="beckett-bullets">${bullets.map(item => `<li>${escHtml(item)}</li>`).join('')}</ul>`;
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function escAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Boot ──────────────────────────────────────────────────────

init();
