/**
 * The church's weekly programme windows, shared by the website's gathering
 * card and the dashboard's announcements slider.
 *
 * The Sabbath itself runs Friday 6:00 PM to Saturday 6:00 PM — a fixed
 * sunset-to-sunset window, not the programme hours. The programme hours from
 * settings remain the description shown to members.
 */

export type ChurchTimes = {
  midweek_vespers_time: string;
  friday_vespers_time: string;
  sabbath_time: string;
};

export type Gathering = {
  name: string;
  time: string;
  online: boolean;
  active: boolean;
  date: Date;
};

function clockRange(value: string | undefined, fallbackStart: [number, number], fallbackEnd: [number, number]) {
  const matches = (value || "").match(/(\d{1,2}):(\d{2})\s*([AP]M)/gi) || [];
  const parse = (text: string | undefined, fallback: [number, number]) => {
    if (!text) return fallback;
    const match = text.match(/(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!match) return fallback;
    let hour = Number(match[1]) % 12;
    if (match[3].toUpperCase() === "PM") hour += 12;
    return [hour, Number(match[2])] as [number, number];
  };
  return [parse(matches[0], fallbackStart), parse(matches[1], fallbackEnd)] as const;
}

/** The next gathering on the church's weekly rhythm — or the one happening now. */
export function nextGathering(settings: ChurchTimes | null, now: Date): Gathering {
  const definitions = [
    { day: 3, name: "Midweek Vespers", time: settings?.midweek_vespers_time || "Wednesday · 8:00 PM – 9:00 PM", range: clockRange(settings?.midweek_vespers_time, [20, 0], [21, 0]), online: true },
    { day: 5, name: "Friday Vespers", time: settings?.friday_vespers_time || "Friday · 5:30 PM – 6:30 PM", range: clockRange(settings?.friday_vespers_time, [17, 30], [18, 30]), online: false },
    { day: 5, name: "Sabbath program", time: settings?.sabbath_time || "Saturday · 8:00 AM – 4:00 PM", range: [[18, 0], [18, 0]] as [[number, number], [number, number]], online: false },
  ];
  const candidates: Gathering[] = [];
  for (let week = -1; week <= 1; week += 1) {
    definitions.forEach((definition) => {
      const date = new Date(now);
      const difference = definition.day - now.getDay() + week * 7;
      date.setDate(now.getDate() + difference);
      date.setHours(definition.range[0][0], definition.range[0][1], 0, 0);
      const end = new Date(date);
      end.setHours(definition.range[1][0], definition.range[1][1], 0, 0);
      if (end <= date) end.setDate(end.getDate() + 1);
      candidates.push({
        name: definition.name,
        time: definition.time,
        online: definition.online,
        active: now >= date && now < end,
        date,
      });
    });
  }
  const active = candidates.find((candidate) => candidate.active);
  if (active) return active;
  return candidates.filter((candidate) => candidate.date > now).sort((a, b) => a.date.getTime() - b.date.getTime())[0] || candidates[0];
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
