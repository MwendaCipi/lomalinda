/**
 * The church's ordinary week, told from its meetings.
 *
 * The week used to be three strings in Church Settings — "Wednesday · 8:00 PM
 * – 9:00 PM" — which this module parsed back into a day and a clock. It is now
 * told from WeeklyMeeting records the personal ministries leader keeps, so the
 * app reads a day and two times instead of guessing them out of a sentence.
 *
 * Everything that draws the church's week comes through here: the website's
 * gathering card, the dashboard's slider, the calendar, the homepage's weekly
 * calendar and the identity bar's live badge. One clock, one answer.
 */

/** One meeting as the API returns it. `weekday` is 0 = Monday … 6 = Sunday. */
export type WeeklyMeeting = {
  id: number;
  title: string;
  weekday: number;
  weekday_label: string;
  /** "20:00" — the API sends a clock, not seconds. */
  start_time: string;
  end_time: string;
  place: string;
  online: boolean;
  meeting_link: string;
  notes: string;
  is_active: boolean;
  sort_order: number;
};

export type Gathering = {
  /** The meeting's id, or null when the week is empty and nothing stands in. */
  id: number | null;
  name: string;
  /** "Wednesday · 8:00 PM – 9:00 PM" — the week said out loud. */
  time: string;
  place: string;
  online: boolean;
  /** Where members join when it meets online. */
  link: string;
  active: boolean;
  date: Date;
};

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "20:00" as a clock face: "8:00 PM". */
function clockFace(value: string): string {
  const [rawHour, rawMinute] = (value || "").split(":");
  const hour = Number(rawHour);
  if (!Number.isFinite(hour)) return "";
  const minute = Number(rawMinute);
  const suffix = hour >= 12 ? "PM" : "AM";
  const face = hour % 12 === 0 ? 12 : hour % 12;
  return `${face}:${String(Number.isFinite(minute) ? minute : 0).padStart(2, "0")} ${suffix}`;
}

function minutesOf(value: string): [number, number] {
  const [rawHour, rawMinute] = (value || "").split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  return [Number.isFinite(hour) ? hour : 0, Number.isFinite(minute) ? minute : 0];
}

/** The day a meeting falls on: "Wednesday". */
export function meetingDay(meeting: WeeklyMeeting): string {
  return WEEKDAY_NAMES[meeting.weekday] ?? meeting.weekday_label ?? "";
}

/** The meeting's hours, as a window: "8:00 PM – 9:00 PM". */
export function meetingHours(meeting: WeeklyMeeting): string {
  return [clockFace(meeting.start_time), clockFace(meeting.end_time)].filter(Boolean).join(" – ");
}

/** How the week says one meeting: "Wednesday · 8:00 PM – 9:00 PM". */
export function meetingWhen(meeting: WeeklyMeeting): string {
  const day = meetingDay(meeting);
  const hours = meetingHours(meeting);
  return hours ? `${day} · ${hours}` : day;
}

/**
 * The meeting happening now, or the next one on the church's week.
 *
 * A meeting's own hours are its window — no second notion of when a service
 * "really" runs. A meeting whose end is not after its start runs past
 * midnight, which is why the end is allowed to land on the following day.
 */
export function nextMeeting(meetings: WeeklyMeeting[] | null, now: Date): Gathering | null {
  const week = (meetings || []).filter((meeting) => meeting.is_active !== false);
  if (week.length === 0) return null;

  const candidates: Gathering[] = [];
  for (let offset = -1; offset <= 1; offset += 1) {
    week.forEach((meeting) => {
      const [startHour, startMinute] = minutesOf(meeting.start_time);
      const [endHour, endMinute] = minutesOf(meeting.end_time);
      // JS counts from Sunday; the record counts from Monday.
      const daysAhead = ((meeting.weekday + 1) % 7) - now.getDay() + offset * 7;
      const date = new Date(now);
      date.setDate(now.getDate() + daysAhead);
      date.setHours(startHour, startMinute, 0, 0);
      const end = new Date(date);
      end.setHours(endHour, endMinute, 0, 0);
      if (end <= date) end.setDate(end.getDate() + 1);
      candidates.push({
        id: meeting.id,
        name: meeting.title,
        time: meetingWhen(meeting),
        place: meeting.place,
        online: meeting.online,
        link: meeting.meeting_link,
        active: now >= date && now < end,
        date,
      });
    });
  }

  const active = candidates.find((candidate) => candidate.active);
  if (active) return active;
  const upcoming = candidates
    .filter((candidate) => candidate.date > now)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return upcoming[0] || candidates[0] || null;
}

/**
 * The card's label for a gathering. "Begins soon" is honest only within a few
 * hours of the start; farther out, the name alone is shown. A gathering in
 * progress says it is ongoing.
 */
export function gatheringLabel(gathering: Gathering, now: Date) {
  const hoursAway = (gathering.date.getTime() - now.getTime()) / 3_600_000;
  if (gathering.active) return `${gathering.name} is ongoing`;
  if (hoursAway > 0 && hoursAway <= 6) return `${gathering.name} begins soon`;
  return gathering.name;
}

/** The same calendar day, in the reader's own clock. */
function sameCalendarDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

/**
 * How long until the gathering begins, in the card's words.
 *
 * A gathering still to come today is counted in hours — the day is already
 * understood, so "in 3 hours" beside the join button needs no weekday or
 * start time repeated at it. Anything farther out is counted in days, hours
 * and minutes, so a member reading on Sunday knows exactly how much of the
 * week is left. A gathering already under way has nothing to count down to,
 * and returns null; so does one with no clock behind it.
 */
export function gatheringCountdown(gathering: Gathering, now: Date): string | null {
  if (gathering.active) return null;
  const remaining = gathering.date.getTime() - now.getTime();
  if (remaining <= 0) return null;

  const plural = (value: number, unit: string) => `${value} ${unit}${value === 1 ? "" : "s"}`;
  const totalMinutes = Math.floor(remaining / 60_000);

  if (sameCalendarDay(gathering.date, now)) {
    // Hours are the unit of a day already in progress; under the last hour the
    // minutes are what is left, and "in 0 hours" would say nothing.
    const hours = Math.floor(remaining / 3_600_000);
    const value = hours >= 1 ? plural(hours, "hour") : plural(Math.max(1, totalMinutes), "minute");
    return `in ${value}`;
  }

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return `in ${plural(days, "day")}, ${plural(hours, "hour")}, ${plural(minutes, "minute")}`;
}

/**
 * What the join button calls the platform it opens.
 *
 * The button names the platform *and* says what tapping it does — "Open on
 * Google Meet", "Open on Zoom" — so it reads as an action rather than as a
 * bare product name. Every platform gets the same verb; a lone "Zoom" beside
 * "Open on Google Meet" would read as a different kind of control. "Join
 * online" stays the fallback when the link points somewhere unrecognised.
 */
export function platformLabel(href: string | null | undefined) {
  if (!href) return "Join online";
  const url = href.toLowerCase();
  if (url.includes("meet.google.com")) return "Open on Google Meet";
  if (url.includes("zoom.us") || url.includes("zoom.com")) return "Open on Zoom";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "Open on YouTube";
  if (url.includes("teams.microsoft.com")) return "Open on Teams";
  return "Join online";
}
