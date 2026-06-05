// ── Types ──────────────────────────────────────────────────────────────────

export type AccordionSlide = {
  type: 'accordion'
  title: string
  sections: { heading: string; bullets: string[] }[]
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
  cards: { front: string; back: string[] }[]
}

export type MatchingPair = {
  left: { name: string; description: string }
  right: { name: string; description: string }
}
export type MatchingSlide = {
  type: 'matching'
  title: string
  instruction: string
  pairs: MatchingPair[]
}

export type InteractiveReadSlide = {
  type: 'interactive-read'
  title: string
  sections: { heading: string; bullets: string[]; examples?: string[] }[]
  draftPrompt: string
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
  description: 'How to move from chatting to suggesting a date — with confidence, clear communication, and without overthinking it.',
  estimatedMinutes: 30,
  confidenceQuestion: 'How confident do you feel right now about asking someone out?',
  reflectiveQuestion: 'What is one thing you will do the next time you ask someone out?',
  reviewWrongAnswers: true,
  reviewConversationTurns: 4,
  openPractice: {
    matchName: 'Jamie',
    matchDescription: 'someone you matched with on a dating app four days ago — you have been chatting about music and weekend plans and you want to suggest meeting up',
    systemPrompt: `You are Jamie, chatting with someone on a dating app. You have been talking for four days about music and weekend plans. You are interested but cautious — you have been burned before by people who move too fast or give off concerning signals.

Keep messages short and realistic, the way people actually text on dating apps. Respond naturally to what they say.

If the conversation is genuine and warm, stay engaged and show growing interest. If they ask you out clearly and respectfully, agree.

If the person is vague, pushy, inappropriate, or makes you uncomfortable, become progressively less engaged — shorter responses, more noncommittal. If it continues to go poorly, your responses should trail off and eventually stop entirely (ghost them). Be realistic — real people ghost rather than explain.

Never break character. You are Jamie — you do not know you are in a practice scenario.`,
  },
  slides: [
    // ── Slide 1: Accordion ─────────────────────────────────────────────────
    {
      type: 'accordion',
      title: 'What Makes This Difficult',
      sections: [
        {
          heading: 'Differences in Social and Emotional Perception',
          bullets: [
            'Neurodivergent people often process social signals differently than neurotypical people.',
            'It can be difficult to pick up on subtle cues like sarcasm, flirtation, or implied interest.',
            'Strong emotional responses can be hard to manage or express in the moment.',
            'Intentions are frequently misread, and sometimes reading the other person\'s intentions can be difficult.',
            'Highly sensitive people may pick up on emotional undercurrents that feel overwhelming on a first date.',
            'Gifted or highly perceptive people may find standard getting-to-know-you conversations unbearably surface level.',
          ],
        },
        {
          heading: 'Anxiety and Sensory Sensitivities',
          bullets: [
            'Social environments like busy bars or restaurants can quickly cause sensory overload.',
            'Loud noises, bright lights, and crowded spaces make it hard to focus on the person in front of you.',
            'The cognitive load of managing sensory input leaves less mental space for genuine connection.',
            'Anxiety around rejection can be intense enough to prevent taking the first step entirely.',
            'Choosing quieter, more controlled settings is not high maintenance — it is setting yourself up to actually be present.',
          ],
        },
        {
          heading: 'Difficulty with Nonverbal Cues',
          bullets: [
            'Eye contact, facial expressions, and tone of voice are central to dating but can be hard to read or express.',
            'A lack of eye contact is often misread as disinterest when it is simply a comfort preference.',
            'ADHD can create impulsive responses that come across differently than intended.',
            'Misunderstandings from missing nonverbal cues can create insecurity on both sides.',
            'Over text, none of these cues exist at all — making digital communication both easier and harder at the same time.',
          ],
        },
        {
          heading: 'Hyperfixation on a New Person or Relationship',
          bullets: [
            'It is common to become intensely focused on someone new — replaying conversations and overanalyzing every message.',
            'ADHD hyperfocus can mean thinking about a new person constantly to the point of forgetting to eat or sleep.',
            'On the flip side, ADHD can also cause forgetting to reply for days, which sends a confusing signal.',
            'This intensity reflects genuine enthusiasm but can feel overwhelming to the other person if not paced.',
            'Awareness of this pattern helps you manage it rather than letting it drive the relationship.',
          ],
        },
        {
          heading: 'Masking',
          bullets: [
            'Many neurodivergent people suppress natural behaviors and perform a version of themselves they believe is more socially acceptable.',
            'In dating this is exhausting, unsustainable, and ultimately counterproductive.',
            'Masking prevents the other person from knowing who you actually are.',
            'The right person will not need you to perform — they will want to know the real version of you.',
            'Dating requires a lot of energy even without masking — adding it increases burnout significantly.',
          ],
        },
        {
          heading: 'Black and White Thinking',
          bullets: [
            'Ambiguous messages are easy to read as total rejection or total enthusiasm when reality is almost always in between.',
            'A slow response does not mean they are not interested — people get busy, distracted, and overwhelmed.',
            'Enthusiasm early on does not guarantee they are ready for something serious.',
            'Sitting with uncertainty is genuinely hard but is a normal part of early dating for everyone.',
            'Practicing tolerating ambiguity is one of the most useful skills in dating as a neurodivergent person.',
          ],
        },
        {
          heading: 'Challenges with Unspoken Rules',
          bullets: [
            'Dating has unspoken norms around flirting, timing, and pacing that are rarely explained and often assumed.',
            'These rules can feel foreign, illogical, or inconsistent — because for many people, they are.',
            'It is common to question whether you are doing things in the right order or at the right pace.',
            'The standard dating playbook was not written with neurodivergent people in mind.',
            'There is no single correct way to date — naming what you need helps create space for a connection that actually works for you.',
          ],
        },
        {
          heading: 'When You Are Also Managing Disclosure',
          bullets: [
            'One of the most anxiety-producing parts of dating for neurodivergent people is deciding when and how to share that you are neurodivergent.',
            'Disclose too early and risk rejection before the person really knows you.',
            'Wait too long and they may feel misled when certain traits become more visible.',
            'There is no perfect answer — but knowing this is a common and real source of stress means you are not alone in navigating it.',
            'The right person will respond to disclosure with curiosity and respect, not judgment.',
          ],
        },
      ],
    },

    // ── Slide 2: Read-through — Your Strengths ────────────────────────────
    {
      type: 'read-through',
      title: 'Your Strengths',
      intro: 'Before we get into the harder material — here is what neurodivergent people genuinely bring to relationships.',
      bullets: [
        'Intense loyalty — when you commit to someone, you mean it.',
        'Deep honesty — you tend to say what you mean, which builds real trust over time.',
        'Unusual sensitivity to patterns — you often notice things about people that others miss entirely.',
        'Creativity and depth — conversations with you rarely stay on the surface.',
        'Focused passion — when you care about something or someone, that care is real and genuine.',
      ],
      stats: [
        'About 75% of autistic adults strongly desire romance and deep connection, yet only around 5% are married compared to 50% of the general population — that gap reflects a tool mismatch, not a desire mismatch.',
        'Adults with ADHD score higher on the Passionate Love Scale than neurotypical controls — the desire and intensity of romantic feeling is actually greater, not less. Wanting love deeply is not the problem.',
        'Research from the University of Minnesota found that many people with Down syndrome experience sexual feelings, crushes, and a desire to date and have serious long-term relationships, regardless of cognitive disability.',
        'Partners of people with dyslexia frequently describe them as quirky, exciting, and different — the same traits that make communication harder often make connection deeper.',
      ],
    },

    // ── Slide 3: Flip cards — Who Should You Ask Out ──────────────────────
    {
      type: 'flip-cards',
      title: 'Who Should You Ask Out',
      cards: [
        {
          front: 'Compatibility',
          back: [
            'Shared interests: you don\'t need to like everything they like, but genuine overlap in how you spend your time matters more than surface similarities.',
            'Shared background: a similar relationship to the world — how you were raised, what you value, how you handle difficulty.',
            'Vision for the future: aligned direction matters more than identical plans.',
            'Similar stage of life: someone in a completely different phase creates friction no amount of chemistry can fix.',
            'Communication style compatibility: how you communicate matters as much as what you have in common.',
          ],
        },
        {
          front: 'Reading the Connection',
          back: [
            'They give consistent genuine effort — not just when it is convenient or exciting.',
            'They remember small things you mentioned in passing — they are actually listening.',
            'They ask questions that go below the surface — they want to know you, not just impress you.',
            'They make you feel emotionally safe — you can be honest without fear of judgment.',
            'They are not just responding to your messages — they are initiating too.',
          ],
        },
      ],
    },

    // ── Slide 4: Matching ─────────────────────────────────────────────────
    {
      type: 'matching',
      title: 'Who Would Match Well?',
      instruction: 'For each person on the left, find their best match on the right. Look for compatibility in communication style, values, and stage of life — not just shared hobbies.',
      pairs: [
        {
          left: {
            name: 'Maya, 28',
            description: 'Remote data analyst. Needs structure during the day but keeps evenings entirely open. Deeply introverted — recharges alone, communicates better over text, and takes time to warm up. Into pottery, foreign films, and solo walks. Wants something serious eventually but is not in a rush. Finds social pressure exhausting.',
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
          },
          right: {
            name: 'Leo, 35',
            description: 'Technical writer, fully remote, lives alone and has designed his life that way. Reads philosophy, plays chess online, listens to long niche podcasts. Values depth over breadth — one real conversation over ten shallow ones. Comfortable with quiet and needs a partner who is too.',
          },
        },
      ],
    },

    // ── Slide 5: Interactive read — How Do You Ask ────────────────────────
    {
      type: 'interactive-read',
      title: 'How Do You Ask',
      sections: [
        {
          heading: 'Be Confident',
          bullets: [
            'Be yourself — do not mask if that does not feel right.',
            'Plan what you are going to say in advance. Having a few phrases ready reduces cognitive load and is not inauthentic — it is smart preparation.',
            'It is okay to be nervous, and it is okay to say so.',
          ],
          examples: [
            '"I\'ve really been enjoying talking to you — would you want to meet up sometime this week?"',
            '"I know this might be a bit forward but I\'d love to grab coffee if you\'re open to it."',
            '"I\'ll be honest, I\'m a little nervous typing this — but I\'d love to meet you in person."',
          ],
        },
        {
          heading: 'Low Pressure Framing',
          bullets: [
            'Suggest a shared activity so it feels natural rather than high stakes.',
            'Give them an easy out so they do not feel cornered.',
            'Be prepared for a no without taking it personally.',
          ],
          examples: [
            '"There\'s a farmers market near me on Sunday — want to check it out? No pressure if not."',
            '"I was going to try that new coffee place this weekend — if you wanted to join, that could be fun."',
          ],
        },
        {
          heading: 'A Simple Direct Ask',
          bullets: [
            'Be clear — say it is a date, not just hanging out.',
            'Do not over-explain or say too much.',
            'Give them time to think and respond.',
          ],
          examples: [
            '"Would you want to go on a date? I\'m thinking coffee or a walk — whatever feels good to you."',
            '"I\'d love to take you out properly if you\'re interested."',
          ],
        },
      ],
      draftPrompt: 'You\'ve been chatting with someone for a week. Write the message you\'d send to ask them out.',
      draftContext: 'The user is practicing asking someone out on a dating app after one week of chatting. In one sentence (max 20 words), give honest specific feedback on their message — focus on tone, clarity, and whether it gives the person something to say yes to.',
    },

    // ── Slide 6: Side-by-side ─────────────────────────────────────────────
    {
      type: 'side-by-side',
      title: 'Spot the Difference',
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

    // ── Slide 7: Sorting ──────────────────────────────────────────────────
    {
      type: 'sorting',
      title: 'Sort These Asks',
      instruction: 'Is each message a good ask or not quite right? Tap to sort.',
      categories: ['Good ask', 'Not quite right'],
      items: [
        {
          message: '"We should hang out sometime."',
          correct: 'Not quite right',
          explanation: 'Too vague — gives the other person nothing concrete to say yes to.',
        },
        {
          message: '"Would you want to grab coffee this Saturday? There\'s a quiet spot near the park I like."',
          correct: 'Good ask',
          explanation: 'Specific time, specific suggestion, low pressure.',
        },
        {
          message: '"I\'ve been thinking about you honestly more than I expected, and I know it\'s only been a few days but I really want to meet you. Is that weird?"',
          correct: 'Not quite right',
          explanation: 'Oversharing intensity — too much emotional weight for this early stage.',
        },
        {
          message: '"This is probably going to sound forward but I\'d love to meet up — are you free for a walk this week?"',
          correct: 'Good ask',
          explanation: 'Self-aware framing, genuine, gives them something specific to respond to.',
        },
        {
          message: '"Let me know whenever you\'re free!"',
          correct: 'Not quite right',
          explanation: 'Too vague — puts all the planning work on them.',
        },
        {
          message: '"You should come over — I\'ll cook, it\'s way more relaxed than going out."',
          correct: 'Not quite right',
          explanation: 'Home is not the right location for a first meeting with someone you only know online.',
        },
        {
          message: '"I feel like we\'d have a lot to talk about in person. Would you want to try that new bookshop café on Sunday?"',
          correct: 'Good ask',
          explanation: 'Warm reasoning, specific suggestion, clear timing.',
        },
        {
          message: '"I really like talking to you and would hate for this to just fade — can we please meet up?"',
          correct: 'Not quite right',
          explanation: 'Fear-of-loss framing comes across as anxious and puts quiet pressure on them.',
        },
      ],
    },

    // ── Slide 8: Flip cards — What Tends to Go Wrong ──────────────────────
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
          front: 'Picking a Bad Location',
          back: [
            'High stimulus environments make it hard to focus and can trigger sensory overload for you or them.',
            'Good first date locations: a quiet coffee shop, a walk in a park, a low-key museum, a bookstore, a farmers market — somewhere you can actually hear each other.',
            'The goal is a setting where both people can relax and be present.',
          ],
        },
      ],
    },

    // ── Slide 9: Multiple choice ──────────────────────────────────────────
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

    // ── Slide 10: Read-through — Online Dating Tips ───────────────────────
    {
      type: 'read-through',
      title: 'Online Dating Tips',
      bullets: [
        'Tone is much harder to read over text — there is no body language, facial expression, or tone of voice to fill in the gaps.',
        'Sarcasm and humor can easily land wrong in text — when in doubt, be more literal than you think you need to be.',
        'You are never obligated to send photos — anyone who pressures you for photos before you are ready is a red flag.',
        'Anything you send can be screenshotted and shared — assume anything you say or share could be seen by others.',
        'A video call before meeting is a smart low-pressure way to confirm the person is who they say they are.',
        'Always choose a public place for a first meeting — a coffee shop or park, never a home.',
        'Mainstream dating apps can feel exhausting for neurodivergent people — rapid swiping and constant notifications create decision paralysis and emotional depletion.',
        'It is okay to limit the number of conversations you have at once and to take breaks when apps feel draining rather than exciting.',
        'Rejection on apps is normal and happens to everyone — but it can feel disproportionately painful when you process emotions intensely. Limiting daily app time and not attaching significance to individual rejections is a practical coping strategy.',
      ],
    },

    // ── Slide 11: Checklist — Presenting Yourself ─────────────────────────
    {
      type: 'checklist',
      title: 'Before You Go',
      items: [
        'Clothes are clean and free of visible stains or wrinkles',
        'Hair is washed and tidy',
        'Deodorant applied',
        'Perfume or cologne applied lightly — a little goes a long way, especially in an enclosed space',
        'Outfit fits the location and occasion',
        'Nails are clean and trimmed',
        'Teeth brushed before leaving',
        'Phone charged so you are not anxious about it dying',
        'Date location chosen with your own sensory needs in mind — you will be more present somewhere that does not overwhelm you',
      ],
    },
  ],
}

export const COURSES: Course[] = [askSomeoneOut]

export function getCourse(id: string): Course | undefined {
  return COURSES.find(c => c.id === id)
}
