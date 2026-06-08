// Slack content script — extracts conversation context and communicates with Beckett side panel

(function () {
  let lastMessageId = null;

  // ── DOM extraction ─────────────────────────────────────────

  function getCurrentSlackUser() {
    // Method 1 — from Slack's boot data
    const tsData = window.TS?.model?.self;
    if (tsData?.name) return { name: tsData.name, id: tsData.id };

    // Method 2 — from the sidebar display name
    const sidebarName = document.querySelector('[data-qa="user-display-name"]')?.textContent?.trim();
    if (sidebarName) return { name: sidebarName };

    // Method 3 — from the profile button tooltip
    const profileBtn = document.querySelector('.p-ia4_rail_footer_user_display_name')?.textContent?.trim();
    if (profileBtn) return { name: profileBtn };

    return { name: 'the user' };
  }

  function getChannelType() {
    const url = location.pathname;
    if (url.includes('/im/') || url.includes('/dm/')) return 'dm';
    const header = document.querySelector('.p-channel_sidebar__section_heading_label');
    if (header?.textContent?.toLowerCase().includes('direct')) return 'dm';
    return 'channel';
  }

  function getChannelName() {
    return (
      document.querySelector('[data-qa="channel_name"]')?.textContent?.trim() ||
      document.querySelector('.p-view_header__channel_title')?.textContent?.trim() ||
      document.querySelector('[data-qa="channel-name"]')?.textContent?.trim() ||
      ''
    );
  }

  function extractConversation() {
    const { name: currentUserName } = getCurrentSlackUser();
    let conversation = [];

    // Strategy 1: data-qa message containers with sender carry-forward
    // Slack only renders the sender name on the FIRST message in a group —
    // carry it forward until a new sender appears.
    const containers = document.querySelectorAll('[data-qa="message-container"]');
    if (containers.length) {
      let lastSender = 'Unknown';
      containers.forEach(container => {
        const senderEl = container.querySelector('[data-qa="message_sender_name"]');
        if (senderEl?.innerText?.trim()) lastSender = senderEl.innerText.trim();

        const texts = [...container.querySelectorAll('.p-rich_text_section')]
          .map(el => el.innerText?.trim()).filter(Boolean);
        if (texts.length) {
          conversation.push({
            sender: lastSender,
            text: texts.join('\n'),
            isCurrentUser: lastSender === currentUserName,
          });
        }
      });
      if (conversation.length) return conversation.slice(-50);
    }

    // Strategy 2: c-message_kit containers with carry-forward
    const kitContainers = document.querySelectorAll(
      '.c-message_kit__message_container, .c-message_kit__message, [data-qa="virtual-list-item"]'
    );
    if (kitContainers.length) {
      let lastSender = 'Unknown';
      kitContainers.forEach(container => {
        const senderEl = (
          container.querySelector('[data-qa="message_sender_name"]') ||
          container.querySelector('.c-message_kit__sender')
        );
        if (senderEl?.innerText?.trim()) lastSender = senderEl.innerText.trim();

        const texts = [...container.querySelectorAll('.p-rich_text_section, .c-message_kit__text, [data-qa="message-text"]')]
          .map(el => el.innerText?.trim()).filter(Boolean);
        if (texts.length) {
          conversation.push({
            sender: lastSender,
            text: texts.join('\n'),
            isCurrentUser: lastSender === currentUserName,
          });
        }
      });
      if (conversation.length) return conversation.slice(-50);
    }

    // Strategy 3: pair text sections with the nearest ancestor that has a sender label
    const textEls = [...document.querySelectorAll('.p-rich_text_section')]
      .filter(el => el.innerText?.trim());
    if (textEls.length) {
      let lastSender = 'Unknown';
      textEls.slice(-20).forEach(el => {
        const text = el.innerText.trim();
        if (!text) return;
        const msgRoot = el.closest('[data-qa="message-container"], .c-message_kit__message_container, .c-message_kit__message');
        const senderEl = msgRoot?.querySelector('[data-qa="message_sender_name"], .c-message_kit__sender');
        if (senderEl?.innerText?.trim()) lastSender = senderEl.innerText.trim();
        conversation.push({
          sender: lastSender,
          text,
          isCurrentUser: lastSender === currentUserName,
        });
      });
    }

    // Strategy 4: Slack frequently changes internal class names; as a last
    // resort, read visible message-like rows and filter out obvious chrome.
    const rowEls = [...document.querySelectorAll('[role="listitem"], [data-qa*="message"]')]
      .filter(el => {
        const text = el.innerText?.trim() || '';
        if (text.length < 2) return false;
        if (text.length > 2000) return false;
        if (/^(reply|react|more actions|save|share)$/i.test(text)) return false;
        return true;
      });

    if (rowEls.length) {
      let lastSender = 'Unknown';
      rowEls.slice(-40).forEach(el => {
        const senderEl = el.querySelector('[data-qa="message_sender_name"], .c-message_kit__sender, button[data-qa*="user"]');
        if (senderEl?.innerText?.trim()) lastSender = senderEl.innerText.trim();

        const textEl = el.querySelector('.p-rich_text_section, .c-message_kit__text, [data-qa="message-text"]');
        const text = (textEl?.innerText || el.innerText || '').trim();
        if (!text) return;

        conversation.push({
          sender: lastSender,
          text,
          isCurrentUser: lastSender === currentUserName,
        });
      });
    }

    return conversation.slice(-50);
  }

  async function buildContext() {
    const { name: currentUserName, id: currentUserId } = getCurrentSlackUser();
    const conversation = extractConversation();
    if (!conversation.length) return null;

    const incoming = [...conversation].reverse().find(m => !m.isCurrentUser);
    const messageText = incoming?.text || conversation[conversation.length - 1]?.text || '';
    const sender = incoming?.sender || conversation[conversation.length - 1]?.sender || 'Unknown';

    const isSafePerson = await checkSafePerson(sender);

    // Cache the resolved Slack user name for the service worker to use
    if (currentUserName && currentUserName !== 'the user') {
      chrome.storage.local.get('slackUserName').then(({ slackUserName }) => {
        if (!slackUserName) chrome.storage.local.set({ slackUserName: currentUserName });
      });
    }

    return {
      messageText,
      thread: conversation,
      sender,
      platform: 'slack',
      channelType: getChannelType(),
      channelName: getChannelName(),
      isSafePerson,
      currentUserName: currentUserName !== 'the user' ? currentUserName : null,
    };
  }

  async function checkSafePerson(senderName) {
    const { safe_people = [] } = await chrome.storage.local.get('safe_people');
    return safe_people.some(p =>
      p.name && senderName.toLowerCase().includes(p.name.toLowerCase())
    );
  }

  // ── Compose injection ──────────────────────────────────────

  function injectDraftIntoCompose(text) {
    const composer = (
      document.querySelector('.ql-editor[contenteditable="true"]') ||
      document.querySelector('[data-qa="message_input"] [contenteditable="true"]') ||
      document.querySelector('[contenteditable="true"].c-texty_input')
    );
    if (!composer) return;
    composer.focus();
    document.execCommand('selectAll');
    document.execCommand('insertText', false, text);
    composer.dispatchEvent(new InputEvent('input', { bubbles: true }));
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

  // ── Observer — auto-detect new incoming messages ───────────

  let debounceTimer = null;
  let lastIncomingText = null;

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const ctx = await buildContext();
      if (!ctx) return;

      const incomingText = ctx.messageText?.slice(0, 120) || null;

      // Always update context so the sidebar stays current
      sendToBackground('CONTENT_UPDATED', { ...ctx, autoAnalyze: incomingText !== lastIncomingText && !!incomingText });

      if (incomingText && incomingText !== lastIncomingText) {
        lastIncomingText = incomingText;
      }
    }, 1500);
  });

  function attachObserver() {
    const pane = (
      document.querySelector('.p-message_pane') ||
      document.querySelector('[data-qa="slack_kit_list"]') ||
      document.querySelector('.c-virtual_list__scroll_container') ||
      document.querySelector('[data-qa="message_list"]') ||
      document.querySelector('.p-workspace__primary_view_body')
    );

    if (pane) {
      observer.observe(pane, { childList: true, subtree: true });
      buildContext().then(ctx => {
        if (ctx) sendToBackground('CONTENT_UPDATED', ctx);
      });
    } else {
      setTimeout(attachObserver, 1000);
    }
  }

  attachObserver();

  // ── Utils ──────────────────────────────────────────────────

  function sendToBackground(type, payload) {
    try {
      chrome.runtime.sendMessage({ type, payload }, () => {});
    } catch (e) {
      if (!e?.message?.includes('Extension context invalidated')) throw e;
    }
  }
})();
