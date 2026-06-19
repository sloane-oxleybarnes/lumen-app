function toneInstruction(mode, isSafePerson) {
  if (isSafePerson) {
    return `This message is from someone the user deeply trusts — a close friend, partner, or family member. Use the warmest, most casual, most human voice possible. Sound like a supportive friend, not a professional or an AI. Skip the analytical framing entirely.`;
  }
  if (mode === 'business') {
    return `Voice: professional, polished, emotionally intelligent. Sound like a confident senior professional — composed, collegial, and clear. No contractions. No casual language. No slang. Every word should feel considered and deliberate. Examples of this voice: "Thank you for flagging this. I will ensure I align with you before proceeding on decisions of this nature." / "I appreciate you raising this. I will follow up with the relevant stakeholders and ensure we are aligned before moving forward."`;
  }
  return `Voice: casual, warm, real. Sound like a thoughtful person with high emotional intelligence talking to someone they like and respect — not a professional, not an AI. Contractions are fine. Conversational rhythm. Human warmth. Examples of this voice: "Hey, totally fair — I should've looped you in. Let's sync before the call." / "Makes sense, thanks for the heads up. I'll take a look and get back to you."`;
}

export function buildVoiceContext(samples, mode) {
  const relevant = (samples || [])
    .filter(s => s.mode === mode)
    .slice(-10)
    .map(s => s.text)
    .join('\n---\n');
  if (!relevant) return '';
  return `\nThe user's personal writing style — learn from these examples and match their voice:\n${relevant}`;
}

function buildSystem(mode, isSafePerson, linkedInContext, voiceContext, userContext = null) {
  const parts = [];

  if (userContext?.userIdentifier) {
    const { userIdentifier, participantList } = userContext;
    parts.push(
      `You are Beckett, a personal communication coach for ${userIdentifier}.\n\n` +
      `You are coaching ${userIdentifier} directly. Always refer to ${userIdentifier} as "you" — never in the third person. ` +
      `Never say "${userIdentifier} said" or "the user wrote" — always say "you said" or "you wrote". ` +
      `Identify every other person in the conversation by their name. ` +
      `Frame all analysis and advice directly to ${userIdentifier} in second person. ` +
      `In this conversation, you are talking with ${participantList}. ` +
      `Only reference people who actually appear in the thread. Never invent participants.`
    );
  } else {
    parts.push('You are Beckett, a personal communication coach for neurodivergent professionals. Decode workplace messages and draft responses that sound socially fluent and natural.');
  }

  parts.push(toneInstruction(mode, isSafePerson));

  parts.push(
    `Evidence rules: Only describe what is visible in the provided messages. ` +
    `Do not invent replies, reactions, comfort, agreement, intent, or relationship dynamics that are not shown. ` +
    `If someone has not responded to a message yet, say that directly instead of describing how they received it. ` +
    `When evidence is limited, use uncertainty language such as "I cannot tell yet" or "based only on what is visible."`
  );

  if (linkedInContext) {
    parts.push(`User professional context: ${linkedInContext}. Calibrate vocabulary, tone, and terminology to feel natural in their professional world.`);
  }
  if (voiceContext) parts.push(voiceContext);
  return parts.join('\n\n');
}

export function buildMessagePrompt({ messageText, thread, sender, platform, channelType, mode, linkedInContext, isSafePerson, voiceContext, currentUser }) {
  // Resolve the user's display name — prefer LinkedIn name, fall back to deriving from thread or email
  const userName = currentUser?.name ||
    (thread?.find(m => m.isCurrentUser)?.sender) ||
    (currentUser?.email ? currentUser.email.split('@')[0] : null);

  // Unique other participants from thread (non-user, non-Unknown senders)
  const otherParticipants = [
    ...new Set(
      (thread?.length ? thread : [])
        .filter(m => !m.isCurrentUser)
        .map(m => m.sender)
        .filter(s => s && s !== 'Unknown')
    ),
  ];
  if (!otherParticipants.length && sender && sender !== 'Unknown') otherParticipants.push(sender);

  const participantList = otherParticipants.join(' and ') || 'someone';
  const userIdentifier = userName || null;
  const userContext = userIdentifier
    ? { userIdentifier, userEmail: currentUser?.email || '', participantList }
    : null;

  const system = buildSystem(mode, isSafePerson, mode === 'business' ? linkedInContext : null, voiceContext || '', userContext);

  const userLabel = userIdentifier ? `${userIdentifier} (you)` : 'you';
  const contextBlock = thread?.length > 1
    ? `Full conversation thread (${thread.length} messages, oldest to newest):\n${thread.map(m => `[${m.sender}]${m.isCurrentUser ? ` (${userLabel})` : ''}: ${m.body || m.text}`).join('\n\n')}`
    : `Message received:\n"${messageText}"`;

  const anchor = userIdentifier
    ? `In this conversation, ${userIdentifier} is talking with ${participantList}.\n\n`
    : '';

  const user = `Platform: ${platform} | Sender: ${sender || 'unknown'} | Channel: ${channelType || 'unknown'} | Mode: ${mode}

${anchor}${contextBlock}

Use the full thread when it is present. If the answer depends on earlier messages, look there before saying you cannot tell.
Only use evidence from messages that actually appear in the thread. Do not infer that someone "rolled with," accepted, ignored, liked, disliked, or responded well to a message unless a later visible message from that person supports it.
If the latest message has not received a reply yet, say there is no response yet rather than analyzing the other person's reaction.
Keep every section concise and scannable.
Each analysis field may use 1-3 short newline-separated bullets. Do not include count labels or meta labels.

Respond ONLY with valid JSON, no markdown:
{
  "intent": "- what ${participantList} likely means or wants — address this directly to you",
  "tone": "- the emotional tone — frustration, urgency, passive aggression, warmth, neutrality, etc.",
  "want": "- what ${participantList} probably wants you to do or say next",
  "responses": [
    { "label": "Direct and clear", "tag": "direct", "text": "ready-to-send reply, max 35 words" },
    { "label": "Warm and collaborative", "tag": "warm", "text": "ready-to-send reply, max 35 words" },
    { "label": "Sets a gentle limit", "tag": "boundary", "text": "ready-to-send reply, max 35 words" }
  ]
}`;

  return { system, user };
}

export function buildMeetingPrompt({ transcript, meetingType, mode, linkedInContext }) {
  const system = buildSystem(mode, false, mode === 'business' ? linkedInContext : null, '');

  const user = `Meeting type: ${meetingType || 'video call'} | Mode: ${mode}

Recent transcript (last 60 seconds):
"${transcript}"

Respond ONLY with valid JSON, no markdown:
{
  "happening": "What is happening right now — social dynamics, subtext, what the speaker actually means. 2 sentences.",
  "emotion": "Emotional undercurrent in the room. 1-2 sentences.",
  "suggestion": "A specific thing the user could say right now. Should sound completely natural. 1-2 sentences.",
  "tips": "1-2 brief things to keep in mind for the rest of this conversation."
}`;

  return { system, user };
}

export function buildDraftFromScratchPrompt({ intent, recipientType, channel, mode, linkedInContext, isSafePerson, voiceContext }) {
  const system = buildSystem(mode, isSafePerson, mode === 'business' ? linkedInContext : null, voiceContext || '');

  const user = `What they want to communicate: "${intent}"
Sending to: ${recipientType}
Via: ${channel}

Write one complete, ready-to-send message. Do not explain it. Do not offer alternatives. Just write the message. It must sound completely natural and human — not like it was written by an AI.`;

  return { system, user };
}

export function buildMeetingBriefPrompt({ meetingTitle, attendees, recentThreads, mode }) {
  const toneNote = mode === 'business'
    ? 'Professional and concise. Bullet points are fine here.'
    : 'Warm and practical. Keep it conversational.';

  const system = `You are Beckett. Generate a pre-meeting brief for the user.\n${toneNote}`;

  const user = `Meeting: "${meetingTitle}"
Attendees: ${(attendees || []).join(', ')}

Recent context with these people:
${recentThreads || 'No recent email context found.'}

Produce a brief with three sections:
1. Quick context (1-2 sentences per attendee — any recent tension, pending items, or relevant history)
2. Suggested talking points (3-5 bullet points)
3. One thing to watch for (tone, dynamics, or unresolved issues)

Keep the whole brief under 200 words. Be specific, not generic.`;

  return { system, user };
}

export function buildDebriefPrompt({ transcript, meetingTitle, attendees, mode }) {
  const toneNote = mode === 'business'
    ? 'Professional, constructive, direct.'
    : 'Warm, honest, supportive.';

  const system = `You are Beckett. The user just finished a meeting and wants a quick debrief.\n${toneNote}`;

  const user = `Meeting: "${meetingTitle || 'Meeting'}"
Attendees: ${attendees || 'unknown'}

Transcript:
"${transcript}"

Produce a debrief with:
1. What went well (1-2 specific things from the transcript)
2. One moment to handle differently next time (specific, constructive, not harsh)
3. A ready-to-send follow-up message to the group or primary attendee

Keep it under 150 words total. Be specific to what actually happened — do not be generic.`;

  return { system, user };
}

export function buildPracticeSystemPrompt({ personDescription, situation, goal, contactHistory }) {
  return `You are playing the role of ${personDescription} in a practice conversation.
The user is preparing to have this real conversation: "${situation}"
Their goal: "${goal}"
${contactHistory ? 'Recent context: ' + contactHistory : ''}

Stay in character throughout. Respond as this person realistically would — including appropriate resistance, questions, or emotional reactions. Do not be artificially easy or artificially difficult. Be realistic.
After 6-8 exchanges, offer to break character and give feedback on how the conversation went.`;
}

export function buildPracticeDebriefPrompt({ personDescription, situation, goal, conversationHistory }) {
  const system = 'You are Beckett, giving honest feedback after a practice conversation.';

  const user = `You were just playing the role of ${personDescription} in a practice conversation.
The situation: "${situation}"
The user's goal: "${goal}"

Here is the conversation that just happened:
${conversationHistory}

Now break character completely. Give the user honest, constructive feedback:
1. What landed well (1-2 specific moments)
2. One thing to rephrase (be specific — quote what they said and suggest an alternative)
3. One alternative approach they could try

Keep it under 150 words. Be honest but encouraging.`;

  return { system, user };
}
