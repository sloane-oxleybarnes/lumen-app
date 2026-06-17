// ── Types ──────────────────────────────────────────────────────────────────

export type AccordionSlide = {
  type: 'accordion'
  title: string
  description?: string
  sections: { heading: string; bullets: string[]; optional?: boolean }[]
}

export type ReadThroughSlide = {
  type: 'read-through'
  title: string
  description?: string
  intro?: string
  bullets?: string[]
  stats?: string[]
}

export type FlipCardsSlide = {
  type: 'flip-cards'
  title: string
  description?: string
  cards: { front: string; back: string[] }[]
}

export type MatchingPair = {
  left: { name: string; description: string; mismatchNote?: string }
  right: { name: string; description: string }
}

export type MatchingSlide = {
  type: 'matching'
  title: string
  description?: string
  instruction: string
  leftLabel?: string
  rightLabel?: string
  hideCardNames?: boolean
  neutralChecked?: boolean
  pairs: MatchingPair[]
}

export type InteractiveReadSlide = {
  type: 'interactive-read'
  title: string
  description?: string
  sections: { heading: string; bullets: string[]; examples?: string[] }[]
  draftPrompt?: string
  draftContext?: string
  comparison?: {
    scenario: string
    good: { label: string; message: string; note: string }
    bad: { label: string; message: string; note: string }
  }
}

export type DraftPracticeSlide = {
  type: 'draft-practice'
  title: string
  prompt: string
  draftContext: string
}

export type SideBySideSlide = {
  type: 'side-by-side'
  title: string
  description?: string
  scenario: string
  good: { label: string; message: string; note: string }
  bad: { label: string; message: string; note: string }
}

export type SortingItem = { message: string; correct: string; explanation: string }
export type SortingSlide = {
  type: 'sorting'
  title: string
  description?: string
  instruction: string
  categories: string[]
  items: SortingItem[]
}

export type MCOption = { text: string; correct: boolean; explanation: string }
export type MCRound = { scenario: string; options: MCOption[] }
export type MultipleChoiceSlide = {
  type: 'multiple-choice'
  title: string
  description?: string
  helperChecklist?: string[]
  compactHelper?: boolean
  suppressDoneScreen?: boolean
  rounds: MCRound[]
}

export type MultiSelectOption = { text: string; correct: boolean }
export type MultiSelectRound = { scenario: string; question: string; options: MultiSelectOption[]; explanation: string }
export type MultiSelectQuizSlide = {
  type: 'multi-select-quiz'
  title: string
  description?: string
  formulaStep?: number
  shuffleOptions?: boolean
  suppressDoneScreen?: boolean
  rounds: MultiSelectRound[]
}

export type ChecklistSlide = {
  type: 'checklist'
  title: string
  items: string[]
}

export type VisualFormulaSlide = {
  type: 'visual-formula'
  title: string
  description?: string
  activeStep?: number
  steps: { label: string; text: string; example?: string }[]
}

export type ReflectionChoiceSlide = {
  type: 'reflection-choice'
  title: string
  description?: string
  prompt: string
  options: string[]
  multi?: boolean
}

export type GuidedBuilderField = {
  key: string
  label: string
  placeholder?: string
  options?: string[]
  multi?: boolean
}

export type GuidedBuilderOutput = {
  label: string
  category: string
  template: string
}

export type GuidedBuilderSlide = {
  type: 'guided-builder'
  title: string
  description?: string
  fields: GuidedBuilderField[]
  outputs: GuidedBuilderOutput[]
  saveLabel?: string
}

export type CourseSlide =
  | AccordionSlide
  | ReadThroughSlide
  | FlipCardsSlide
  | MatchingSlide
  | InteractiveReadSlide
  | DraftPracticeSlide
  | SideBySideSlide
  | SortingSlide
  | MultipleChoiceSlide
  | MultiSelectQuizSlide
  | ChecklistSlide
  | VisualFormulaSlide
  | ReflectionChoiceSlide
  | GuidedBuilderSlide

export type OpenPracticeConfig = {
  matchName: string
  matchDescription: string
  systemPrompt: string
  practiceKind?: 'dating' | 'workplace'
  channel?: 'dating' | 'slack' | 'chat'
  subtitle?: string
  goal: string
  helperChecklist?: string[]
  contextPanel?: { title: string; items: string[] }
  starterMessages?: { role: 'user' | 'assistant'; content: string; timestamp?: string }[]
  starterOptions?: string[]
  userStarts?: boolean
}

export type Course = {
  id: string
  title: string
  description: string
  estimatedMinutes: number
  confidenceQuestion: string
  confidenceIntro: string
  reflectiveQuestion: string
  slides: CourseSlide[]
  openPractice: OpenPracticeConfig
  reviewWrongAnswers: boolean
  reviewConversationTurns: number
  savesToToolkit?: boolean
  reviewSummary?: {
    title: string
    description: string
    formulas?: { label: string; text: string }[]
    checklist?: string[]
  }
}

// ── Asking Someone Out ─────────────────────────────────────────────────────

const askSomeoneOut: Course = {
  id: 'ask-someone-out',
  title: 'Asking Someone Out on a Date',
  description: 'A Personal Preview course where Beckett helps you decide if someone feels worth asking out, then build a clear, respectful first-date ask.',
  estimatedMinutes: 35,
  confidenceQuestion: 'How confident do you feel asking someone out clearly and respectfully?',
  confidenceIntro: 'This Personal Preview course is about dating: noticing whether someone seems like a good fit, avoiding common first-date traps, and asking for one concrete next step without pressure.',
  reflectiveQuestion: 'Your asking-out phrases are saved in your Communication toolkit.',
  reviewWrongAnswers: true,
  reviewConversationTurns: 4,
  openPractice: {
    matchName: 'Jamie',
    matchDescription: 'a dating app match you have been chatting with about music and weekend plans',
    practiceKind: 'dating',
    channel: 'dating',
    subtitle: 'Dating app match - chatted yesterday',
    goal: 'Use one of your saved ask styles or draft your own. The goal is a clear, low-pressure first-date ask.',
    starterMessages: [
      { role: 'assistant', content: 'Still laughing that you had a whole ranking system for coffee shops.', timestamp: 'Yesterday' },
      { role: 'user', content: 'It is extremely scientific. Vibes, noise level, and whether the chairs are hostile.', timestamp: 'Yesterday' },
      { role: 'assistant', content: 'Hostile chairs is so real. I respect the research.', timestamp: 'Yesterday' },
      { role: 'assistant', content: 'Anyway, hope your day is less chaotic than mine was.', timestamp: 'Today' },
    ],
    starterOptions: [
      'I have a very low-hostility coffee shop in mind if you want to test the ranking this weekend.',
      'I like talking with you. Would you want to grab coffee this weekend? No pressure if not.',
      'Would you want to do a quick video call first and see if meeting up feels good?',
    ],
    systemPrompt: `You are Jamie, chatting on a dating app. You talked yesterday about music, weekend plans, and coffee shops. You are interested but cautious.

Keep messages short and realistic. If the user asks clearly, warmly, and without pressure, respond positively. If the user is vague, ask one simple clarifying question. If the user is pushy, sexual, guilt-trippy, or ignores hesitation, become less engaged and eventually stop responding.

Never break character. You are Jamie, not Beckett.`,
  },
  slides: [
    {
      type: 'interactive-read',
      title: 'Asking Someone Out on a Date',
      description: 'This course is about moving from interest to one respectful next step.',
      sections: [
        {
          heading: 'What you are practicing',
          bullets: [
            'Not becoming smoother or more charming.',
            'Not forcing certainty from a vague conversation.',
            'Asking someone you are interested in for a specific, low-pressure first meetup.',
          ],
        },
        {
          heading: 'The goal',
          bullets: [
            'Figure out whether this person seems like a good fit to ask.',
            'Choose a first-date option that feels safe and realistic.',
            'Write an ask that is clear enough to answer.',
          ],
        },
      ],
    },
    {
      type: 'flip-cards',
      title: 'Dating Strengths Neurodivergent People May Bring',
      description: 'These are general strengths, not Beckett assuming they are all true for you.',
      cards: [
        { front: 'Honesty', back: ['Saying what you mean can build trust.', 'Clear interest is often kinder than vague hints.'] },
        { front: 'Depth', back: ['You may be good at real conversation once the surface layer passes.', 'Depth is a strength when it is paced.'] },
        { front: 'Pattern noticing', back: ['You may notice consistency, effort, or mismatch over time.', 'Beckett helps you sort signal from anxiety.'] },
        { front: 'Loyalty', back: ['Strong care can be beautiful.', 'The skill is pacing care before there is mutual trust.'] },
      ],
    },
    {
      type: 'accordion',
      title: 'Why Dating Can Feel Hard',
      description: 'Open each pattern. Beckett will use these later when you practice.',
      sections: [
        { heading: 'Unclear signals', bullets: ['Text removes tone, facial expression, and timing context.', 'Slow replies can mean many things, not just rejection.'] },
        { heading: 'Rejection sensitivity', bullets: ['A simple ask can feel like a whole verdict on your worth.', 'The course treats a no as information, not proof that you failed.'] },
        { heading: 'Pacing new interest', bullets: ['Real excitement can become too much too fast.', 'The goal is warm interest plus one next step.'] },
        { heading: 'Masking and over-editing', bullets: ['Trying to sound effortless can drain you.', 'Prepared language is not fake; it is support.'] },
        { heading: 'Safety and sensory load', bullets: ['First meetups work better in public, lower-pressure places.', 'Choose a setting where you can hear, regulate, and leave easily.'] },
      ],
    },
    {
      type: 'flip-cards',
      title: 'Is This Person A Good Fit To Ask Out?',
      description: 'Before wording the ask, check whether the connection seems worth moving forward.',
      cards: [
        { front: 'Green flags', back: ['They make consistent effort.', 'They ask questions back.', 'They respect pacing.', 'They make concrete plans easier, not harder.'] },
        { front: 'Compatibility signs', back: ['Some overlap in routines or interests.', 'A communication style that does not make you feel constantly unsafe.', 'Similar availability for dating right now.'] },
        { front: 'Reasons to pause', back: ['They pressure you for photos or private information.', 'They ignore boundaries.', 'They leave you carrying the entire conversation.'] },
      ],
    },
    {
      type: 'matching',
      title: 'Reading Compatibility In Practice',
      description: 'These are intentionally simpler than a real person. Look for the clearest fit.',
      instruction: 'Match each person to the best fit.',
      leftLabel: 'Person',
      rightLabel: 'Best fit',
      pairs: [
        {
          left: { name: 'Maya', description: 'Quiet, likes slow plans, prefers text first.', mismatchNote: 'Maya needs someone patient and low-pressure.' },
          right: { name: 'Alex', description: 'Also quiet, likes simple coffee plans, does not need constant texting.' },
        },
        {
          left: { name: 'Jordan', description: 'Direct, busy schedule, wants someone emotionally clear.', mismatchNote: 'Jordan needs direct communication and flexibility.' },
          right: { name: 'Sam', description: 'Direct, flexible, comfortable planning around work schedules.' },
        },
        {
          left: { name: 'Dani', description: 'Values family, stability, and clear intentions.', mismatchNote: 'Dani needs someone who wants the same kind of steadiness.' },
          right: { name: 'Priya', description: 'Close to family, clear about dating seriously, likes stable routines.' },
        },
      ],
    },
    {
      type: 'read-through',
      title: 'Online Dating Reality Checks',
      intro: 'A few basics make the rest of this course safer and less confusing.',
      bullets: [
        'Tone is harder to read over text, so clear words matter.',
        'You never owe photos, private information, or a fast meetup.',
        'Assume anything you send can be screenshotted.',
        'First meetings should be public and easy to leave.',
        'A quick video call first is a reasonable option.',
        'Dating apps can be draining; it is okay to limit conversations and take breaks.',
      ],
    },
    {
      type: 'flip-cards',
      title: 'What Tends To Go Wrong',
      cards: [
        { front: 'Too vague', back: ['"We should hang out sometime" gives them nothing concrete to answer.', 'Clear is kinder than making them guess.'] },
        { front: 'Too intense', back: ['Heavy feelings too early can make the other person responsible for reassuring you.', 'Pacing protects both people.'] },
        { front: 'Too unsafe or stressful', back: ['A home invite is too much for a first app meetup.', 'Loud or crowded settings can make connection harder.'] },
        { front: 'Too much pressure', back: ['Guilt, urgency, or fear-of-loss language makes a yes less freely given.', 'No pressure should be real, not just a phrase.'] },
      ],
    },
    {
      type: 'visual-formula',
      title: 'The Clear Ask Formula',
      description: 'Use this when you want to ask for a first date.',
      steps: [
        { label: 'Warm signal', text: 'Name the connection or thing you enjoyed.', example: 'I have liked talking with you about music.' },
        { label: 'Specific plan', text: 'Suggest one concrete public plan.', example: 'Would you want to grab coffee Saturday afternoon?' },
        { label: 'Easy out', text: 'Make it clear they can say no.', example: 'No pressure if not.' },
      ],
    },
    {
      type: 'multiple-choice',
      title: 'Pick The Clear Ask',
      rounds: [
        {
          scenario: 'You have been chatting for a few days about music. Which is the clearest first-date ask?',
          options: [
            { text: '"We should hang sometime if you ever want."', correct: false, explanation: 'Too vague; there is no concrete plan.' },
            { text: '"I have liked talking music with you. Want to grab coffee Saturday afternoon? No pressure if not."', correct: true, explanation: 'Warm, specific, and low-pressure.' },
            { text: '"I feel like this could be something really rare and I need to know if you feel that too."', correct: false, explanation: 'Too intense for an early app conversation.' },
          ],
        },
        {
          scenario: 'You want a lower-pressure first step than meeting in person.',
          options: [
            { text: '"Would you want to do a quick video call first and see if meeting up feels good?"', correct: true, explanation: 'Specific and paced.' },
            { text: '"You probably do not want to meet anyway, right?"', correct: false, explanation: 'This asks them to manage your anxiety.' },
            { text: '"Let me know what you want to do."', correct: false, explanation: 'Too vague and puts all planning on them.' },
          ],
        },
      ],
    },
    {
      type: 'sorting',
      title: 'Sort These First-Date Asks',
      instruction: 'Context: you matched on a dating app, chatted for three days, and this would be your first meetup.',
      categories: ['Too vague', 'Too intense', 'Balanced'],
      items: [
        { message: '"We should hang out sometime."', correct: 'Too vague', explanation: 'No plan, time, or clear next step.' },
        { message: '"Would you want to grab coffee this Saturday at the quiet place near the park?"', correct: 'Balanced', explanation: 'Specific and realistic for a first meetup.' },
        { message: '"You should come over and I will cook."', correct: 'Too intense', explanation: 'Too private for a first app meetup.' },
        { message: '"I like talking with you. Want to do a short video call before we plan anything?"', correct: 'Balanced', explanation: 'Clear, paced, and safe.' },
        { message: '"I would hate for this to fade, so can we please meet?"', correct: 'Too intense', explanation: 'Fear-of-loss language adds pressure.' },
      ],
    },
    {
      type: 'guided-builder',
      title: 'Build Your Ask',
      description: 'Create a few versions you could actually use. Beckett will save them to your Communication toolkit.',
      fields: [
        { key: 'connection', label: 'What have you enjoyed?', placeholder: 'talking with you about music', options: ['talking with you', 'our coffee shop debate', 'your sense of humor', 'how easy this conversation has felt'] },
        { key: 'plan', label: 'What kind of first step feels right?', placeholder: 'grab coffee Saturday afternoon', options: ['grab coffee this weekend', 'go for a walk Saturday', 'try a low-key bookstore cafe', 'do a quick video call first'] },
        { key: 'pressure', label: 'How do you want to keep it low pressure?', placeholder: 'No pressure if not', options: ['No pressure if not', 'Totally okay if you would rather keep chatting', 'Only if that feels good to you'] },
      ],
      outputs: [
        { label: 'Direct ask', category: 'dating_ask', template: 'I have liked {connection}. Would you want to {plan}? {pressure}.' },
        { label: 'Warm ask', category: 'dating_ask', template: 'I have really enjoyed {connection}. I would be up for {plan} if you are. {pressure}.' },
      ],
      saveLabel: 'Save asks and continue →',
    },
  ],
}

// ── Introducing Yourself To A New Colleague ────────────────────────────────

const introducingNewColleague: Course = {
  id: 'introducing-new-colleague',
  title: 'Introducing Yourself to a New Colleague',
  description: 'A workplace course where Beckett helps you introduce yourself clearly, warmly, and usefully without overexplaining.',
  estimatedMinutes: 35,
  confidenceQuestion: 'How confident do you feel introducing yourself to a new colleague?',
  confidenceIntro: 'In this course, Beckett will help you build introductions you can reuse when a new colleague joins your work world.',
  reflectiveQuestion: 'Your intro phrases are saved in your Communication toolkit.',
  reviewWrongAnswers: true,
  reviewConversationTurns: 4,
  openPractice: {
    matchName: 'Maya',
    matchDescription: 'a new cross-functional colleague joining your project',
    practiceKind: 'workplace',
    channel: 'slack',
    subtitle: 'Slack DM - new colleague',
    goal: 'Introduce yourself, give Maya useful context, and make the next collaboration step clear.',
    starterMessages: [
      { role: 'assistant', content: 'Hi! I am Maya - Jordan said we will both be on the beta onboarding work.', timestamp: '9:42 AM' },
      { role: 'assistant', content: 'Wanted to say hi before I jump into the project doc.', timestamp: '9:43 AM' },
    ],
    starterOptions: [
      'Hi Maya, I am Sloane. I am working on the onboarding flow and I am usually helpful with organizing messy pieces.',
      'Hi Maya, nice to meet you. I am on the beta onboarding side and I do best with clear owners and written next steps.',
    ],
    systemPrompt: `You are Maya, a friendly but busy cross-functional colleague in Slack. You just joined a beta onboarding project.

If the user introduces themselves clearly, respond warmly and ask one practical follow-up. If they are vague, ask what part of the project they own. If they overshare or apologize heavily, stay kind and redirect to collaboration.

Never break character. You are Maya, not Beckett.`,
  },
  slides: [
    {
      type: 'accordion',
      title: 'What A Good Intro Actually Does',
      description: 'An intro is not a performance. Open each piece to see what it gives the other person.',
      sections: [
        { heading: 'Who you are', bullets: ['A name and role gives the other person somewhere to place you.'] },
        { heading: 'Why you are connected', bullets: ['Name the project, team, or reason you are in the same work world.'] },
        { heading: 'What you bring', bullets: ['A useful strength or work style helps them collaborate with you.'] },
        { heading: 'What happens next', bullets: ['A simple next step keeps the intro from becoming awkwardly open-ended.'] },
      ],
    },
    {
      type: 'side-by-side',
      title: 'Spot The Difference',
      scenario: 'You are introducing yourself to Maya, a new colleague on your project.',
      bad: { label: 'Too little', message: 'Hi, nice to meet you.', note: 'Polite, but it gives almost no work context.' },
      good: { label: 'Better', message: 'Hi Maya, I am Sloane. I am working on the beta onboarding flow and usually help organize messy pieces into clear next steps.', note: 'Clear identity, context, and useful collaboration signal.' },
    },
    {
      type: 'reflection-choice',
      title: 'Strengths You Bring To Work',
      description: 'Pick what feels true. You can also type your own in the next builder.',
      prompt: 'Which strengths do you want a new colleague to understand about you?',
      multi: true,
      options: ['Organizing messy information', 'Spotting user confusion', 'Deep focus', 'Direct communication', 'Creative problem-solving', 'Careful follow-through'],
    },
    {
      type: 'sorting',
      title: 'Warmth Without Overdoing It',
      instruction: 'Sort each intro line by the signal it sends.',
      categories: ['Too cold', 'Too much', 'Balanced'],
      items: [
        { message: '"I work on onboarding."', correct: 'Too cold', explanation: 'Technically useful, but not very connective.' },
        { message: '"I promise I am easy to work with once you get to know me!"', correct: 'Too much', explanation: 'It asks the other person to reassure you before they know you.' },
        { message: '"I am excited to work together and can help with the onboarding flow context."', correct: 'Balanced', explanation: 'Warm and useful without overselling.' },
      ],
    },
    {
      type: 'reflection-choice',
      title: 'How Do You Like To Collaborate?',
      description: 'This replaces a long explanation with practical choices you can use later.',
      prompt: 'What collaboration preferences would be useful for a colleague to know?',
      multi: true,
      options: ['Written context before meetings', 'Clear owners', 'Direct feedback', 'Time to process before responding', 'Shared docs over scattered messages', 'Explicit deadlines'],
    },
    {
      type: 'matching',
      title: 'Translate The Preference',
      instruction: 'Match each initial thought with a work-ready version.',
      leftLabel: 'Initial thought',
      rightLabel: 'Work version',
      pairs: [
        {
          left: { name: 'Processing time', description: 'I freeze when people ask me questions live.', mismatchNote: 'Look for the version that makes processing time sound useful and professional.' },
          right: { name: 'Work version', description: 'I usually give better answers when I can think for a few minutes and follow up in writing.' },
        },
        {
          left: { name: 'Directness', description: 'Please do not make me guess what you mean.', mismatchNote: 'Look for the version that asks for direct feedback without sounding annoyed.' },
          right: { name: 'Work version', description: 'Direct feedback is easiest for me to act on, especially when the priority is clear.' },
        },
        {
          left: { name: 'Context', description: 'I need the whole story or I will miss something.', mismatchNote: 'Look for the version that asks for context before action.' },
          right: { name: 'Work version', description: 'A little context up front helps me avoid rework and move faster.' },
        },
      ],
    },
    {
      type: 'flip-cards',
      title: 'What Can Go Wrong',
      description: 'Common intro traps and how Beckett will steer you around them.',
      cards: [
        { front: 'Too vague', back: ['The other person does not know what you do or why you are reaching out.'] },
        { front: 'Too apologetic', back: ['You spend more time softening yourself than giving useful context.'] },
        { front: 'Too much personal context', back: ['You disclose things that do not need to be part of a first work intro.'] },
      ],
    },
    {
      type: 'visual-formula',
      title: 'The Intro Formula',
      description: 'Use this before you build your own versions.',
      steps: [
        { label: 'Name + role', text: 'Say who you are and where you fit.', example: 'I am Sloane, and I am working on the onboarding flow.' },
        { label: 'Useful strength', text: 'Name one thing you bring to the work.', example: 'I am usually helpful with organizing messy pieces.' },
        { label: 'Collaboration cue', text: 'Share one preference or next step.', example: 'Written next steps help me stay aligned.' },
      ],
    },
    {
      type: 'guided-builder',
      title: 'Build Your Intro',
      description: 'Create a few versions. Beckett will save them to your Communication toolkit.',
      fields: [
        { key: 'role', label: 'What is your role or project context?', placeholder: 'working on the beta onboarding flow' },
        { key: 'strength', label: 'What strength do you want to include?', placeholder: 'organizing messy pieces', options: ['organizing messy pieces', 'spotting user confusion', 'turning ideas into next steps', 'careful follow-through'] },
        { key: 'preference', label: 'What collaboration preference helps?', placeholder: 'written next steps help me stay aligned', options: ['written next steps help me stay aligned', 'direct feedback is easiest for me', 'I do best when owners are clear'] },
      ],
      outputs: [
        { label: 'Direct intro', category: 'new_colleague_intro', template: 'Hi, I am Sloane. I am {role}. I am usually helpful with {strength}, and {preference}.' },
        { label: 'Warm intro', category: 'new_colleague_intro', template: 'Hi, nice to meet you. I am Sloane, and I am {role}. I am excited to work together - I am usually helpful with {strength}.' },
        { label: 'Collaboration preference', category: 'collaboration_preference', template: 'One thing that helps me collaborate well: {preference}.' },
      ],
      saveLabel: 'Save intro phrases and continue →',
    },
  ],
}

// ── Asking For Clarity ─────────────────────────────────────────────────────

const askingForClarity: Course = {
  id: 'asking-for-clarity',
  title: 'Asking for Clarity at Work',
  description: 'A workplace course where Beckett helps you ask specific follow-up questions without over-apologizing or pretending you understand.',
  estimatedMinutes: 45,
  confidenceQuestion: 'How confident do you feel asking for clarity at work?',
  confidenceIntro: 'In this course, Beckett will help you identify unclear work requests and then create specific clarifying questions you can ask.',
  reflectiveQuestion: 'You practiced the clarity formula: what I understand, what is unclear, the specific question, and why it helps.',
  reviewWrongAnswers: true,
  reviewConversationTurns: 4,
  savesToToolkit: false,
  reviewSummary: {
    title: 'Clarity formula review',
    description: 'Use this when a work request feels vague, rushed, or incomplete.',
    formulas: [
      { label: 'What I understand', text: 'Start with what you think is true so the other person can confirm or correct it.' },
      { label: 'What is unclear', text: 'Name the missing piece instead of saying the whole thing is confusing.' },
      { label: 'Specific question', text: 'Ask one answerable question, with options if that makes it easier.' },
      { label: 'Why it helps', text: 'Connect the answer to better work, prioritization, scope, or avoiding rework.' },
    ],
    checklist: [
      'I named what I understand',
      'I named the unclear part',
      'I asked one specific question',
      'I gave options if that makes answering easier',
      'I did not apologize for needing the information',
    ],
  },
  openPractice: {
    matchName: 'Jordan',
    matchDescription: 'a busy manager who gave you an unclear task',
    practiceKind: 'workplace',
    channel: 'slack',
    subtitle: 'Slack DM - vague work request',
    goal: 'Ask Jordan for the missing information you need before you start the work.',
    contextPanel: {
      title: 'What you already know',
      items: [
        'Jordan is your manager.',
        'The task is the onboarding flow.',
        'The team review is coming up.',
        'Jordan wants it in "better shape."',
        'The unclear part is what "clean up" means and what level of polish or scope is expected.',
      ],
    },
    starterMessages: [
      { role: 'assistant', content: 'Can you clean up the onboarding flow before the team review?', timestamp: '10:12 AM' },
      { role: 'assistant', content: 'Mainly just make sure it is in better shape.', timestamp: '10:12 AM' },
    ],
    systemPrompt: `You are Jordan, a busy but reasonable workplace manager in Slack. You gave the user a vague task: "Can you clean up the onboarding flow before the team review?"

If the user asks a clear clarifying question, answer it and give a useful next step. If the user is vague, ask what part they need clarified. If they over-apologize, respond kindly but keep the conversation focused on the task.

Never break character. You are Jordan, not Beckett.`,
  },
  slides: [
    {
      type: 'accordion',
      title: 'What Clarity Actually Is',
      description: 'Clarity is shared alignment, not needing extra help.\n\nAsking for clarity at work should be simple. But, for many neurodivergent people it is not — and there are very specific reasons why. This course covers what makes clarifying questions feel so loaded, how to identify exactly what information you are missing, how to ask in a way that is direct and confident, and how to leave the apology out of it entirely.',
      sections: [
        { heading: 'The goal', bullets: ['Make sure you are solving the right problem before you spend energy on it.'] },
        { heading: 'What can be unclear', bullets: ['Timeline (deadline & priority), definition of done, the audience and who the decision maker is.'] },
        { heading: 'The reframe', bullets: ['You are not bothering someone; you are preventing avoidable rework.'] },
      ],
    },
    {
      type: 'reflection-choice',
      title: 'Why Asking Can Feel Hard',
      description: 'Asking for clarification is harder than it should be. Not because the question is difficult, but because of everything that surrounds it: the worry that you should already know, the fear of sounding annoying, and the impulse to apologize before you ask.',
      prompt: 'What part tends to be hardest for you?',
      multi: true,
      options: [
        'Worrying that I should already know',
        'Not knowing what information I am missing',
        'Fear of sounding annoying',
        'Needing more specificity than others',
        'Knowing that I process spoken instructions slowly',
        'Feeling like I should apologize before I ask',
      ],
    },
    {
      type: 'side-by-side',
      title: 'Asking Without Over-Apologizing',
      description: 'Many neurodivergent people grow up feeling like their questions are a burden — being told to stop asking, to just figure it out, or that they should already know. If that sounds familiar, it makes sense that asking for help now feels like something you need to apologize for. It is not. Asking clarifying questions is not a weakness. It is one of the clearest, most direct ways to communicate — and that is something to be proud of. This section will help you notice when you are over-apologizing and give you tools to ask for what you need without shrinking yourself to do it.',
      scenario: '',
      bad: { label: 'Original version', message: 'Sorry, this is probably annoying, but can you explain what you meant by clean this up?', note: 'The apology makes the question feel heavier than it needs to be.' },
      good: { label: 'Improved version', message: 'Quick clarification: when you say clean this up, do you mean copy edits, structure, or both?', note: 'Specific, neutral, and easy to answer.' },
    },
    {
      type: 'matching',
      title: 'Rewrite The Apology',
      description: 'Time to practice. Match each over-apologetic question to a cleaner workplace version.',
      instruction: 'Tap an original, then tap the improved version.',
      leftLabel: 'Original',
      rightLabel: 'Improved',
      hideCardNames: true,
      neutralChecked: true,
      pairs: [
        { left: { name: 'Clean up', description: 'Sorry, this is probably annoying, but can you explain what you meant?', mismatchNote: 'Look for the version that asks what clean up means.' }, right: { name: 'Improved', description: 'Quick clarification: do you mean copy edits, structure, or both?' } },
        { left: { name: 'Deadline', description: 'Sorry if this is obvious, but when is this due?', mismatchNote: 'Look for the version that confirms deadline before prioritizing.' }, right: { name: 'Improved', description: 'I want to confirm the deadline before I prioritize this. Do you need it today or later this week?' } },
        { left: { name: 'Polish', description: 'I am probably overthinking this, but should I make this polished?', mismatchNote: 'Look for the version that asks rough versus polished.' }, right: { name: 'Improved', description: 'To avoid overbuilding it, should this be a rough internal draft or a polished version?' } },
        { left: { name: 'Owner', description: 'Sorry, who am I supposed to ask about this?', mismatchNote: 'Look for the version that asks who decides.' }, right: { name: 'Improved', description: 'Who should make the final call before I move this forward?' } },
        { left: { name: 'Context', description: 'Sorry, I feel like I missed something. What is this for?', mismatchNote: 'Look for the version that asks for background context.' }, right: { name: 'Improved', description: 'Is there background context or an example I should review before I start?' } },
      ],
    },
    {
      type: 'visual-formula',
      title: 'The Clarity Formula',
      description: 'Knowing you need clarification and knowing how to ask for it are two different things. This formula bridges that gap — giving your brain a clear structure to work from so the question feels less overwhelming and more like a tool you actually want to use.',
      steps: [
        { label: 'What I understand', text: 'Start with what you think is true.', example: 'I understand the goal is to clean up onboarding before review.' },
        { label: 'What is unclear', text: 'Name the missing piece.', example: 'I am not sure whether clean up means copy, structure, or both.' },
        { label: 'Specific question', text: 'Ask an answerable question.', example: 'Should I prioritize the signup steps or the handoff notes?' },
        { label: 'Why it helps', text: 'Connect it to better work.', example: 'That will help me avoid rework.' },
      ],
    },
    {
      type: 'flip-cards',
      title: 'What Kind Of Clarity Do You Need?',
      description: 'Tap each card to see what the question is really asking for.',
      cards: [
        { front: 'Timeline', back: ['When is this task due and how should I prioritize it?', 'Example: Do you need this today or before Friday?'] },
        { front: 'Definition of done', back: ['What does finished mean?', 'Examples: Do you mean copy edits, structure, or both? Should this be rough, clean, or ready to send?'] },
        { front: 'Audience', back: ['Who is this for: internal team, leadership, or beta users?', 'Example: Will this be an internal or external-facing document?'] },
        { front: 'Decision maker', back: ['Who needs to approve the final version?', 'Example: Will this be reviewed by the team or should I send it to someone specific?'] },
      ],
    },
    {
      type: 'multi-select-quiz',
      title: 'Step 1 - What Do I Know?',
      description: 'The first step in the Clarity Formula is identifying what you already know. Say what you think is true. It anchors the question, shows you have been listening, and gives the other person a clear starting point to correct or confirm.',
      formulaStep: 1,
      shuffleOptions: true,
      suppressDoneScreen: true,
      rounds: [
        {
          scenario: 'Message from Jordan, your manager: "Hey - can you take a look at the onboarding doc and clean it up before the team review on Thursday?"',
          question: 'What do you already know from this message? Select all that apply.',
          options: [
            { text: 'There is a team review happening on Thursday', correct: true },
            { text: 'The onboarding doc is the one that needs work', correct: true },
            { text: 'The work needs to be done before Thursday', correct: true },
            { text: 'What clean it up means', correct: false },
            { text: 'How polished the final version needs to be', correct: false },
            { text: 'Whether to focus on copy, structure, or both', correct: false },
            { text: 'Whether anyone else is also working on the doc', correct: false },
          ],
          explanation: 'You know the document, the deadline, and the event it is for. What is missing is the definition of done.',
        },
        {
          scenario: 'Slack message from a teammate: "Can you take over the client email for the Halford account? I have a conflict this afternoon."',
          question: 'What do you already know from this message? Select all that apply.',
          options: [
            { text: 'There is a client email that needs to be sent', correct: true },
            { text: 'Your teammate cannot handle it this afternoon', correct: true },
            { text: 'The account is Halford', correct: true },
            { text: 'When the email needs to go out', correct: false },
            { text: 'What the email should say or what the goal is', correct: false },
            { text: 'Whether there is a draft already started', correct: false },
            { text: 'Who the email is going to', correct: false },
          ],
          explanation: 'You know what needs doing and why your teammate cannot do it. What is missing is the timing, content, audience, and whether there is a draft.',
        },
        {
          scenario: 'Email from a senior colleague: "I would love your input on the new process doc before it goes to leadership. Let me know what you think when you get a chance."',
          question: 'What do you already know from this message? Select all that apply.',
          options: [
            { text: 'There is a process doc that is being finalized', correct: true },
            { text: 'It is going to leadership at some point', correct: true },
            { text: 'They want your input before it goes out', correct: true },
            { text: 'What kind of feedback they are looking for', correct: false },
            { text: 'How detailed or thorough your review should be', correct: false },
            { text: 'When they need your response by', correct: false },
            { text: 'Whether this is urgent or low priority', correct: false },
          ],
          explanation: 'You know the document exists, where it is headed, and that your input is wanted. The missing parts are timeline and scope.',
        },
      ],
    },
    {
      type: 'multiple-choice',
      title: 'Step 2 - What Information Is Missing?',
      description: 'Step 2 of the Clarity formula is to identify the missing information. Not everything that feels unclear actually is — usually there is one specific piece of missing information that is creating the confusion. Name that, and the question almost writes itself.',
      suppressDoneScreen: true,
      rounds: [
        {
          scenario: 'Your manager says, "Can you clean up the onboarding doc?" What important information is missing?',
          options: [
            { text: 'Definition of done: what clean up means', correct: true, explanation: 'You need to know whether this means copy, structure, polish, or all of it.' },
            { text: 'The order you should tackle each section', correct: false, explanation: 'Order may matter later, but first you need to know what clean up means.' },
            { text: 'Whether to send it when you are done or wait for a review meeting', correct: false, explanation: 'That is useful later, but it does not resolve the core unclear phrase.' },
          ],
        },
        {
          scenario: 'A teammate says, "Can you help with the launch issue?" What information is most missing?',
          options: [
            { text: 'Ownership and urgency', correct: true, explanation: 'You need to know what part they want you to own and whether this is urgent.' },
            { text: 'Whether this is related to the bug reported last week', correct: false, explanation: 'Maybe, but first you need to know what they need from you and how urgent it is.' },
            { text: 'Who else is already working on it', correct: false, explanation: 'Helpful context, but not the most important missing information.' },
          ],
        },
        {
          scenario: 'Your skip-level manager says, "Can you take a look at the new process doc and let me know what you think?" What is the most important missing information?',
          options: [
            { text: 'Scope and purpose', correct: true, explanation: '"Let me know what you think" could mean a gut reaction, line edit, or strategic critique.' },
            { text: 'Whether they wrote the doc themselves or inherited it', correct: false, explanation: 'That might affect tone, but it does not tell you what kind of input they need.' },
            { text: 'How long the doc is and whether you have time to read it today', correct: false, explanation: 'Time matters, but the first question is what kind of review they want.' },
          ],
        },
      ],
    },
    {
      type: 'sorting',
      title: 'Step 3 - Asking Specific Questions',
      description: 'The third step in the Clarity Formula is making sure the questions you ask are specific and not vague. A question like "can you clarify?" puts the work back on them. A question like "do you mean copy edits, structure, or both?" gives them something to respond to immediately — and gets you what you need faster.',
      instruction: 'Sort each message by what kind of clarity question it is.',
      categories: ['Strong clarity question', 'Too vague', 'Too apologetic'],
      items: [
        { message: 'Can you clarify?', correct: 'Too vague', explanation: 'It does not say what part needs clarification.' },
        { message: 'When you say urgent, do you mean today or before Friday?', correct: 'Strong clarity question', explanation: 'Names the unclear word and gives two answerable options.' },
        { message: 'Sorry, I know this is probably obvious, but I am confused about what you want.', correct: 'Too apologetic', explanation: 'The apology takes up more space than the question.' },
        { message: 'Should I focus first on the headline copy or the form steps?', correct: 'Strong clarity question', explanation: 'Specific and easy to answer.' },
      ],
    },
    {
      type: 'sorting',
      title: 'Step 4 - Why This Helps You',
      description: 'The last step in the Clarity Formula is explaining why this information is important. Explaining why the information matters — even in one sentence — turns a question into a reason. It signals that you are not asking for the sake of asking. You are asking because it will make the outcome better. That changes how it lands.',
      instruction: 'Choose whether each closing line connects the question to the work.',
      categories: ['Connects to the work', 'Does not connect to the work'],
      items: [
        { message: 'That will help me avoid redoing it after the review.', correct: 'Connects to the work', explanation: 'It names a specific outcome that benefits the project.' },
        { message: 'I just want to make sure I am not doing it wrong.', correct: 'Does not connect to the work', explanation: 'This centers personal anxiety rather than the task outcome.' },
        { message: 'That will help me prioritize correctly before I start.', correct: 'Connects to the work', explanation: 'It links the clarification to a decision that affects the work.' },
        { message: 'I always get confused by this kind of thing.', correct: 'Does not connect to the work', explanation: 'This explains a pattern rather than connecting the question to the task.' },
        { message: 'Knowing this will help me scope the work accurately before the deadline.', correct: 'Connects to the work', explanation: 'It connects the missing information to accurate scoping.' },
        { message: 'I just do not want to get it wrong and have to redo everything.', correct: 'Does not connect to the work', explanation: 'The concern is valid, but the framing centers fear of failure.' },
        { message: 'That will help me make sure the output is at the right level before I hand it off.', correct: 'Connects to the work', explanation: 'It names a concrete work checkpoint.' },
        { message: 'I feel like I missed something in the briefing.', correct: 'Does not connect to the work', explanation: 'This explains a feeling rather than connecting the question to an outcome.' },
      ],
    },
    {
      type: 'multiple-choice',
      title: 'Put It All Together',
      description: 'You have learned what clarity is, why asking for it feels hard, and how to build a question that actually works. Now it is time to use everything at once. Each round below shows a real workplace message and three possible responses. Only one response puts the full Clarity Formula together correctly — it grounds itself in what is already known, names the specific gap, asks an answerable question, and connects it to the work. The other two are close but fall short in ways that matter. Read carefully before you choose.',
      helperChecklist: [
        'The response names what is already understood',
        'The response identifies the specific unclear part',
        'The response asks one specific answerable question',
        'The response gives options where that makes answering easier',
        'The response does not include an apology for needing the information',
      ],
      compactHelper: true,
      suppressDoneScreen: true,
      rounds: [
        {
          scenario: 'Message from your manager, sent Monday morning: "Hey - before you start on the homepage copy, just make sure it matches the new direction we talked about."',
          options: [
            { text: 'I have my notes from our last conversation. Before I start, I want to confirm - when you say new direction, are you referring to the Friday meeting or something more recent?', correct: false, explanation: 'Good question, but it only clarifies the source. It does not yet ask what part of the work should change.' },
            { text: 'I have my notes from our last conversation. I am not sure whether the new direction means a different tone, structure, or messaging priorities. Which should I focus on first so I avoid rewriting anything after the fact?', correct: true, explanation: 'It names what is known, identifies the gap, asks one answerable question, and connects it to avoiding rework.' },
            { text: 'I want to make sure I get this right before I start. Could you point me to where the new direction is documented so I am working from the right version?', correct: false, explanation: 'Reasonable, but less complete. It asks for documentation without naming the actual unclear parts.' },
          ],
        },
        {
          scenario: 'Slack message from a senior colleague: "Can you take a look at the deck before it goes to the client and just tighten it up a bit?"',
          options: [
            { text: 'Happy to help before it goes to the client. Should I track my changes so you can review what I touched before it goes out?', correct: false, explanation: 'This asks about workflow, but not what tighten it up means.' },
            { text: 'I know the deck is mostly finalized. I can focus on either the copy or the visual side - which would be more useful for the client version?', correct: false, explanation: 'Close, but it assumes the deck is mostly finalized and misses the option of cutting or restructuring.' },
            { text: 'I know the presentation is going out soon. To make sure I focus on what matters most, do you mean tightening the copy, cutting slides, or improving visual consistency?', correct: true, explanation: 'It names what is known, identifies the vague phrase, and gives three answerable options.' },
          ],
        },
        {
          scenario: 'Email from a project lead you have not worked with before: "We need someone to own the onboarding section of the handbook. Let me know if you can take it on."',
          options: [
            { text: 'I would be glad to take this on. Before I commit, could you share any existing drafts or briefs so I know what I am working with?', correct: false, explanation: 'Useful, but it skips the core ambiguity: what owning the section actually means.' },
            { text: 'I know this is for the new team handbook. Before I commit, I want to clarify - does own mean writing from scratch, editing an existing draft, or coordinating input from others? That will help me give you a realistic timeline.', correct: true, explanation: 'It identifies the critical gap, gives concrete options, and connects the answer to a realistic timeline.' },
            { text: 'Happy to help with the onboarding section. Is this just the first week or does it cover the full first month of joining?', correct: false, explanation: 'Good scope question, but it does not clarify the responsibility you are agreeing to own.' },
          ],
        },
        {
          scenario: 'Message from your manager, end of day Friday: "Can you pull together a summary of where we are on the project for the leadership update next week?"',
          options: [
            { text: 'Before I start, do you want this as bullet points or a narrative update?', correct: false, explanation: 'This helps with format, but the bigger missing piece is scope.' },
            { text: 'I know the project has three active workstreams. Should the summary cover all three or just the ones with recent movement? That will help me make sure it is scoped correctly before I start drafting.', correct: true, explanation: 'It names what is known, asks a specific scope question, and connects the answer to starting correctly.' },
            { text: 'I know leadership updates usually go out Wednesday. Is this the same format as last quarter or is there a new template I should use?', correct: false, explanation: 'This may be useful, but it assumes facts and focuses on template before scope.' },
          ],
        },
      ],
    },
  ],
}

export const COURSES: Course[] = [askSomeoneOut, introducingNewColleague, askingForClarity]

export function getCourse(id: string): Course | undefined {
  return COURSES.find(c => c.id === id)
}
