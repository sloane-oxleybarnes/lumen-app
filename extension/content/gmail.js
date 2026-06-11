// Gmail content script — extracts thread context and communicates with Lumen side panel

(function () {
  let currentContext = null;
  let lastThreadId = null;

  // ── Thread ID from URL ─────────────────────────────────────

  function getThreadIdFromUrl() {
    // Matches URLs like /mail/u/0/#inbox/FMfcgzQbgXNbwtNqMtGPKVvJpjclZnFl
    const match = location.hash.match(/[#/]([A-Za-z0-9]{8,})(?:\?.*)?$/);
    return match ? match[1] : null;
  }

  function getMessageIdFromContainer(container) {
    const candidates = [
      container.getAttribute('data-legacy-message-id'),
      container.getAttribute('data-message-id'),
      container.closest('[data-legacy-message-id]')?.getAttribute('data-legacy-message-id'),
      container.closest('[data-message-id]')?.getAttribute('data-message-id'),
      container.querySelector('[data-legacy-message-id]')?.getAttribute('data-legacy-message-id'),
      container.querySelector('[data-message-id]')?.getAttribute('data-message-id'),
    ].filter(Boolean);

    return candidates.find(id => id && id !== 'undefined') || '';
  }

  function cleanMessageId(id) {
    if (!id) return '';
    return String(id)
      .replace(/^msg-/, '')
      .replace(/^#?msg-/, '')
      .replace(/^#/, '')
      .trim();
  }

  // ── DOM extraction ─────────────────────────────────────────

  function extractThread() {
    const messages = [];

    // Primary: expanded messages — have full body in DOM
    document.querySelectorAll('.adn.ads').forEach(container => {
      const senderEl = container.querySelector('.gD');
      const bodyEl = container.querySelector('.a3s.aiL') || container.querySelector('.a3s');
      const timeEl = container.querySelector('.g3');
      if (!bodyEl) return;
      messages.push({
        sender: senderEl?.getAttribute('email') || senderEl?.textContent?.trim() || 'Unknown',
        senderEmail: senderEl?.getAttribute('email') || '',
        timestamp: timeEl?.title || timeEl?.textContent?.trim() || '',
        messageId: cleanMessageId(getMessageIdFromContainer(container)),
        body: bodyEl.innerText.trim(),
      });
    });

    // Fallback: if no expanded messages found, grab whatever is visible
    if (!messages.length) {
      document.querySelectorAll('.adn').forEach(container => {
        const senderEl = container.querySelector('.gD');
        const bodyEl = container.querySelector('.a3s');
        if (!bodyEl) return;
        const body = bodyEl.innerText.trim();
        if (!body) return;
        messages.push({
          sender: senderEl?.getAttribute('email') || senderEl?.textContent?.trim() || 'Unknown',
          senderEmail: senderEl?.getAttribute('email') || '',
          timestamp: '',
          messageId: cleanMessageId(getMessageIdFromContainer(container)),
          body,
        });
      });
    }

    return messages;
  }

  function extractCurrentContext() {
    const threadMessages = extractThread();
    if (!threadMessages.length) return null;

    const latest = threadMessages[threadMessages.length - 1];
    const subjectEl = document.querySelector('.hP');
    const threadId = getThreadIdFromUrl();

    return {
      messageText: latest.body,
      thread: threadMessages,
      sender: latest.sender,
      senderEmail: latest.senderEmail,
      subject: subjectEl?.textContent?.trim() || '',
      platform: 'gmail',
      channelType: 'email',
      threadId,
      messageIds: threadMessages.map(m => m.messageId).filter(Boolean),
      isSafePerson: false, // filled in async below
    };
  }

  async function buildContext() {
    const ctx = extractCurrentContext();
    if (!ctx) return null;

    // Tag messages with isCurrentUser using cached email from storage
    const { currentUserEmail } = await chrome.storage.local.get('currentUserEmail');
    if (currentUserEmail && ctx.thread) {
      ctx.thread = ctx.thread.map(m => ({
        ...m,
        isCurrentUser: m.senderEmail
          ? m.senderEmail.toLowerCase() === currentUserEmail.toLowerCase()
          : m.sender.toLowerCase().includes(currentUserEmail.toLowerCase()),
      }));
      // Update latest message to be the latest incoming (not from user)
      const latestIncoming = [...ctx.thread].reverse().find(m => !m.isCurrentUser);
      if (latestIncoming) {
        ctx.messageText = latestIncoming.body;
        ctx.sender = latestIncoming.sender;
        ctx.senderEmail = latestIncoming.senderEmail || ctx.senderEmail;
      }
    }

    ctx.isSafePerson = await checkSafePerson(ctx.sender, ctx.senderEmail || '');
    return ctx;
  }

  async function checkSafePerson(senderName, senderEmail) {
    const { safe_people = [] } = await chrome.storage.local.get('safe_people');
    return safe_people.some(p => {
      const nameMatch = p.name && senderName.toLowerCase().includes(p.name.toLowerCase());
      const emailMatch = p.email && senderEmail.toLowerCase() === p.email.toLowerCase();
      return nameMatch || emailMatch;
    });
  }

  // ── Compose injection ──────────────────────────────────────

  function injectComposeButton(composeWindow) {
    if (composeWindow.querySelector('.lumen-compose-btn')) return;
    const toolbar = composeWindow.querySelector('.btC') || composeWindow.querySelector('.aDh');
    if (!toolbar) return;

    const btn = document.createElement('button');
    btn.className = 'lumen-compose-btn';
    btn.textContent = '☀ Draft with Beckett';
    Object.assign(btn.style, {
      marginLeft: '8px',
      padding: '4px 10px',
      background: '#BA7517',
      color: '#fff',
      border: 'none',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '600',
      cursor: 'pointer',
      fontFamily: 'inherit',
    });

    btn.addEventListener('click', async () => {
      const ctx = await buildContext();
      if (ctx) sendToBackground('CONTENT_UPDATED', ctx);
      chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL' }).catch(() => {});
    });

    toolbar.appendChild(btn);
  }

  function injectDraftIntoCompose(text) {
    const composeBody = document.querySelector('.Am.Al.editable') ||
                        document.querySelector('[contenteditable="true"].LW-avf') ||
                        document.querySelector('.Ak [contenteditable="true"]');
    if (!composeBody) return;
    composeBody.focus();
    document.execCommand('selectAll');
    document.execCommand('insertText', false, text);
  }

  // ── Listeners ──────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'EXTRACT_CONTEXT') {
      buildContext().then(ctx => sendResponse({ context: ctx }));
      return true;
    }
    if (msg.type === 'INJECT_DRAFT') {
      injectDraftIntoCompose(msg.text);
      sendResponse({ ok: true });
    }
  });

  // ── Observer ───────────────────────────────────────────────

  const observer = new MutationObserver(async () => {
    const emailBody = document.querySelector('.a3s.aiL');
    if (!emailBody) return;

    const threadId = getThreadIdFromUrl();
    if (threadId === lastThreadId) return;
    lastThreadId = threadId;

    const ctx = await buildContext();
    if (ctx) {
      currentContext = ctx;
      sendToBackground('CONTENT_UPDATED', ctx);
    }

    document.querySelectorAll('.AD').forEach(injectComposeButton);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ── Utils ──────────────────────────────────────────────────

  function sendToBackground(type, payload) {
    try {
      chrome.runtime.sendMessage({ type, payload }, () => {});
    } catch (e) {
      if (!e?.message?.includes('Extension context invalidated')) throw e;
    }
  }
})();
