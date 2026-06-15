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
  scenario: string
  good: { label: string; message: string; note: string }
  bad: { label: string; message: string; note: string }
}

export type SortingItem = { message: string; correct: string; explanation: string }
export type SortingSlide = {
  type: 'sorting'
  title: string
  instruction: string
  categories: string[]
  items: SortingItem[]
}

export type MCOption = { text: string; correct: boolean; explanation: string }
export type MCRound = { scenario: string; options: MCOption[] }
export type MultipleChoiceSlide = {
  type: 'multiple-choice'
  title: string
  rounds: MCRound[]
}

export type ChecklistSlide = {
  type: 'checklist'
  title: string
  items: string[]
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
  | ChecklistSlide

export type OpenPracticeConfig = {
  matchName: string
  matchDescription: string
  systemPrompt: string
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
}

// ── Ask Someone Out ────────────────────────────────────────────────────────

const askSomeoneOut: Course = {
  id: 'ask-someone-out',
  title: 'Asking Someone Out on a Dating App',
  description: 'A Personal Preview course where Beckett helps you make a clear, respectful, low-pressure ask without overthinking every word.',
  estimatedMinutes: 30,
  confidenceQuestion: 'How confident do you feel right now about asking someone out?',
  confidenceIntro: 'This is a Personal Preview course. Beckett beta is workplace-first right now, but this course shows how the coaching model can also support personal communication later. Your goal is not to become smoother. Your goal is to be understandable, respectful, and real.',
  reflectiveQuestion: 'What is one ask, boundary, or template you want to use next time?',
  reviewWrongAnswers: true,
  reviewConversationTurns: 4,
  openPractice: {
    matchName: 'Jamie',
    matchDescription: 'someone you matched with on a dating app four days ago — you have been chatting about music and weekend plans and you want to suggest meeting up',
    systemPrompt: `You are Jamie, chatting with someone on a dating app. You have been talking for four days about music and weekend plans. You are interested but cautious — you have been burned before by people who move too fast or give off concerning signals.

Keep messages short and realistic, the way people actually text on dating apps. Respond naturally to what they say.

If the conversation is genuine and warm, stay engaged and show growing interest. If they ask you out clearly and respectfully, agree.

If the person is vague, pushy, inappropriate, ignores consent, or keeps trying to force the conversation after you show hesitation, become progressively less engaged — shorter responses, more noncommittal. If it continues to go poorly, your responses should trail off and eventually stop entirely. This is a safety boundary in the practice: the goal is to help the user notice non-engagement and step back respectfully.

Never break character. You are Jamie — you do not know you are in a practice scenario.`,
  },
  slides: [
    {
      type: 'read-through',
      title: 'Personal Preview: Asking Clearly',
      intro: 'Let\'s make the ask clear enough to answer. This course is about moving from “I think there might be interest here” to one respectful next step.',
      bullets: [
        'Dating can feel high stakes because the rules are vague and the feedback is uneven.',
        'A good ask does not need to be perfect, charming, or clever.',
        'A good ask is clear, specific, low-pressure, and respectful of the answer.',
        'A no is information, not a verdict on your worth.',
        'Beckett will help you practice words you can actually use, not lines that feel like pretending.',
      ],
    },
    {
      type: 'read-through',
      title: 'Your Strengths',
      intro: 'Before the harder parts, start here: there are real strengths in how you connect.',
      bullets: [
        'Intense loyalty — when you commit to someone, you mean it.',
        'Deep honesty — you tend to say what you mean, which builds real trust over time.',
        'Unusual sensitivity to patterns — you often notice things about people that others miss entirely.',
        'Creativity and depth — conversations with you rarely stay on the surface.',
        'Focused passion — when you care about something or someone, that care is real and genuine.',
      ],
    },
    {
      type: 'accordion',
      title: 'Why Can Dating Be So Hard',
      description: 'Dating asks you to interpret unclear signals while also deciding what you want. Beckett\'s job is to slow that down.',
      sections: [
        {
          heading: 'Reading Signals',
          bullets: [
            'Flirting, sarcasm, slow replies, and vague enthusiasm can be hard to decode over text.',
            'Beckett helps you slow down, look at the evidence, and avoid jumping straight to rejection or certainty.',
            'The goal is not to read minds — it is to make a grounded next move.',
          ],
        },
        {
          heading: 'Anxiety and Sensory Load',
          bullets: [
            'Rejection anxiety can make a simple ask feel much bigger than it is.',
            'Busy bars, loud restaurants, and bright spaces can use up the energy you need for connection.',
            'Beckett will nudge you toward lower-pressure plans where you can actually be present.',
          ],
        },
        {
          heading: 'Pacing New Interest',
          bullets: [
            'It is common to get excited and want to move quickly when a connection feels rare or promising.',
            'That enthusiasm is not wrong; it just needs pacing so the other person does not feel overwhelmed.',
            'Beckett coaches you toward clear interest without turning one message into the whole relationship.',
          ],
        },
        {
          heading: 'Masking and Over-Editing',
          bullets: [
            'You may feel pressure to perform a smoother, more socially expected version of yourself.',
            'A little preparation can help; constant masking usually drains you and makes dating feel less safe.',
            'Beckett helps you sound clear and considerate without erasing yourself.',
          ],
        },
        {
          heading: 'Learn more: Nonverbal Cues',
          bullets: [
            'Eye contact, facial expressions, and tone can be difficult to read or perform consistently.',
            'Over text, those cues disappear entirely, which can make things both simpler and more confusing.',
            'Clear words matter because they reduce the amount everyone has to infer.',
          ],
        },
        {
          heading: 'Learn more: All-or-Nothing Interpretations',
          bullets: [
            'A slow reply does not always mean rejection.',
            'A warm reply does not always mean commitment.',
            'Beckett can help you hold uncertainty without turning it into a crisis.',
          ],
        },
        {
          heading: 'Learn more: Unspoken Rules',
          bullets: [
            'Dating norms around timing, flirting, and pacing are often assumed instead of explained.',
            'Some of those rules are inconsistent because different people want different things.',
            'This course gives you useful patterns, not a script you have to obey.',
          ],
        },
        {
          heading: 'Learn more: Sharing Context About Yourself',
          bullets: [
            'You get to choose when and how much to share about how your brain works.',
            'You do not owe a diagnosis to someone you just matched with.',
            'A good early goal is simply to communicate needs clearly enough that dating feels sustainable.',
          ],
        },
      ],
    },
    {
      type: 'flip-cards',
      title: 'Is This Worth Asking?',
      description: 'Before you think about wording, check whether this is a connection worth moving forward.',
      cards: [
        {
          front: 'Good early signs',
          back: [
            'They make consistent effort, not just occasional bursts of attention.',
            'They ask questions and respond to what you actually said.',
            'They respect pacing instead of pushing for more than you offered.',
            'They help the conversation feel emotionally safe.',
            'They show curiosity, not just attraction.',
          ],
        },
        {
          front: 'Compatibility to look for',
          back: [
            'Some overlap in interests, routines, or how you like to spend time.',
            'A communication style that does not make you feel constantly confused or unsafe.',
            'A similar level of availability for dating right now.',
            'A willingness to make concrete plans, not just keep chatting forever.',
            'Enough comfort that you can be real without performing constantly.',
          ],
        },
        {
          front: 'Reasons to pause',
          back: [
            'They ignore boundaries or make you feel guilty for having them.',
            'They pressure you for photos, private information, or meeting somewhere unsafe.',
            'They only respond when you carry the whole conversation.',
            'They make you feel like you have to mask heavily to keep their interest.',
            'They are vague in a way that leaves you doing all the emotional work.',
          ],
        },
      ],
    },
    {
      type: 'matching',
      title: 'Reading Compatibility in Practice',
      instruction: 'For each person on the left, find their best match on the right. Look for communication style, values, pacing, and stage of life — not just shared hobbies.',
      pairs: [
        {
          left: {
            name: 'Maya, 28',
            description: 'Remote data analyst. Needs structure during the day but keeps evenings entirely open. Deeply introverted — recharges alone, communicates better over text, and takes time to warm up. Into pottery, foreign films, and solo walks. Wants something serious eventually but is not in a rush. Finds social pressure exhausting.',
            mismatchNote: 'Maya needs someone comfortable with silence and space — not someone who brings a lot of social energy.',
          },
          right: {
            name: 'Alex, 29',
            description: 'Freelance photographer with irregular hours and no love of advance planning. Comfortable being alone and comfortable with the right person — does not need constant contact. Grew up moving around. Quiet but observant. Wants someone who does not need every silence filled.',
          },
        },
        {
          left: {
            name: 'Jordan, 31',
            description: 'Works in hospitality — chaotic hours, lots of social energy at work, needs quiet at home. Recently out of a long relationship, not looking to rush. Very direct communicator. Days off: hiking, farmers markets, working on a novel. Emotionally self-aware. Needs someone who can handle uneven availability.',
            mismatchNote: 'Jordan needs someone emotionally ready and able to handle an uneven schedule — that\'s a specific combination.',
          },
          right: {
            name: 'Sam, 32',
            description: 'High school art teacher. Structured at work, creatively chaotic outside it. Loves hiking, cooking for friends, being in community. Gives a lot and is learning to ask for what they need in return. Emotionally available. Has thought carefully about what a long-term relationship should look like.',
          },
        },
        {
          left: {
            name: 'Dani, 26',
            description: 'First-generation college graduate in nonprofit fundraising. Close to her family and wants to stay in the same city long-term. Communicates openly and wants the same back — hates vagueness. Values stability but wants real depth. Spends free time cooking, in her church community, and mentoring high schoolers.',
            mismatchNote: 'Dani needs someone direct, family-close, and committed to staying local — all three matter to her.',
          },
          right: {
            name: 'Priya, 27',
            description: 'Public health worker who values her community and long-term friendships above almost everything. Direct — says what she means, expects the same. Not interested in ambiguity or situationships. Wants to stay near her family. Volunteers, hosts dinners, training for a half marathon.',
          },
        },
        {
          left: {
            name: 'Ezra, 34',
            description: 'Software engineer, works from home, introverted. Gets deeply absorbed in interests: competitive chess, sourdough, philosophy podcasts. Communicates well in writing, less so in person. Not looking for someone high-maintenance or event-heavy. Wants a partner who has their own full inner world.',
            mismatchNote: 'Ezra needs a partner with their own inner world who is genuinely comfortable with quiet — not someone spontaneous or social-heavy.',
          },
          right: {
            name: 'Leo, 35',
            description: 'Technical writer, fully remote, lives alone and has designed his life that way. Reads philosophy, plays chess online, listens to long niche podcasts. Values depth over breadth — one real conversation over ten shallow ones. Comfortable with quiet and needs a partner who is too.',
          },
        },
      ],
    },
    {
      type: 'interactive-read',
      title: 'The Clear Ask Formula',
      description: 'The exact words matter less than the signal you send. Beckett is looking for clear, warm, low-pressure, and respectful.',
      sections: [
        {
          heading: 'Clear Ask Formula',
          bullets: [
            'Use this structure: I\'ve enjoyed [specific thing]. Would you want to [specific plan] on [timeframe]? No pressure if not.',
            'Specific does not mean intense. It means the other person knows what they are answering.',
            'You can be direct and still gentle.',
          ],
          examples: [
            '"I\'ve really enjoyed talking music with you. Would you want to grab coffee this weekend? No pressure if not."',
            '"I\'ve liked chatting with you this week. Would you be up for a walk Saturday afternoon?"',
          ],
        },
        {
          heading: 'Low-Pressure Plan Formula',
          bullets: [
            'Use this structure: I was thinking [public place/activity]. If you\'re interested, [day/time] could work.',
            'A low-pressure plan gives them room to say yes, no, or suggest something else.',
            'Public, simple, and easy to leave is usually better for a first meeting.',
          ],
          examples: [
            '"I was thinking coffee somewhere quiet. If you\'re interested, Sunday afternoon could work."',
            '"There\'s a farmers market near me on Saturday. If you\'d be into that, I\'d like to go together."',
          ],
        },
        {
          heading: 'Pacing Formula',
          bullets: [
            'Use this structure: warm interest + one concrete next step + easy out.',
            'This helps you show interest without making the other person responsible for your feelings.',
            'If they hesitate, go slower instead of trying to persuade them.',
          ],
          examples: [
            '"I like talking with you and would be interested in meeting. Want to do a short coffee next week? Totally okay if you\'d rather keep chatting."',
            '"I\'d be up for meeting in person, but no rush if you want more time."',
          ],
        },
        {
          heading: 'Ask Clearly and Respect Consent',
          bullets: [
            'A clear ask gives the other person enough information to choose.',
            'Consent matters in tone too: no pressure, no guilt, no trying to talk them out of hesitation.',
            'If they say no, seem unsure, or stop responding, Beckett will coach you to step back respectfully.',
          ],
          examples: [
            '"Would you want to go on a date? I\'m thinking coffee or a walk, whichever feels better to you."',
            '"Totally okay if not, but I\'d like to take you on a date if you\'re interested."',
          ],
        },
      ],
      comparison: {
        scenario: 'You\'ve been chatting for five days and want to suggest meeting up.',
        good: {
          label: 'This works',
          message: 'I\'ve been enjoying this — would you want to grab coffee this Saturday? There\'s a quiet spot near the park I like.',
          note: 'Specific, warm, low-pressure. Gives them a real thing to say yes or no to.',
        },
        bad: {
          label: 'This doesn\'t',
          message: 'We should hang out sometime lol, let me know if you\'re ever free!',
          note: 'Vague, no date, no place, puts all the effort on them. Easy to ignore.',
        },
      },
    },
    {
      type: 'interactive-read',
      title: 'What Am I Actually Asking?',
      description: 'Sometimes the hard part is not the wording. It is deciding what the next step should be.',
      sections: [
        {
          heading: 'A small first meeting',
          bullets: [
            'Use this when the conversation has been warm and steady.',
            'Keep it short, public, and easy to say yes or no to.',
            'Coffee, a walk, a bookstore, or a farmers market all work better than a high-pressure dinner.',
          ],
          examples: [
            '"Would you want to grab coffee this weekend?"',
            '"Want to go for a walk at the park Saturday afternoon?"',
          ],
        },
        {
          heading: 'A video call first',
          bullets: [
            'Use this when meeting feels like too much or you want a safety check first.',
            'A short call can reduce uncertainty without turning it into a big event.',
            'You can keep the ask simple and normal.',
          ],
          examples: [
            '"Would you want to do a quick video call before we plan anything in person?"',
            '"I usually like a short call first. Would that feel okay to you?"',
          ],
        },
        {
          heading: 'Making “sometime” specific',
          bullets: [
            'If you already said “we should meet sometime,” your next move is to make it concrete.',
            'Concrete does not mean demanding. It means helpful.',
            'Give one option and leave room for another.',
          ],
          examples: [
            '"To make that less vague, would Saturday afternoon work for coffee?"',
            '"I meant it about meeting up. Would next week be too soon?"',
          ],
        },
        {
          heading: 'Not ready yet',
          bullets: [
            'You can slow down without disappearing.',
            'If you like them but need more time, say that clearly.',
            'This protects your pacing and keeps the other person from guessing.',
          ],
          examples: [
            '"I like talking with you. I think I want to chat a little longer before meeting, if that works for you."',
            '"I am interested, just slower to move from app to real life."',
          ],
        },
      ],
    },
    {
      type: 'draft-practice',
      title: 'Try The Ask Yourself',
      prompt: 'You have been chatting with someone for a week. Write the message you would send to ask them out.',
      draftContext: 'The user is practicing asking someone out on a dating app after one week of chatting. In one sentence (max 20 words), give honest specific coaching on their message. Focus on tone, clarity, pressure level, and whether it gives the person something concrete to answer.',
    },
    {
      type: 'flip-cards',
      title: 'What Tends to Go Wrong',
      cards: [
        {
          front: 'Being Too Vague',
          back: [
            'A better ask is specific and clear: "Would you want to get coffee Saturday afternoon?" — not "Are you free sometime?"',
            'Vague asks put the other person in an awkward position — they cannot say yes to something undefined.',
            'Being direct is not pushy — it shows confidence and makes the other person\'s decision easier.',
          ],
        },
        {
          front: 'Oversharing or Moving Too Fast',
          back: [
            'Pacing is important even when your feelings are genuine and intense.',
            'Sharing too much too soon can feel overwhelming rather than intimate.',
            'Let depth build naturally across multiple conversations rather than front-loading everything at once.',
            'Save heavy personal history for when trust has been established over time.',
          ],
        },
        {
          front: 'Making It Hard To Answer',
          back: [
            'A message can be too vague, too intense, or too loaded with fear.',
            'A balanced ask gives one clear option and room for a real answer.',
            'The other person should not have to reassure you before they can respond.',
          ],
        },
        {
          front: 'Choosing A Stressful Plan',
          back: [
            'High stimulus environments make it hard to focus and can trigger sensory overload for you or them.',
            'Good first date locations: a quiet coffee shop, a walk in a park, a low-key museum, a bookstore, a farmers market — somewhere you can actually hear each other.',
            'The goal is a setting where both people can relax and be present.',
          ],
        },
      ],
    },
    {
      type: 'sorting',
      title: 'Sort These Asks',
      instruction: 'Sort each message by the pattern Beckett should notice: too vague, too intense, or balanced.',
      categories: ['Too vague', 'Too intense', 'Balanced'],
      items: [
        {
          message: '"We should hang out sometime."',
          correct: 'Too vague',
          explanation: 'Too vague — gives the other person nothing concrete to say yes to.',
        },
        {
          message: '"Would you want to grab coffee this Saturday? There\'s a quiet spot near the park I like."',
          correct: 'Balanced',
          explanation: 'Specific time, specific suggestion, low pressure.',
        },
        {
          message: '"I\'ve been thinking about you honestly more than I expected, and I know it\'s only been a few days but I really want to meet you. Is that weird?"',
          correct: 'Too intense',
          explanation: 'Oversharing intensity — too much emotional weight for this early stage.',
        },
        {
          message: '"This is probably going to sound forward but I\'d love to meet up — are you free for a walk this week?"',
          correct: 'Balanced',
          explanation: 'Self-aware framing, genuine, gives them something specific to respond to.',
        },
        {
          message: '"Let me know whenever you\'re free!"',
          correct: 'Too vague',
          explanation: 'Too vague — puts all the planning work on them.',
        },
        {
          message: '"You should come over — I\'ll cook, it\'s way more relaxed than going out."',
          correct: 'Too intense',
          explanation: 'Home is not the right location for a first meeting with someone you only know online.',
        },
        {
          message: '"I feel like we\'d have a lot to talk about in person. Would you want to try that new bookshop café on Sunday?"',
          correct: 'Balanced',
          explanation: 'Warm reasoning, specific suggestion, clear timing.',
        },
        {
          message: '"I really like talking to you and would hate for this to just fade — can we please meet up?"',
          correct: 'Too intense',
          explanation: 'Fear-of-loss framing comes across as anxious and puts quiet pressure on them.',
        },
      ],
    },
    {
      type: 'multiple-choice',
      title: 'What Would You Do?',
      rounds: [
        {
          scenario: 'You have been chatting for five days and the conversation is going well. You want to suggest meeting. Which message do you send?',
          options: [
            { text: '"We should definitely hang out soon!"', correct: false, explanation: 'Too vague — no specific time, place, or plan. Gives them nothing to say yes to.' },
            { text: '"Would you want to grab coffee Saturday morning? There\'s a spot near the park I like."', correct: true, explanation: 'Specific, warm, and low-pressure. Clear enough to get a real answer.' },
            { text: '"I\'m free this weekend if you happen to be."', correct: false, explanation: 'Too passive — puts all the initiative on them.' },
          ],
        },
        {
          scenario: 'They ask what you\'re doing this weekend. You\'re catching up after a hard few weeks. Which response fits best?',
          options: [
            { text: '"Mostly lying low — had a rough few weeks so a slow weekend sounds good. What about you?"', correct: true, explanation: 'Honest and paced. Shares something real without unloading. Passes the conversation back.' },
            { text: '"Honestly not great — work\'s been a lot, I\'ve been struggling with anxiety and I cancelled on friends twice. I\'m trying to do better but it\'s hard."', correct: false, explanation: 'Too much detail too soon. This level of disclosure belongs much later in a relationship.' },
            { text: '"Nothing much."', correct: false, explanation: 'Too closed off — conversation goes nowhere.' },
          ],
        },
        {
          scenario: 'You are planning your first time meeting. Which do you suggest?',
          options: [
            { text: '"There\'s a rooftop bar downtown — gets loud but the vibe is amazing."', correct: false, explanation: 'Loud and crowded — hard to have a real conversation, and potentially overwhelming.' },
            { text: '"Want to walk through the botanical garden? We could grab coffee after if it\'s going well."', correct: true, explanation: 'Quiet, low-pressure, and gives a natural exit point. Easy to extend if things are good.' },
            { text: '"You could come over — I\'ll make dinner, way more relaxed than going out."', correct: false, explanation: 'Home is not appropriate for a first meeting with someone you have only talked to online.' },
          ],
        },
        {
          scenario: 'The conversation slowed down two days ago. Which is the right move?',
          options: [
            { text: '"Hey! Just checking in 👀"', correct: false, explanation: 'Adds nothing and puts quiet pressure on them. Easy to ignore.' },
            { text: '"Okay I have to ask — if you could eat one cuisine for the rest of your life, what would it be?"', correct: true, explanation: 'Low stakes, genuine, and gives them something easy to respond to. Re-engages without pressure.' },
            { text: '"I know you\'re probably busy but I just wanted you to know I\'m still interested, in case you were wondering 🙂"', correct: false, explanation: 'Over-explaining comes across as anxious and puts the focus on your insecurity rather than the connection.' },
          ],
        },
      ],
    },
    {
      type: 'read-through',
      title: 'Help Me Start Options',
      intro: 'If starting is the hardest part, Beckett can help you choose a lane before you write the message.',
      bullets: [
        'Direct: "I like talking with you. Would you want to grab coffee this weekend?"',
        'Warm: "I\'ve really enjoyed our conversation about music. Would you want to meet for coffee or a walk sometime next week?"',
        'Low-pressure: "No pressure if not, but I\'d be interested in meeting up if you are."',
        'Playful but clear: "I think this conversation might be even better with coffee involved. Want to test that theory Saturday?"',
        'Video-call-first: "Would you want to do a quick video call before we plan anything in person?"',
        'Stepping back: "No worries if the timing is not right. I enjoyed talking with you and wish you well."',
      ],
    },
    {
      type: 'read-through',
      title: 'Final Templates',
      intro: 'Use these as starting points. You can make them more like you without making them less clear.',
      bullets: [
        'Coffee: "I\'ve liked talking with you. Would you want to grab coffee this weekend? No pressure if not."',
        'Walk: "Would you be up for a walk at [place] on [day]? I think it would be nice to talk in person."',
        'Low-pressure activity: "There\'s a [market/bookstore/museum] I\'ve wanted to check out. Want to go together sometime next week?"',
        'Video call first: "I usually like doing a quick call before meeting. Would that feel okay to you?"',
        'Responding to maybe: "Totally okay. We can keep chatting and see how it feels."',
        'If they are not engaging: "I don\'t want to push this if the interest is not mutual, so I\'ll step back. Wishing you well."',
      ],
    },
    {
      type: 'read-through',
      title: 'Online Dating Reality Checks',
      bullets: [
        'Tone is harder to read over text because there is no body language, facial expression, or tone of voice to fill in the gaps.',
        'Sarcasm and humor can easily land wrong in text. When in doubt, be more literal than you think you need to be.',
        'You are never obligated to send photos. Anyone who pressures you for photos before you are ready is a red flag.',
        'Anything you send can be screenshotted and shared. Share with that possibility in mind.',
        'Dating apps can feel exhausting. It is okay to limit the number of conversations you have at once and take breaks when apps feel draining.',
        'Rejection on apps is normal and happens to everyone. A no is information, not a verdict on your worth.',
      ],
    },
    {
      type: 'checklist',
      title: 'Before You Go',
      items: [
        'Reduce avoidable stress: choose clothes that feel comfortable, clean, and right for the location',
        'Do the basics that help you feel settled — deodorant, teeth brushed, phone charged',
        'Choose a public place where you can hear, regulate, and leave easily if you need to',
        'Tell someone you trust where you are going and have your own way home',
        'Confirm the time and place before leaving so you are not managing uncertainty on the way there',
        'Pick a location with your own sensory needs in mind — you will be more present somewhere that does not overwhelm you',
      ],
    },
  ],
}

// ── Introducing Yourself to a New Colleague ────────────────────────────────

const introducingNewColleague: Course = {
  id: 'introducing-new-colleague',
  title: 'Introducing Yourself to a New Colleague',
  description: 'A workplace course where Beckett helps you introduce yourself clearly, warmly, and usefully without overexplaining or masking too hard.',
  estimatedMinutes: 35,
  confidenceQuestion: 'How confident do you feel introducing yourself to a new colleague?',
  confidenceIntro: 'In this course, Beckett will coach you through making a new work introduction feel less vague and less performative. You will practice saying who you are, what your role is, how you like to collaborate, and how to invite the other person into a smoother working rhythm.',
  reflectiveQuestion: 'What is one introduction line or collaboration preference you want to use or convey to a new colleague?',
  reviewWrongAnswers: true,
  reviewConversationTurns: 4,
  openPractice: {
    matchName: 'Maya',
    matchDescription: 'a cross-functional colleague who has just been introduced to you on a beta onboarding project',
    systemPrompt: `You are Maya, a cross-functional colleague who has just been introduced to the user on a workplace project. You are friendly, busy, and practical. You want to understand who the user is, what they are working on, and how to collaborate without making the exchange too long.

Keep responses realistic for workplace Slack or email. Do not be overly enthusiastic. If the user is clear and collaborative, respond warmly and give a useful next step. If the user is vague, ask a simple clarifying question. If the user overshares or apologizes heavily, respond kindly but redirect toward the work context.

Never break character. You are Maya, not Beckett.`,
  },
  slides: [
    {
      type: 'interactive-read',
      title: 'What A Good Intro Actually Does',
      description: 'An introduction is not a performance. It is a small bridge.',
      sections: [
        {
          heading: 'The point of the intro',
          bullets: [
            'When you meet a new colleague, the goal is not to sound impressive, perfectly casual, or instantly close.',
            'The goal is to give the other person enough context to know who you are, why you are in their work world, and how to start interacting with you.',
            'You do not have to explain your whole personality, your diagnosis, your entire job history, or every reason you communicate the way you do.',
          ],
        },
        {
          heading: 'A good intro answers four quiet questions',
          bullets: [
            'Who are you?',
            'Why are we connected?',
            'What should I know about working with you?',
            'What is the easiest next step?',
          ],
        },
        {
          heading: 'What to remember',
          bullets: [
            'Clear is better than impressive.',
            'Warmth can be small.',
            'You do not need to disclose personal context to make collaboration easier.',
            'A useful intro helps both people understand what happens next.',
          ],
        },
      ],
      comparison: {
        scenario: 'You are introducing yourself to Maya, a colleague joining the same beta onboarding project.',
        good: {
          label: 'Balanced',
          message: 'Hi Maya, I am Sloane. I will be working with you on the beta onboarding flow. I am usually helpful with organizing messy pieces and spotting where users might get confused. What is the easiest way for us to stay aligned on this?',
          note: 'Gives identity, context, contribution, and a next step. Clear without overexplaining.',
        },
        bad: {
          label: 'Too little',
          message: 'Hi, nice to meet you.',
          note: 'Polite, but it does not give enough context. The other person may not know what you do, why you are reaching out, or how to continue.',
        },
      },
    },
    {
      type: 'flip-cards',
      title: 'Your Main Intro Goal',
      description: 'Different introductions need different signals. Tap each goal to see what Beckett would emphasize.',
      cards: [
        {
          front: 'Be friendly',
          back: [
            'Use their name and one small warmth signal.',
            'Try: "Good to meet you" or "I am glad we will be working together."',
            'You do not need to become extra casual to sound friendly.',
          ],
        },
        {
          front: 'Make collaboration smoother',
          back: [
            'Name your role and the easiest next step.',
            'Try: "I will be focused on onboarding and user confusion points. What is the best way for us to stay aligned?"',
            'This helps the other person know what to do next.',
          ],
        },
        {
          front: 'Explain my role',
          back: [
            'Keep the role concrete rather than impressive.',
            'Try: "I will be helping with the launch checklist and handoff details."',
            'A useful role description gives the other person a way to route questions to you.',
          ],
        },
        {
          front: 'Set expectations',
          back: [
            'Name one practical collaboration preference lightly.',
            'Try: "I tend to work best when decisions are written down, so I may recap next steps in Slack."',
            'Frame it as useful information, not a warning.',
          ],
        },
      ],
    },
    {
      type: 'interactive-read',
      title: 'Your Strengths At Work',
      description: 'A work intro is easier when you lead with useful context, not apology.',
      sections: [
        {
          heading: 'Lead with contribution',
          bullets: [
            'Many neurodivergent people get used to explaining what might be difficult before naming what they bring.',
            'Beckett will help you flip that order.',
            'Your strengths do not need to sound like corporate buzzwords. They just need to help the other person understand what kind of teammate you are.',
          ],
        },
        {
          heading: 'Strength examples',
          bullets: [
            'I notice patterns other people may miss.',
            'I am good at organizing scattered information.',
            'I ask clarifying questions early so we do not lose time later.',
            'I can be direct in a way that helps decisions move.',
            'I care about getting the details right.',
            'I am thoughtful about tone and how something may land.',
          ],
        },
        {
          heading: 'What to avoid',
          bullets: [
            'Turning a strength into an apology.',
            'Listing too many strengths at once.',
            'Trying to sound like a performance review.',
            'Explaining a diagnosis when a practical work preference would be enough.',
          ],
        },
      ],
      comparison: {
        scenario: 'You know you ask clarifying questions early and want to mention that without apologizing.',
        good: {
          label: 'Strength framing',
          message: 'I tend to ask clarifying questions early so I can make sure I am building toward the right thing.',
          note: 'This explains the behavior as a work strength and makes the benefit clear.',
        },
        bad: {
          label: 'Apology framing',
          message: 'Sorry in advance, I ask a lot of questions because I sometimes have trouble understanding vague instructions.',
          note: 'This starts from self-defense and may make the other person feel like they need to reassure you.',
        },
      },
      draftPrompt: 'Write one sentence that names a strength or useful contribution you bring to a new colleague.',
      draftContext: 'The user is practicing a workplace introduction strength line. In one sentence, give specific feedback on whether it sounds useful, concise, and non-apologetic.',
    },
    {
      type: 'sorting',
      title: 'Warmth Without Overdoing It',
      instruction: 'Sort each intro as too cold, too much, or balanced. Beckett is aiming for direct and kind.',
      categories: ['Too cold', 'Too much', 'Balanced'],
      items: [
        {
          message: 'Hi. I am joining the project. Send me what I need.',
          correct: 'Too cold',
          explanation: 'Direct, but no warmth or collaboration signal. It may make the other person feel ordered around.',
        },
        {
          message: 'Hi Jordan!! I am honestly so relieved to be working with you because I have been nervous about this project and I really do best when people are patient with me, so thank you in advance.',
          correct: 'Too much',
          explanation: 'Asks for reassurance before the relationship has started. Some of this may be useful later, but it is heavy for a first intro.',
        },
        {
          message: 'Hi Jordan, I am Sloane. I will be helping with the launch checklist. Good to meet you, and happy to compare notes on how you want to split things up.',
          correct: 'Balanced',
          explanation: 'Friendly, clear, and gives the other person a practical next step.',
        },
        {
          message: 'Hey Jordan, excited to work together. I am usually best with written next steps after we talk, so I may recap decisions in Slack as we go.',
          correct: 'Balanced',
          explanation: 'Names a preference lightly and makes it sound useful for the work, not like a burden.',
        },
        {
          message: 'I promise I am easy to work with once you get used to me.',
          correct: 'Too much',
          explanation: 'This sounds like a warning and asks the colleague to manage anxiety before they know the work context.',
        },
        {
          message: 'Loop me in when there is something for me to do.',
          correct: 'Too cold',
          explanation: 'Efficient, but it does not create a working relationship or clarify your role.',
        },
      ],
    },
    {
      type: 'interactive-read',
      title: 'Setting Collaboration Preferences',
      description: 'Preferences are not demands when you frame them as collaboration information.',
      sections: [
        {
          heading: 'Make it mutual',
          bullets: [
            'You do not need to say, "I need you to communicate with me this exact way."',
            'You can say, "Here is what helps me work well, and I would like to know what works for you too."',
            'Asking about their style makes the intro feel mutual instead of one-sided.',
          ],
        },
        {
          heading: 'Useful preference categories',
          bullets: [
            'Written follow-up after meetings.',
            'Clear priorities when there are multiple tasks.',
            'Slack for quick questions, email for longer context.',
            'Direct feedback instead of vague hints.',
            'A heads-up when something is urgent.',
            'Time to process before giving a final answer.',
            'Examples or reference points when starting a new task.',
          ],
        },
        {
          heading: 'Preference formula',
          bullets: [
            'I tend to work best with [specific preference], especially when [situation]. What works best for you?',
            'Example: "I tend to work best with written next steps after a meeting, especially when there are multiple decisions. What works best for you?"',
            'Example: "I do best when priorities are explicit, especially if several things are urgent at once."',
          ],
        },
      ],
      draftPrompt: 'Write one collaboration preference you might include in an intro.',
      draftContext: 'The user is practicing naming a workplace collaboration preference in a first intro. Give one sentence of feedback focused on whether it sounds practical, mutual, and not too demanding.',
    },
    {
      type: 'matching',
      title: 'Translate The Preference',
      description: 'Match the raw thought to a workplace intro version that is clearer and easier for a new colleague to receive.',
      instruction: 'Tap a raw thought, then tap the workplace version that matches it.',
      pairs: [
        {
          left: {
            name: 'Raw thought',
            description: 'I hate when people are vague.',
            mismatchNote: 'Look for the version that asks for clarity without judging the other person.',
          },
          right: {
            name: 'Work intro version',
            description: 'I tend to work best when priorities and next steps are explicit.',
          },
        },
        {
          left: {
            name: 'Raw thought',
            description: 'I get overwhelmed when people throw a bunch of tasks at me at once.',
            mismatchNote: 'Look for the version that names what helps when there are multiple moving pieces.',
          },
          right: {
            name: 'Work intro version',
            description: 'If there are several moving pieces, it helps me to know what is most urgent first.',
          },
        },
        {
          left: {
            name: 'Raw thought',
            description: 'I need time to think before answering.',
            mismatchNote: 'Look for the version that makes processing time sound professional and useful.',
          },
          right: {
            name: 'Work intro version',
            description: 'For bigger questions, I may take a little time to think and then come back with a clearer answer.',
          },
        },
        {
          left: {
            name: 'Raw thought',
            description: 'I miss things if they are only said out loud once.',
            mismatchNote: 'Look for the version that asks for a durable next-step record.',
          },
          right: {
            name: 'Work intro version',
            description: 'I work best when decisions and next steps are written down after we talk.',
          },
        },
      ],
    },
    {
      type: 'flip-cards',
      title: 'What Can Go Wrong',
      description: 'Most awkward introductions go sideways from too little context or too much pressure. Tap each trap.',
      cards: [
        {
          front: 'The Vanishing Intro',
          back: [
            'You say "nice to meet you," then disappear.',
            'Problem: The other person has no next step.',
            'Better: Add your role, context, or a small follow-up question.',
          ],
        },
        {
          front: 'The Defensive Intro',
          back: [
            'You explain all the ways people have misunderstood you before.',
            'Problem: The other person may feel warned before they have done anything.',
            'Better: Translate the need into one practical work preference.',
          ],
        },
        {
          front: 'The Resume Intro',
          back: [
            'You list credentials, projects, or achievements.',
            'Problem: It may sound formal or self-protective instead of collaborative.',
            'Better: Name one useful contribution that matters for this work.',
          ],
        },
        {
          front: 'The Over-Casual Mask',
          back: [
            'You try to sound breezy or funny in a way that does not feel like you.',
            'Problem: It can make the interaction more draining and less clear.',
            'Better: Use small warmth, not a whole new personality.',
          ],
        },
        {
          front: 'The Hidden Need',
          back: [
            'You have a real work preference but do not name it.',
            'Problem: You may get frustrated later when the other person does not guess it.',
            'Better: Name one preference lightly and explain why it helps the work.',
          ],
        },
      ],
    },
    {
      type: 'side-by-side',
      title: 'Fix The Intro',
      scenario: 'You want to explain that you ask a lot of clarifying questions, but the first draft starts from anxiety instead of collaboration.',
      bad: {
        label: 'Original',
        message: 'Hey, I am Sloane. I am joining this project. I sometimes ask a lot of questions, but I promise I am not trying to be difficult. I have had people get annoyed with me before, so I just wanted to say that.',
        note: 'Starts with anxiety, asks the colleague to reassure you, and explains past pain before the current collaboration.',
      },
      good: {
        label: 'Better',
        message: 'Hi, I am Sloane. I will be helping with the onboarding flow. I tend to ask clarifying questions early so I can make sure I am solving the right problem. Good to meet you, and happy to sync on how you want to split the work.',
        note: 'Same underlying need, but framed as useful work context with a clear next step.',
      },
    },
    {
      type: 'interactive-read',
      title: 'Choose The Channel',
      description: 'The same introduction changes depending on where it happens.',
      sections: [
        {
          heading: 'Slack or Teams DM',
          bullets: [
            'Best for a quick, friendly intro when you are starting a project together.',
            'Recommended length: 2-3 sentences.',
            'Example: "Hi Maya, I am Sloane. I will be helping with the beta onboarding flow. Good to meet you. What is the easiest way for us to stay aligned on this?"',
          ],
        },
        {
          heading: 'Email',
          bullets: [
            'Best when the person needs more context, several people are involved, or you want a written record.',
            'Recommended length: one short paragraph plus a question.',
            'Example: "I am Sloane, and I will be helping with the beta onboarding flow. I am usually helpful with organizing messy pieces and spotting where users might get confused. What is the easiest way for us to stay aligned?"',
          ],
        },
        {
          heading: 'Meeting or in person',
          bullets: [
            'Best when you are being introduced live and the intro needs to be easy to say out loud.',
            'Recommended length: 1-2 sentences.',
            'Example: "I am Sloane. I will be helping with onboarding and user flow. I am usually useful when there are a lot of moving pieces to organize, and I am looking forward to working with you."',
          ],
        },
        {
          heading: 'New project kickoff',
          bullets: [
            'Best when collaboration is starting immediately and multiple work styles may be involved.',
            'Recommended length: role + contribution + preference + group question.',
            'Example: "I will be focused on onboarding and user confusion points. I tend to work best when decisions and next steps are written down, so I may recap what we decide after meetings."',
          ],
        },
      ],
    },
    {
      type: 'draft-practice',
      title: 'Build Your Intro',
      prompt: 'Write a first draft using this structure: greeting, name, work context, useful contribution, collaboration preference or next step, and a question back to them.',
      draftContext: 'The user is drafting a first message to a new colleague. Give concise, specific feedback on clarity, warmth, whether it overexplains, and whether the other person has an easy way to respond.',
    },
    {
      type: 'read-through',
      title: 'Help Me Start Options',
      intro: 'If starting is the hardest part, borrow one of these and adjust it. The goal is a message you would actually send.',
      bullets: [
        'Direct: "Hi Maya, I am Sloane. I will be working with you on the onboarding flow. Good to meet you."',
        'Warm: "Hi Maya, I am Sloane. I am glad we will be working together on onboarding. I would love to learn how you like to stay aligned on projects like this."',
        'Structured: "Hi Maya, I am Sloane. I will be focused on user confusion points in the onboarding flow. I tend to work best with written next steps, so I may recap decisions as we go."',
        'Short version: "Hi [Name], I am [Your Name]. I will be working with you on [context]. I am usually helpful with [strength]. Good to meet you."',
        'Warmer version: "Hi [Name], I am [Your Name]. I am glad we will be working together on [context]. I am usually helpful with [strength], and I would love to learn how you like to stay aligned on projects like this."',
        'Structured version: "Hi [Name], I am [Your Name]. I will be focused on [role/context]. I tend to work best with [preference], especially when [situation]. What is the easiest way for us to coordinate?"',
      ],
    },
    {
      type: 'checklist',
      title: 'Final Checklist',
      items: [
        'I said who I am',
        'I explained why I am reaching out',
        'I included one useful work context point',
        'I avoided apologizing for existing',
        'I gave them an easy way to respond',
        'I kept sensitive personal context optional',
      ],
    },
  ],
}

// ── Asking for Clarity Without Feeling Uncomfortable ───────────────────────

const askingForClarity: Course = {
  id: 'asking-for-clarity',
  title: 'Asking for Clarity Without Feeling Uncomfortable',
  description: 'A workplace course where Beckett helps you ask specific, calm follow-up questions without over-apologizing or pretending you understand.',
  estimatedMinutes: 35,
  confidenceQuestion: 'How confident do you feel asking for clarity at work?',
  confidenceIntro: 'In this course, Beckett will coach you through asking better clarifying questions in Slack, email, meetings, and project conversations. You will practice naming what you understand, what is still unclear, and what specific answer would help you move forward.',
  reflectiveQuestion: 'What is one clarity question or phrase you want to use at work?',
  reviewWrongAnswers: true,
  reviewConversationTurns: 4,
  openPractice: {
    matchName: 'Jordan',
    matchDescription: 'a busy but reasonable manager who gave you a vague task in Slack',
    systemPrompt: `You are Jordan, a busy but reasonable workplace manager. You gave the user a vague task because you were moving quickly, not because you are trying to confuse them. You respond best to specific, concise clarifying questions.

Keep responses realistic for Slack or workplace chat. Start from this task: "Can you clean up the onboarding flow before the team review?" If the user asks a clear specific question, answer it and give a useful next step. If the user is vague, ask what part they need clarified. If the user over-apologizes, respond kindly but keep the conversation focused on the work. If the user sounds defensive or frustrated, stay professional and redirect toward the task.

Never break character. You are Jordan, not Beckett.`,
  },
  slides: [
    {
      type: 'interactive-read',
      title: 'What Clarity Actually Is',
      description: 'Clarity is not needing extra help. Clarity is shared alignment.',
      sections: [
        {
          heading: 'Why clarity matters',
          bullets: [
            'At work, people often speak in shortcuts. They may assume you know the deadline, the priority, the audience, the definition of done, or which parts matter most.',
            'Sometimes they are not trying to be vague; they are just moving quickly.',
            'Asking for clarity is how you reduce rework. It is a way to make sure you are solving the right problem.',
          ],
        },
        {
          heading: 'What can be unclear',
          bullets: [
            'What the actual goal is.',
            'What "done" means.',
            'Which task matters first.',
            'How urgent "urgent" really is.',
            'Who owns the decision.',
            'What background context you are expected to know.',
            'Whether the person wants a quick answer, a polished draft, or a deeper recommendation.',
          ],
        },
        {
          heading: 'Helpful reframe',
          bullets: [
            'Instead of "I should already understand this," try "I need enough information to do the right work."',
            'Instead of "I am bothering them," try "I am preventing a misunderstanding before it costs more time."',
            'A practical question is not proof that you are behind, difficult, or not smart enough.',
          ],
        },
      ],
    },
    {
      type: 'flip-cards',
      title: 'What Kind of Clarity Do You Need?',
      description: 'Tap each card to see what the question is really asking for.',
      cards: [
        {
          front: 'Priority',
          back: [
            'You need to know what matters first.',
            'Useful question: "If I can only finish one part today, which part should I prioritize?"',
          ],
        },
        {
          front: 'Deadline',
          back: [
            'You need to know when something is actually needed.',
            'Useful question: "Do you need this by end of day today, or is tomorrow morning okay?"',
          ],
        },
        {
          front: 'Definition of done',
          back: [
            'You need to know what finished means.',
            'Useful question: "When you say clean up, do you mean copy edits, restructuring, or both?"',
          ],
        },
        {
          front: 'Context',
          back: [
            'You need to know why this matters or what background should guide the work.',
            'Useful question: "Is there background context or an example I should look at before I start?"',
          ],
        },
        {
          front: 'Ownership',
          back: [
            'You need to know who decides, reviews, or approves.',
            'Useful question: "Who should make the final call on this?"',
          ],
        },
        {
          front: 'Tone or polish',
          back: [
            'You need to know how direct, polished, or detailed something should be.',
            'Useful question: "Should this be a rough internal pass, a clean draft, or ready to send?"',
          ],
        },
      ],
    },
    {
      type: 'read-through',
      title: 'Why Asking Can Feel Hard',
      intro: 'If asking for clarity feels emotionally loaded, that makes sense. For a lot of neurodivergent people, clarifying questions have not always been received well.',
      bullets: [
        'You may have been told you were overthinking, missing the obvious, asking too many questions, or slowing things down.',
        'You may worry people will think you are not capable.',
        'You may need more specificity than other people seem to need.',
        'You may process spoken instructions more slowly than written ones.',
        'You may not know if the question is reasonable.',
        'You may be afraid the person already explained it and you missed it.',
        'Asking earlier is usually less disruptive than fixing a misunderstanding later.',
        'One specific question is easier to answer than a vague "I am confused."',
        'You can sound confident and still ask for help.',
        'You do not have to apologize for needing the information required to do the work.',
      ],
    },
    {
      type: 'interactive-read',
      title: 'The Clarity Formula',
      description: 'A strong clarity question gives your brain a track to run on.',
      sections: [
        {
          heading: 'The four parts',
          bullets: [
            'What I understand.',
            'What I am unsure about.',
            'The specific question.',
            'Why it matters or what it helps me do.',
          ],
        },
        {
          heading: 'The formula',
          bullets: [
            'I understand [what you think is true].',
            'I am not sure about [unclear part].',
            'Should I [specific option A] or [specific option B]?',
            'That will help me [move forward / prioritize / avoid rework].',
          ],
        },
        {
          heading: 'Examples',
          bullets: [
            'Priority: "I understand both the deck and the launch checklist need updates. Should I prioritize the deck for today, or the checklist because it affects the team handoff?"',
            'Deadline: "I saw this is marked urgent. Do you need it by end of day today, or is tomorrow morning okay?"',
            'Definition of done: "When you say clean up, do you mean copy edits, restructuring, or both?"',
            'Missing context: "I can take a first pass. Is there background context I should read first so I do not duplicate work?"',
          ],
        },
      ],
      draftPrompt: 'Use the formula to write one clarity question for a real or imagined work request.',
      draftContext: 'The user is practicing a workplace clarity question. Give one concise sentence of feedback on whether it names what they understand, identifies the unclear part, asks a specific question, and avoids over-apologizing.',
    },
    {
      type: 'sorting',
      title: 'Good Questions vs. Vague Questions',
      instruction: 'Sort each message by what kind of clarity question it is.',
      categories: ['Strong clarity question', 'Too vague', 'Too apologetic'],
      items: [
        {
          message: 'Can you clarify?',
          correct: 'Too vague',
          explanation: 'It does not say what part needs clarification.',
        },
        {
          message: 'When you say urgent, do you mean today or before Friday?',
          correct: 'Strong clarity question',
          explanation: 'Names the unclear word and gives two answerable options.',
        },
        {
          message: 'Sorry, I know this is probably obvious, but I am confused about what you want.',
          correct: 'Too apologetic',
          explanation: 'The apology takes up more space than the actual question, and "what you want" is still vague.',
        },
        {
          message: 'I understand the goal is to reduce signup drop-off. Should I focus first on the headline copy or the form steps?',
          correct: 'Strong clarity question',
          explanation: 'Shows understanding and asks for a priority decision.',
        },
        {
          message: 'I am not sure what to do here.',
          correct: 'Too vague',
          explanation: 'Honest, but not specific enough to help the other person answer quickly.',
        },
        {
          message: 'Quick clarification: should this be a rough internal draft or something ready to send?',
          correct: 'Strong clarity question',
          explanation: 'Asks about the expected level of polish.',
        },
      ],
    },
    {
      type: 'interactive-read',
      title: 'Asking Without Over-Apologizing',
      description: 'You can be polite without apologizing for having a question.',
      sections: [
        {
          heading: 'Why apology can get heavy',
          bullets: [
            'Over-apologizing can happen when you are trying to soften the ask.',
            'The intention is good, but too much apology can make the question feel heavier than it needs to be.',
            'Beckett’s goal is not to make you sound cold. It is to help you sound calm and competent.',
          ],
        },
        {
          heading: 'Replace these openers',
          bullets: [
            'Instead of "Sorry, dumb question..." try "Quick clarification..."',
            'Instead of "Sorry if you already said this..." try "I want to make sure I captured this correctly..."',
            'Instead of "I am probably overthinking this..." try "To avoid taking this in the wrong direction..."',
            'Instead of "Sorry to bother you..." try "When you have a minute..."',
          ],
        },
        {
          heading: 'When a small apology is fine',
          bullets: [
            'You missed a clearly stated detail.',
            'You are asking after a delay.',
            'You are interrupting something urgent.',
            'Even then, keep it small and move to the question.',
          ],
        },
      ],
      comparison: {
        scenario: 'You need to ask what "clean this up" means.',
        bad: {
          label: 'Too apologetic',
          message: 'Sorry, this is probably annoying, but can you explain what you meant by “clean this up”?',
          note: 'The apology frames the question as a burden before the actual issue is clear.',
        },
        good: {
          label: 'Clearer',
          message: 'Quick clarification: when you say “clean this up,” do you mean copy edits, structure, or both?',
          note: 'Specific, answerable, and neutral.',
        },
      },
    },
    {
      type: 'matching',
      title: 'Rewrite The Apology',
      description: 'Match each over-apologetic question to a calmer workplace version.',
      instruction: 'Tap an original message, then tap the better version.',
      pairs: [
        {
          left: {
            name: 'Original',
            description: 'Sorry, this is probably annoying, but can you explain what you meant by “clean this up”?',
            mismatchNote: 'Look for the version that asks what "clean up" means directly.',
          },
          right: {
            name: 'Better',
            description: 'Quick clarification: when you say “clean this up,” do you mean copy edits, structure, or both?',
          },
        },
        {
          left: {
            name: 'Original',
            description: 'Sorry if this is obvious, but when is this due?',
            mismatchNote: 'Look for the version that confirms the deadline before prioritizing.',
          },
          right: {
            name: 'Better',
            description: 'I want to confirm the deadline before I prioritize this. Do you need it today or later this week?',
          },
        },
        {
          left: {
            name: 'Original',
            description: 'I am probably overthinking this, but should I make this polished?',
            mismatchNote: 'Look for the version that asks about rough versus polished work.',
          },
          right: {
            name: 'Better',
            description: 'To avoid overbuilding it, should this be a rough internal draft or a polished version?',
          },
        },
      ],
    },
    {
      type: 'interactive-read',
      title: 'When You Need More Context',
      description: 'Sometimes you do not need one answer. You need missing context.',
      sections: [
        {
          heading: 'Missing context is not failure',
          bullets: [
            'Needing context is different from being confused.',
            'It means the task is underspecified.',
            'Beckett can help you ask for the right kind of context instead of asking a broad question that may not get you what you need.',
          ],
        },
        {
          heading: 'Types of context to ask for',
          bullets: [
            'Example or reference point: "Is there an example of what good looks like for this?"',
            'Audience: "Who is the main audience for this: internal team, leadership, or beta users?"',
            'Decision-maker: "Who needs to approve the final version?"',
            'Constraints: "Are there any must-keep sections or things I should avoid changing?"',
            'Definition of done: "What would make this complete enough to hand off?"',
            'Level of polish: "Should this be rough thinking, a clean draft, or ready to send?"',
            'Priority: "If I only get to one part today, which part matters most?"',
          ],
        },
      ],
    },
    {
      type: 'multiple-choice',
      title: 'Pick The Missing Context',
      rounds: [
        {
          scenario: 'Your manager says, “Can you clean up the onboarding doc?” What is the strongest first question?',
          options: [
            { text: 'When you say clean up, do you mean copy edits, restructuring, or making it ready to share?', correct: true, explanation: 'This asks about definition of done, level of polish, and scope.' },
            { text: 'Can you clarify?', correct: false, explanation: 'Too broad. They still have to guess what is unclear.' },
            { text: 'I can do it.', correct: false, explanation: 'This accepts the task before you know what “clean up” means.' },
          ],
        },
        {
          scenario: 'A teammate says, “Can you help with the launch issue?” What is the strongest first question?',
          options: [
            { text: 'What launch issue?', correct: false, explanation: 'This is understandable, but it can be more specific and useful.' },
            { text: 'Yes. What part do you want me to own, and is this urgent for today?', correct: true, explanation: 'This asks about ownership and urgency in one clear move.' },
            { text: 'I am not sure I know enough to help.', correct: false, explanation: 'This may be true, but it does not ask for the missing information.' },
          ],
        },
        {
          scenario: 'Someone comments, “This feels off.” What is the strongest first question?',
          options: [
            { text: 'What do you mean?', correct: false, explanation: 'Too vague. It may restart the same unclear loop.' },
            { text: 'Helpful to know. Is it the tone, the structure, or the level of detail that feels off?', correct: true, explanation: 'This gives categories and makes the feedback easier to answer.' },
            { text: 'Okay, I will redo it.', correct: false, explanation: 'This jumps to rework before you know what needs to change.' },
          ],
        },
      ],
    },
    {
      type: 'interactive-read',
      title: 'Channel-Specific Clarity',
      description: 'Where you ask matters.',
      sections: [
        {
          heading: 'Slack or Teams',
          bullets: [
            'Best for quick priority checks, deadline confirmations, and simple A-or-B decisions.',
            'Example: "Quick clarification: should I prioritize the deck or the checklist first today?"',
          ],
        },
        {
          heading: 'Email',
          bullets: [
            'Best for longer context, decisions that need a written record, and questions with multiple parts.',
            'Example: "I want to make sure I am tracking the request correctly. I understand the goal is to update the onboarding flow before Friday. I have two questions: should I keep the current structure, and who needs to approve the final version?"',
          ],
        },
        {
          heading: 'Meeting',
          bullets: [
            'Best for complex tradeoffs, questions that affect several people, or moments when you need shared alignment quickly.',
            'Example: "Before we move on, can I clarify the priority? If there is only time for one piece this week, is the form flow or the email sequence more important?"',
          ],
        },
        {
          heading: 'Project doc or comment',
          bullets: [
            'Best for specific edits, questions tied to a sentence, design, or requirement, and keeping the answer attached to the work.',
            'Example: "When you say make this friendlier, do you mean warmer wording, less detail, or a more casual structure?"',
          ],
        },
        {
          heading: 'Public vs. private',
          bullets: [
            'Ask publicly when the answer affects multiple people, others may have the same question, or the decision should be visible.',
            'Ask privately when the question is mostly about your own processing, the uncertainty is not useful for the group, or the relationship feels sensitive.',
          ],
        },
      ],
    },
    {
      type: 'read-through',
      title: 'Help Me Start Options',
      intro: 'If you are stuck, start with one of these. Each one asks for a different kind of clarity.',
      bullets: [
        'Priority-focused: "Quick clarification: should I focus first on the copy, the form steps, or the overall structure?"',
        'Deadline-focused: "I can do that. Do you need a rough pass today or a cleaner version before the review?"',
        'Definition-of-done focused: "When you say clean up, do you mean small copy edits, a structure pass, or both?"',
        'Context-focused: "Is there an example or previous version I should use as the reference point?"',
        'Owner-focused: "Who should make the final call on this before I move forward?"',
        'Polish-focused: "Should this be rough thinking, a clean draft, or ready to send?"',
      ],
    },
    {
      type: 'checklist',
      title: 'Final Checklist',
      items: [
        'I named what I understand',
        'I named the unclear part',
        'I asked one specific question',
        'I gave options if that makes the answer easier',
        'I explained why the answer helps me move forward',
        'I did not apologize for needing information',
        'I chose the right channel for the question',
      ],
    },
  ],
}

export const COURSES: Course[] = [askSomeoneOut, introducingNewColleague, askingForClarity]

export function getCourse(id: string): Course | undefined {
  return COURSES.find(c => c.id === id)
}
