export type CalendarAttendee = {
  name: string | null;
  email: string | null;
  responseStatus?: string | null;
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  attendees: CalendarAttendee[];
};

export function hasOtherAttendees(event: Pick<CalendarEvent, "attendees">) {
  return event.attendees.length > 0;
}

export function eventsOnDay(events: CalendarEvent[], date: Date) {
  return events.filter((event) => new Date(event.start).toDateString() === date.toDateString());
}

export function formatEventTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function attendeeNames(event: Pick<CalendarEvent, "attendees">) {
  return event.attendees
    .map((attendee) => attendee.name || attendee.email)
    .filter((value): value is string => Boolean(value));
}

export type DaySuggestion = {
  title: string;
  detail: string;
  kind: "break" | "prep" | "focus" | "open";
  event?: CalendarEvent;
};

function durationInMinutes(event: CalendarEvent) {
  if (!event.end) return 0;
  return Math.max(0, (new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000);
}

function findLunchOpening(events: CalendarEvent[], day: Date, now: Date) {
  const lunchStart = new Date(day);
  lunchStart.setHours(11, 30, 0, 0);
  const lunchEnd = new Date(day);
  lunchEnd.setHours(14, 30, 0, 0);
  const timedEvents = events
    .filter((event) => event.end)
    .map((event) => ({ start: new Date(event.start), end: new Date(event.end as string) }))
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  let openingStart = now > lunchStart ? now : lunchStart;

  for (const event of timedEvents) {
    if (event.end <= lunchStart || event.start >= lunchEnd) continue;
    const openingEnd = event.start < lunchEnd ? event.start : lunchEnd;
    if (openingEnd.getTime() - openingStart.getTime() >= 30 * 60_000) return openingStart;
    if (event.end > openingStart) openingStart = event.end;
  }

  return lunchEnd.getTime() - openingStart.getTime() >= 30 * 60_000 ? openingStart : null;
}

export function getDaySuggestion(events: CalendarEvent[], now = new Date()): DaySuggestion {
  const today = eventsOnDay(events, now).sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());
  const upcoming = today.filter((event) => new Date(event.start).getTime() >= now.getTime());
  const nextMeeting = upcoming.find(hasOtherAttendees);
  const soonMeeting = upcoming.find((event) => hasOtherAttendees(event) && new Date(event.start).getTime() - now.getTime() <= 2 * 60 * 60_000);
  const hasLunch = today.some((event) => /lunch|meal|break/i.test(event.title));
  const backToBack = upcoming.some((event, index) => {
    const previous = upcoming[index - 1];
    return Boolean(previous?.end && new Date(event.start).getTime() - new Date(previous.end).getTime() <= 15 * 60_000);
  });
  const longMeeting = upcoming.find((event) => durationInMinutes(event) >= 75);

  if (!today.length) {
    return {
      title: "Your calendar is open today.",
      detail: "Choose one useful focus or a restorative activity that will make the day feel good.",
      kind: "open",
    };
  }

  if (backToBack) {
    return {
      title: "Your upcoming meetings are close together.",
      detail: "A five-minute reset between them could make the next conversation easier to enter.",
      kind: "break",
    };
  }

  if (soonMeeting) {
    return {
      title: `Prepare for ${soonMeeting.title}.`,
      detail: `You are meeting with ${attendeeNames(soonMeeting).slice(0, 2).join(" and ") || "another person"} soon. A few minutes on your outcome could reduce pressure.`,
      kind: "prep",
      event: soonMeeting,
    };
  }

  const lunchWindowEnd = new Date(now);
  lunchWindowEnd.setHours(14, 30, 0, 0);
  if (!hasLunch && upcoming.length && now < lunchWindowEnd) {
    const opening = findLunchOpening(today, now, now);
    if (opening) {
      return {
        title: "You have room for a lunch break.",
        detail: `There is a 30-minute opening around ${formatEventTime(opening.toISOString())}. Beckett will not change your calendar without your approval.`,
        kind: "break",
      };
    }
    return {
      title: "Your schedule has no clear lunch break.",
      detail: "Your meetings are packed through the middle of the day. A short reset before or after the busiest stretch may help.",
      kind: "break",
    };
  }

  if (longMeeting) {
    return {
      title: `Make space after ${longMeeting.title}.`,
      detail: "This is a longer scheduled meeting. A brief reset afterward may help you transition to what is next.",
      kind: "break",
      event: longMeeting,
    };
  }

  if (nextMeeting) {
    return {
      title: `Prepare for ${nextMeeting.title}.`,
      detail: `You are meeting with ${attendeeNames(nextMeeting).slice(0, 2).join(" and ") || "another person"}. A few minutes on your outcome could reduce pressure.`,
      kind: "prep",
      event: nextMeeting,
    };
  }

  return {
    title: "Your scheduled time has some breathing room.",
    detail: "Use the open space for one focused task or a small reset before your next commitment.",
    kind: "focus",
  };
}
