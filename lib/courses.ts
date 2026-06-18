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
  formulaStep?: number
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
  hideLeftCardNames?: boolean
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
  formulaStep?: number
  helperChecklist?: string[]
  compactHelper?: boolean
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
  allowOther?: boolean
}

export type GuidedBuilderField = {
  key: string
  label: string
  placeholder?: string
  options?: string[]
  multi?: boolean
  allowOther?: boolean
  fillBefore?: string
  fillAfter?: string
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
  formulaStep?: number
  cards?: { front: string; back: string[] }[]
  fields: GuidedBuilderField[]
  outputs?: GuidedBuilderOutput[]
  saveToToolkit?: boolean
  saveLabel?: string
  continueLabel?: string
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
    helperChecklist: [
      'Warm signal: name the connection or thing you enjoyed',
      'Specific plan: suggest one concrete public plan',
      'Easy out: make it clear they can say no',
    ],
    starterMessages: [
      { role: 'assistant', content: 'Still laughing that you had a whole ranking system for coffee shops.', timestamp: 'Yesterday' },
      { role: 'user', content: 'It is extremely scientific. Vibes, noise level, and whether the chairs are hostile.', timestamp: 'Yesterday' },
      { role: 'assistant', content: 'Hostile chairs is so real. I respect the research.', timestamp: 'Yesterday' },
      { role: 'assistant', content: 'Anyway, hope your day is less chaotic than mine was.', timestamp: 'Today' },
    ],
    systemPrompt: `You are Jamie, chatting on a dating app. You talked yesterday about music, weekend plans, and coffee shops. You are interested but cautious.

Keep messages short and realistic. If the user asks clearly, warmly, and without pressure, respond positively. If the user is vague, ask one simple clarifying question. If the user is pushy, sexual, guilt-trippy, or ignores hesitation, become less engaged and eventually stop responding.

Never break character. You are Jamie, not Beckett.`,
  },
  slides: [
    {
      type: 'interactive-read',
      title: 'Asking Someone Out on a Date',
      description: 'Dating can be especially challenging when you are neurodivergent. Many common dating expectations rely on reading subtle social cues, interpreting ambiguity, and knowing unwritten rules that are rarely explained directly.\n\nThis course is about moving from interest to a respectful next step.\n\nYou are not learning how to impress someone, say the perfect thing, or guarantee a "yes." You are practicing how to communicate interest clearly, respectfully, and in a way that gives the other person an easy choice.',
      sections: [
        {
          heading: 'What you are practicing',
          bullets: [
            'Not becoming smoother, more charming, or more persuasive.',
            'Not trying to force certainty from an unclear situation.',
            'Recognizing when there is enough interest to make an invitation.',
            'Asking someone you are interested in for a specific, low-pressure first meetup.',
          ],
        },
        {
          heading: 'The goal',
          bullets: [
            'Decide whether someone seems like a reasonable person to ask.',
            'Choose a first-date option that feels comfortable, safe, and realistic.',
            'Write an invitation that is clear, direct, and easy to answer.',
          ],
        },
      ],
    },
    {
      type: 'read-through',
      title: 'Online Dating Reality Checks',
      intro: 'Before we get into asking people out, it is worth spending a few minutes on online dating.\n\nMeeting someone through an app is now common, but it works differently from meeting someone through friends, work, school, hobbies, or everyday life. Text-based conversations create different challenges: it is harder to read tone, easier to misunderstand intent, and more important to think about safety and boundaries.\n\nThe same principles from this course still apply — clear communication, low pressure, and respect for the other person\'s choices — but there are a few extra considerations that can make online dating safer and less confusing.',
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
      title: 'Neurodivergent Dating Strengths',
      description: 'A lot of dating advice focuses on fixing weaknesses. This course takes a different approach.\n\nMany neurodivergent people bring strengths to dating that are genuinely valuable in relationships: honesty, curiosity, loyalty, depth, and the ability to notice patterns that others miss. These strengths do not guarantee success, and they may not describe you personally. But they are common enough to be worth recognizing.\n\nThe goal is not to change who you are. The goal is to use your strengths in ways that help connection grow while avoiding the situations where those same strengths can accidentally create pressure, confusion, or overwhelm.',
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
      description: 'Dating can be difficult for anyone, but some challenges show up more often for neurodivergent people.\n\nMany dating norms rely on ambiguity, unwritten rules, and interpreting subtle social signals. At the same time, strong interest, rejection sensitivity, masking, sensory needs, and concerns about safety can add extra layers of complexity.\n\nNone of these challenges mean you are bad at dating. They simply mean you may need a clearer process than the one most dating advice assumes. This course focuses on making dating more understandable: noticing real signals, pacing connection, communicating directly, and choosing situations that support both comfort and safety.',
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
      description: 'Before you think about how to ask someone out, it helps to ask a different question first: does this connection seem worth moving forward?\n\nInterest alone is not always enough. A good first date is more likely when there are signs of mutual effort, basic compatibility, and respect for boundaries. You are not trying to predict the future or guarantee a yes. You are simply looking for enough evidence that asking is reasonable and that spending more time together could be worthwhile.\n\nThis section will help you look for signs of interest, compatibility, and safety before taking the next step.',
      cards: [
        { front: 'Green flags', back: ['They make consistent effort.', 'They ask questions back.', 'They respect pacing.', 'They make concrete plans easier, not harder.'] },
        { front: 'Compatibility signs', back: ['Some overlap in routines or interests.', 'A communication style that does not make you feel constantly unsafe.', 'Similar availability for dating right now.'] },
        { front: 'Reasons to pause', back: ['They pressure you for photos or private information.', 'They ignore boundaries.', 'They leave you carrying the entire conversation.'] },
      ],
    },
    {
      type: 'matching',
      title: 'Reading Compatibility In Practice',
      description: 'This activity gives you a low-stakes way to practice reading compatibility.\n\nReal people are complex, and no short description can tell you everything you need to know. These examples are intentionally simpler than real dating situations so you can focus on the clearest signals: pacing, communication style, availability, values, and what each person needs to feel comfortable.\n\nYour job is not to find a perfect match. It is to notice which pairing seems most likely to feel respectful, realistic, and easy enough to try.',
      instruction: 'Match each person to the best fit.',
      leftLabel: 'Person',
      rightLabel: 'Best fit',
      pairs: [
        {
          left: { name: 'Maya', description: 'Prefers texting before phone or video calls.\nEnjoys quieter activities and planning ahead.\nValues consistency and low-pressure communication.', mismatchNote: 'Maya needs someone patient and low-pressure.' },
          right: { name: 'Alex', description: 'Likes simple, low-key first dates.\nCommunicates reliably without needing constant contact.\nComfortable letting relationships develop gradually.' },
        },
        {
          left: { name: 'Jordan', description: 'Has a busy, sometimes unpredictable work schedule.\nPrefers direct communication over guessing games.\nNeeds flexibility around planning and availability.', mismatchNote: 'Jordan needs direct communication and flexibility.' },
          right: { name: 'Sam', description: 'Clear and straightforward about interest and availability.\nComfortable adjusting plans when schedules change.\nDoes not interpret delayed responses as rejection.' },
        },
        {
          left: { name: 'Dani', description: 'Looking for a serious, long-term relationship.\nValues family, stability, and follow-through.\nAppreciates people who communicate intentions clearly.', mismatchNote: 'Dani needs someone who wants the same kind of steadiness.' },
          right: { name: 'Priya', description: 'Close with family and long-term friends.\nInterested in a committed relationship.\nValues routine, reliability, and consistency.' },
        },
      ],
    },
    {
      type: 'visual-formula',
      title: 'The Clear Ask Formula',
      description: 'Asking someone out can feel intimidating, especially when you are trying to figure out the "right" thing to say.\n\nThe good news is that a first-date invitation does not need to be clever, perfect, or highly romantic. In most cases, it only needs three things: a genuine signal of interest, a specific suggestion, and room for the other person to choose freely.\n\nThis formula gives you a simple structure you can use when your brain is overthinking, anxious, or getting stuck on wording. The goal is not to guarantee a yes. The goal is to make your interest clear and make it easy for the other person to respond honestly.',
      steps: [
        { label: 'Warm signal', text: 'Name the connection or thing you enjoyed.', example: 'I have liked talking with you about music.' },
        { label: 'Specific plan', text: 'Suggest one concrete public plan.', example: 'Would you want to grab coffee Saturday afternoon?' },
        { label: 'Easy out', text: 'Make it clear they can say no.', example: 'No pressure if not.' },
      ],
    },
    {
      type: 'matching',
      title: 'Step 1: Finding the Warm Signal',
      description: 'A warm signal is not a confession of deep feelings. It is simply a brief, genuine reason for asking someone out.\n\nFor each example, choose whether the warm signal is Too Cold, Too Intense, or Just Right.',
      instruction: 'Match each ask to the way its warm signal lands.',
      leftLabel: 'Ask',
      rightLabel: 'Signal',
      hideLeftCardNames: true,
      neutralChecked: true,
      pairs: [
        {
          left: { name: 'Too cold example', description: '"Want to get coffee Saturday?"', mismatchNote: 'This is specific, but it does not name any connection or warmth.' },
          right: { name: 'Too cold', description: 'The ask has little warmth or context.' },
        },
        {
          left: { name: 'Too intense example', description: '"I think you are one of the most interesting people I have met in years and I cannot stop thinking about you."', mismatchNote: 'This puts a lot of emotional weight on an early ask.' },
          right: { name: 'Too intense', description: 'The ask makes the connection feel heavier than the context supports.' },
        },
        {
          left: { name: 'Just right example', description: '"I have enjoyed our conversations after the group. Would you want to grab coffee Saturday?"', mismatchNote: 'This names a real connection without making the ask too heavy.' },
          right: { name: 'Just right', description: 'The ask gives a brief, genuine reason without overloading the moment.' },
        },
        {
          left: { name: 'Too cold example', description: '"Dinner?"', mismatchNote: 'This is so short that the other person has to guess what you mean and why you are asking.' },
          right: { name: 'Too cold', description: 'The ask has little warmth or context.' },
        },
        {
          left: { name: 'Too intense example', description: '"I know we just matched, but I already feel like this could be something huge."', mismatchNote: 'This jumps ahead before there is enough shared context.' },
          right: { name: 'Too intense', description: 'The ask makes the connection feel heavier than the context supports.' },
        },
        {
          left: { name: 'Just right example', description: '"I have liked swapping book recommendations with you. Would you want to meet for coffee this weekend?"', mismatchNote: 'This gives a genuine reason and one clear next step.' },
          right: { name: 'Just right', description: 'The ask gives a brief, genuine reason without overloading the moment.' },
        },
      ],
    },
    {
      type: 'sorting',
      title: 'Step 2: A Specific Plan',
      description: 'A specific plan gives the other person something concrete to answer. It should usually name an activity, keep the setting public or low-pressure, and make the next step easy to accept, adjust, or decline.',
      formulaStep: 2,
      instruction: 'Context: you matched on a dating app, chatted for three days, and this would be your first meetup.',
      categories: ['Too vague', 'Too intense', 'Balanced'],
      items: [
        { message: '"We should do something sometime."', correct: 'Too vague', explanation: 'There is no specific activity or next step to respond to.' },
        { message: '"Would you want to grab coffee Saturday afternoon at the cafe near the park?"', correct: 'Balanced', explanation: 'The plan is specific, public, and easy to accept or decline.' },
        { message: '"Want to spend the day together and see where things go?"', correct: 'Too intense', explanation: 'Too much time and commitment for a first meetup with someone you barely know.' },
        { message: '"Would you be up for a 20-minute video call this week?"', correct: 'Balanced', explanation: 'Low-pressure, specific, and a reasonable first step before meeting.' },
        { message: '"Come over to my apartment and we will watch movies."', correct: 'Too intense', explanation: 'A private-home invitation is usually too much for a first app meetup.' },
        { message: '"Maybe we could get food or something?"', correct: 'Too vague', explanation: 'The activity is unclear and there is no concrete plan.' },
        { message: '"Would you like to meet for a short walk and coffee Sunday morning?"', correct: 'Balanced', explanation: 'Public, time-limited, and easy to leave if either person is uncomfortable.' },
      ],
    },
    {
      type: 'sorting',
      title: 'Step 3: The Easy Out',
      formulaStep: 3,
      description: 'A good easy out does two things at the same time:\n\n- It makes it clear that the other person can say no.\n- It makes it clear that you genuinely want to go on the date.\n\nToo much pressure makes a yes feel less voluntary. Too much hedging can make it sound like you do not really want to ask in the first place. The goal is to land in the middle.\n\nA quick note on confidence: Confidence is not acting like you will get a yes. Confidence is being clear about what you want while being okay with either answer.',
      instruction: 'Context: You have already made your ask. Sort each response.',
      categories: ['Too much pressure', 'Too much hedging', 'Just right'],
      items: [
        { message: '"No pressure if not."', correct: 'Just right', explanation: 'Short, clear, and genuinely gives them room to decide.' },
        { message: '"I really hope you will say yes."', correct: 'Too much pressure', explanation: 'The focus shifts to managing your feelings rather than making a free choice.' },
        { message: '"You probably are not interested, but I thought I would ask."', correct: 'Too much hedging', explanation: 'Sounds apologetic and assumes rejection before they have answered.' },
        { message: '"No worries if you are not interested."', correct: 'Just right', explanation: 'Respects their choice without minimizing your own interest.' },
        { message: '"I would be pretty disappointed if you said no."', correct: 'Too much pressure', explanation: 'Creates guilt and makes a no harder to give honestly.' },
        { message: '"Sorry, this is probably a weird question."', correct: 'Too much hedging', explanation: 'Apologizes for expressing interest instead of asking clearly.' },
        { message: '"Feel free to say no if it is not your thing."', correct: 'Just right', explanation: 'Direct, respectful, and low-pressure.' },
        { message: '"I know you are busy, probably not interested, and it is completely okay if this is a bad idea."', correct: 'Too much hedging', explanation: 'So many disclaimers that the invitation becomes unclear.' },
        { message: '"I have really been hoping you would say yes to this."', correct: 'Too much pressure', explanation: 'Adds emotional weight that can make the other person feel responsible for your reaction.' },
      ],
    },
    {
      type: 'multiple-choice',
      title: 'Pick The Clear Ask',
      description: 'Now let\'s put all three steps together:\n\nA warm signal that names the connection.\nA specific first-date plan.\nAn easy out that respects the other person\'s choice.\n\nThe best asks are usually clear, specific, and low-pressure. They do not hide your interest, but they also do not require the other person to manage your feelings.',
      helperChecklist: [
        'Warm signal: name the connection or thing you enjoyed',
        'Specific plan: suggest one concrete public plan',
        'Easy out: make it clear they can say no',
      ],
      compactHelper: true,
      suppressDoneScreen: true,
      rounds: [
        {
          scenario: 'You have been talking after a weekly hobby group.',
          options: [
            { text: 'A: "Want to hang out sometime?"', correct: false, explanation: 'Too vague. It does not include a warm signal or a specific plan.' },
            { text: 'B: "I have really enjoyed talking with you after group. Would you want to grab coffee Saturday afternoon? No pressure if not."', correct: true, explanation: 'B includes a warm signal, a specific plan, and a genuine easy out.' },
            { text: 'C: "I think you are amazing and I have been wanting to ask you out for weeks. Please say yes."', correct: false, explanation: 'Too intense and pressuring.' },
          ],
        },
        {
          scenario: 'You matched on a dating app and have been chatting for a week.',
          options: [
            { text: 'A: "I have enjoyed talking with you about books. Would you want to meet for coffee this weekend? No worries if you are not interested."', correct: true, explanation: 'A is clear and balanced.' },
            { text: 'B: "Maybe we could do something if you want, but no worries if not, and sorry if this is weird."', correct: false, explanation: 'B hedges too much.' },
            { text: 'C: "We need to meet before this connection disappears."', correct: false, explanation: 'C creates pressure.' },
          ],
        },
        {
          scenario: 'You know someone casually through mutual friends.',
          options: [
            { text: 'A: "I like how easy you are to talk to. Would you want to get lunch this week? Feel free to say no."', correct: true, explanation: 'A clearly includes all three parts of the formula.' },
            { text: 'B: "Lunch?"', correct: false, explanation: 'B is too vague.' },
            { text: 'C: "I know you are probably not interested, but I was wondering if maybe you would want to do something sometime."', correct: false, explanation: 'C hides the ask behind assumptions and hedging.' },
          ],
        },
        {
          scenario: 'You matched on a dating app and have been joking about coffee shops.',
          options: [
            { text: 'A: "I have liked our coffee shop debate. Want to try the quiet cafe near the park this weekend? No pressure if not."', correct: true, explanation: 'A names the connection, gives a specific plan, and leaves room for a no.' },
            { text: 'B: "We should test my coffee ranking system someday if you are not too busy and if that is not weird."', correct: false, explanation: 'B has a fun idea, but it hedges and stays too vague.' },
            { text: 'C: "You need to experience my coffee standards in person."', correct: false, explanation: 'C sounds more forceful than invitational.' },
          ],
        },
        {
          scenario: 'You have been chatting with someone who said they prefer low-key plans.',
          options: [
            { text: 'A: "Want to meet up or something?"', correct: false, explanation: 'A is too vague and does not show you heard their preference.' },
            { text: 'B: "I like how easy this conversation has felt. Would you want to take a short walk and grab coffee Sunday morning? Totally okay if not."', correct: true, explanation: 'B is warm, specific, low-pressure, and aligned with a low-key preference.' },
            { text: 'C: "I planned a whole afternoon for us because I think we will really click."', correct: false, explanation: 'C is too intense for an early ask.' },
          ],
        },
      ],
    },
    {
      type: 'guided-builder',
      title: 'Build Your Ask',
      description: 'Create a few versions you could actually use. Beckett will save them to your Communication toolkit.',
      formulaStep: 3,
      fields: [
        { key: 'connection', label: 'What have you enjoyed?', placeholder: 'talking with you about music', options: ['talking with you', 'our coffee shop debate', 'your sense of humor', 'how easy this conversation has felt'], allowOther: true },
        { key: 'plan', label: 'What kind of first step feels right?', placeholder: 'grab coffee Saturday afternoon', options: ['grab coffee this weekend', 'go for a walk Saturday', 'try a low-key bookstore cafe', 'do a quick video call first'], allowOther: true },
        { key: 'pressure', label: 'How do you want to keep it low pressure?', placeholder: 'No pressure if not', options: ['No pressure if not', 'Totally okay if you would rather keep chatting', 'Only if that feels good to you'], allowOther: true },
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
    systemPrompt: `You are Maya, a friendly but busy cross-functional colleague in Slack. You just joined a beta onboarding project.

If the user introduces themselves clearly, respond warmly and ask one practical follow-up. If they are vague, ask what part of the project they own. If they overshare or apologize heavily, stay kind and redirect to collaboration.

Never break character. You are Maya, not Beckett.`,
  },
  slides: [
    {
      type: 'reflection-choice',
      title: 'Strengths You Bring To Work',
      description: 'Neurodivergent people are often told — implicitly or directly — that the way their brain works is a problem to be managed. At work, that narrative can follow you into every meeting, every email, and every introduction. But this is not true. The traits that have been framed as too much, too intense, too detail-oriented, or too blunt are often exactly what makes neurodivergent people exceptional colleagues. You do not need to hide them or qualify them. Select the strengths that feel true for you.',
      prompt: 'Which strengths do you want a new colleague to understand about you?',
      multi: true,
      allowOther: true,
      options: ['Organizing messy information', 'Spotting user confusion', 'Deep focus', 'Direct communication', 'Creative problem-solving', 'Careful follow-through', 'Other'],
    },
    {
      type: 'flip-cards',
      title: 'Some Common Mistakes',
      description: 'Most introduction mistakes do not come from saying the wrong thing — they come from a habit of making yourself smaller before you have even started. Over-explaining, softening, or leaving out the most useful context are all ways of stepping back when stepping forward would serve you better. These cards show the patterns that get in the way most often and what to do instead.',
      cards: [
        { front: 'Too vague', back: ['The other person does not know what you do or why you are reaching out.'] },
        { front: 'Too apologetic', back: ['You spend more time softening yourself than giving useful context.'] },
        { front: 'Too much personal context', back: ['You disclose things that do not need to be part of a first work intro.'] },
      ],
    },
    {
      type: 'sorting',
      title: 'Warmth Without Overdoing It',
      instruction: 'Knowing the patterns is different from seeing them. Sort each line below by what it actually signals to the other person — and notice how small differences in wording can change the whole impression.',
      categories: ['Too vague', 'Too much personal context', 'Balanced'],
      items: [
        { message: '"I work on onboarding."', correct: 'Too vague', explanation: 'Technically useful, but not very connective.' },
        { message: '"I promise I am easy to work with once you get to know me!"', correct: 'Too much personal context', explanation: 'It asks the other person to reassure you before they know you.' },
        { message: '"I am excited to work together and can help with the onboarding flow context."', correct: 'Balanced', explanation: 'Warm and useful without overselling.' },
      ],
    },
    {
      type: 'visual-formula',
      title: 'The Formula To A Good Introduction',
      description: 'A good introduction does not need to be impressive — it just needs to give the other person enough to work with. When you know what each part is doing and why it is there, the whole thing feels less like a performance and more like a conversation.',
      steps: [
        { label: 'Who you are', text: 'A name and team gives the other person somewhere to place you.', example: "Hi, I am Alex. I am on the product team." },
        { label: 'What you do', text: 'Name the work you do day to day and how it connects to their world.', example: 'I write the help docs users see when they get stuck.' },
        { label: 'How you collaborate', text: 'Name one useful preference or next step.', example: 'Written next steps help me stay aligned.' },
      ],
    },
    {
      type: 'guided-builder',
      title: 'Step 1: Who You Are',
      description: 'Most people rush past Step 1 without thinking about what it is actually doing. A name and team is not just a formality — it is the foundation everything else builds on. Without it the other person has no frame of reference for anything you say next. This step is about giving them somewhere to place you before you ask them to take in anything else.',
      formulaStep: 1,
      cards: [
        { front: 'What to include', back: ['Your first name', 'Your role or title, kept simple', 'The team or project you are connected to', 'How long you have been there if it is relevant'] },
        { front: 'What to leave out', back: ['Your full job history', 'Qualifications unless they directly matter', 'Anything that sounds like you are justifying your presence', 'Over-explaining why you are reaching out before saying who you are'] },
        { front: 'Why it can feel hard', back: ['A pull to over-explain', 'Uncertainty about formality', 'Not knowing where Step 1 ends', 'Defaulting to credentials instead of connection-relevant information'] },
        { front: 'Tone', back: ['Warm and direct works in most professional contexts.', 'Overly formal can create distance.', 'Overly casual before you know the person can land wrong.'] },
      ],
      fields: [
        { key: 'team', label: 'Complete your Step 1', fillBefore: "Hi, I am {name}. I am on the ", placeholder: 'product', fillAfter: ' team.' },
      ],
      continueLabel: 'Save and continue →',
    },
    {
      type: 'guided-builder',
      title: 'Step 2: What You Do',
      description: 'Knowing your name and team tells the other person who you are. Knowing what you actually do tells them how you fit into their world and whether your work will intersect with theirs. Without this step the introduction stays surface level — polite but not particularly useful to either person.',
      formulaStep: 2,
      cards: [
        { front: 'What to include', back: ['The kind of work you do day to day', 'The problem your work solves or the thing you move forward', 'How your work connects to theirs if that is already clear', 'One specific current project if it is relevant'] },
        { front: 'What to leave out', back: ['A full list of responsibilities', 'Technical language or acronyms they may not know yet', 'Anything that sounds like you are proving your value'] },
        { front: 'Why it can feel hard', back: ['Underselling with something vague', 'Overselling by listing every responsibility', 'Not knowing which part is most relevant', 'Defaulting to a title instead of describing the work'] },
        { front: 'A note on specificity', back: ['Specificity gives the other person something to respond to.', 'I write the help docs users see when they get stuck is easier to connect with than I work on content.'] },
      ],
      fields: [
        { key: 'work', label: 'Complete your Step 2', fillBefore: 'I work on ', placeholder: 'onboarding content and first-run flow clarity', fillAfter: '.' },
      ],
      continueLabel: 'Save and continue →',
    },
    {
      type: 'guided-builder',
      title: 'Step 3: How Do You Like To Collaborate',
      description: 'How you work best with other people is not something you need to hide or apologize for. Neurodivergent people often have very specific and very reasonable preferences around communication — needing things in writing, preferring async over real-time, wanting clear expectations before starting. These are not high-maintenance requests. They are the conditions under which you do your best work.',
      formulaStep: 3,
      cards: [
        { front: 'What to include', back: ['One specific preference around how you communicate best', 'One preference around how you receive information', 'A simple next step if one is relevant', 'A framing that makes the preference sound useful rather than limiting'] },
        { front: 'What to leave out', back: ['An apology before or after naming the preference', 'An explanation of why the preference exists', 'More than one preference at a time', 'Anything that frames the preference as a problem'] },
        { front: 'Why it matters', back: ['Naming a preference is an act of clarity, not a request for special treatment.', 'The other person benefits from knowing how to work with you well — and so do you.'] },
        { front: 'Why it can feel hard', back: ['Worrying that naming a preference will make you seem difficult', 'Not knowing which preference to name first', 'Leaving the other person to figure it out through trial and error', 'Framing the preference around what does not work rather than what does'] },
      ],
      fields: [
        { key: 'preference', label: 'Complete your Step 3', fillBefore: 'I do best when ', placeholder: 'next steps are written down after we talk', fillAfter: '.' },
      ],
      continueLabel: 'Save and continue →',
    },
    {
      type: 'matching',
      title: 'Translate The Preference',
      description: 'There is usually a gap between how you naturally think about your collaboration preferences and how you describe them to someone new. The honest version in your head is real and valid — it just needs a small translation to land well in a work introduction.',
      instruction: 'Tap an initial thought on the left, then tap the work version on the right that says the same thing.',
      leftLabel: 'What I am actually thinking',
      rightLabel: 'What I can say at work',
      hideCardNames: true,
      neutralChecked: true,
      pairs: [
        {
          left: { name: 'Processing time', description: 'I freeze when people ask me questions live.', mismatchNote: 'Look for the version that makes processing time sound useful and professional rather than like a limitation.' },
          right: { name: 'Work version', description: 'I usually give better answers when I have a few minutes to think — I will always follow up in writing.' },
        },
        {
          left: { name: 'Directness', description: 'Please do not make me guess what you mean.', mismatchNote: 'Look for the version that asks for direct feedback without sounding frustrated or demanding.' },
          right: { name: 'Work version', description: 'Direct feedback is easiest for me to act on, especially when the priority is clear.' },
        },
        {
          left: { name: 'Context', description: 'I need the whole story or I will miss something.', mismatchNote: 'Look for the version that frames the need for context as a benefit to the work rather than a personal requirement.' },
          right: { name: 'Work version', description: 'A little context up front helps me avoid rework and move faster.' },
        },
        {
          left: { name: 'Interruptions', description: 'I hate being interrupted mid-thought.', mismatchNote: 'Look for the version that names the preference around interruptions without sounding defensive or difficult to work with.' },
          right: { name: 'Work version', description: 'I tend to do my best thinking when I can finish a thought before we discuss — async works really well for me.' },
        },
        {
          left: { name: 'Written steps', description: 'I need things written down or I will forget.', mismatchNote: 'Look for the version that makes written confirmation sound like something that benefits both people.' },
          right: { name: 'Work version', description: 'Written next steps help me stay aligned — I am happy to send a recap after we connect.' },
        },
      ],
    },
    {
      type: 'guided-builder',
      title: 'Build Your Intro',
      description: 'You have done the thinking. Now this slide pulls it together. The fields below draw on everything you named in the steps before — your role, what you do, and how you work best. You can keep what you built or create one more version before Beckett saves it to your Communication toolkit.',
      fields: [
        { key: 'team', label: 'Step 1: who you are', fillBefore: "Hi, I am {name}. I am on the ", placeholder: 'product', fillAfter: ' team.' },
        { key: 'work', label: 'Step 2: what you do', fillBefore: 'My work focuses on ', placeholder: 'onboarding content and first-run flow clarity', fillAfter: '.' },
        { key: 'preference', label: 'Step 3: how you like to collaborate', fillBefore: 'I do best when ', placeholder: 'next steps are written down after we talk', fillAfter: '.' },
        { key: 'strength', label: 'What strength do you want to include?', placeholder: 'organizing messy pieces', options: ['organizing messy pieces', 'spotting user confusion', 'turning ideas into next steps', 'careful follow-through'] },
      ],
      outputs: [
        { label: 'Direct intro', category: 'new_colleague_intro', template: 'Hi, I am {name}. I am on the {team} team. I work {workPhrase}. I am usually helpful with {strength}. I do best when {preference}.' },
        { label: 'Warm intro', category: 'new_colleague_intro', template: 'Hi, nice to meet you. I am {name} from the {team} team. I work {workPhrase}, and I am excited to work together. I am usually helpful with {strength}.' },
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
