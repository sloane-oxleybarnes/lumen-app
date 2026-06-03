export type Difficulty = 'low' | 'medium' | 'high'
export type Category = 'personal' | 'professional'

export type Scenario = {
  persona: string
  situation: string
  difficulty: Difficulty
}

export type SkillModule = {
  id: string
  title: string
  description: string
  frame: string
  plan: 'pro'
  category: Category
  scenarios: Scenario[]
}

export const SKILL_MODULES: SkillModule[] = [
  {
    id: 'ask-someone-out',
    title: 'How to ask someone out',
    description: 'Reading signals, phrasing the ask, responding gracefully to a no.',
    frame: `Asking someone out is one of the most universally nerve-wracking social moments — not because it is complicated, but because the stakes feel personal. The good news: most people respond well to a direct, low-pressure ask that gives them an easy out. What tends to go wrong is either over-engineering it (long preamble, obvious anxiety) or under-committing (so vague they are not sure you meant it). The goal is a clear ask, delivered warmly, that leaves both of you feeling okay regardless of the answer.`,
    plan: 'pro',
    category: 'personal',
    scenarios: [
      { persona: 'a colleague you have been friendly with for a few months', situation: 'asking them to get coffee sometime', difficulty: 'low' },
      { persona: 'someone you met at an event last week', situation: 'asking if they would want to hang out again', difficulty: 'medium' },
    ],
  },
  {
    id: 'set-work-boundary',
    title: 'Setting a boundary at work',
    description: 'Calm, professional, non-confrontational language for protecting your time and energy.',
    frame: `Setting a boundary at work is not about being difficult — it is about being sustainable. The challenge is that most people either over-explain (which invites pushback) or avoid the conversation entirely (which leads to resentment). The most effective boundaries are stated simply, without apology, and without a long justification. You are not asking for permission. You are letting someone know what works for you. Done well, it actually increases respect.`,
    plan: 'pro',
    category: 'professional',
    scenarios: [
      { persona: 'a colleague who keeps adding work to your plate', situation: 'telling them you cannot take on more right now', difficulty: 'medium' },
      { persona: 'your manager', situation: 'pushing back on an unreasonable deadline', difficulty: 'high' },
    ],
  },
  {
    id: 'give-hard-feedback',
    title: 'Giving difficult feedback',
    description: 'Framing, tone, and timing for feedback that lands without damaging the relationship.',
    frame: `Difficult feedback is only as hard as the framing. When it feels personal, it lands badly. When it feels like you are on the same team, it can actually strengthen a relationship. The key is specificity over generality, observation over judgment, and genuine care over performance of care. People can tell the difference. The goal is not to make someone feel bad — it is to give them something they can actually use.`,
    plan: 'pro',
    category: 'professional',
    scenarios: [
      { persona: 'a peer whose work has been slipping', situation: 'letting them know you have noticed and want to help', difficulty: 'medium' },
      { persona: 'a direct report who missed an important deadline', situation: 'giving feedback without demoralizing them', difficulty: 'high' },
    ],
  },
  {
    id: 'ask-for-raise',
    title: 'Asking for a raise or promotion',
    description: 'Building the case, handling objections, staying confident under pressure.',
    frame: `Most people either avoid this conversation or go into it underprepared. The ones who get what they want usually do one thing differently: they make it easy for their manager to say yes. That means arriving with a clear case (specific contributions, market context, a number), and anticipating the most likely objections before they come up. Confidence here is not about volume — it is about knowing your value and being willing to state it plainly.`,
    plan: 'pro',
    category: 'professional',
    scenarios: [
      { persona: 'your manager in a 1:1', situation: 'bringing up compensation for the first time', difficulty: 'high' },
      { persona: 'your manager after they push back', situation: 'responding to "the budget is tight right now"', difficulty: 'high' },
    ],
  },
  {
    id: 'navigate-small-talk',
    title: 'Navigating small talk and networking',
    description: 'Starting conversations naturally, keeping them going, and exiting gracefully.',
    frame: `Small talk gets a bad reputation because most people do it badly — surface-level, performative, going nowhere. But it does not have to be that way. The best small talk is actually just genuine curiosity expressed efficiently. Ask one real question, listen to the answer, and follow the thread. The goal is not to impress anyone — it is to find the one interesting thing you have in common and spend two minutes on that. That is what people remember.`,
    plan: 'pro',
    category: 'personal',
    scenarios: [
      { persona: 'someone you do not know at a work event', situation: 'starting a conversation and keeping it going for a few minutes', difficulty: 'low' },
      { persona: 'a senior person in your field at a conference', situation: 'introducing yourself and making a genuine connection', difficulty: 'medium' },
    ],
  },
  {
    id: 'handle-passive-aggression',
    title: 'Handling passive aggression',
    description: 'De-escalation, clarity, and staying grounded when someone is being indirect.',
    frame: `Passive aggression is hard because engaging with it directly can feel like overreacting, while ignoring it lets it continue. The most effective response is neither — it is a calm, direct acknowledgment that creates an opening without escalating. You are not calling them out aggressively. You are simply naming what you are observing and giving them a chance to be direct. This works because most passive-aggressive behavior is a protection mechanism, not malice — and direct, non-threatening clarity often defuses it.`,
    plan: 'pro',
    category: 'personal',
    scenarios: [
      { persona: 'a colleague who sent a pointed "per my last email" message', situation: 'responding in a way that de-escalates without being a pushover', difficulty: 'medium' },
      { persona: 'someone in a meeting who keeps making backhanded comments', situation: 'addressing it calmly in the moment', difficulty: 'high' },
    ],
  },
]
