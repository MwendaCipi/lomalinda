export interface Ministry {
  slug: string;
  title: string;
  givingPurpose: string;
  description: string;
  department?: string;
  sections?: { id?: string; title: string; text: string }[];
  summary?: string;
  schedule?: string;
  leaderName?: string;
}

export const MINISTRIES: Ministry[] = [
  {
    slug: "children-ministry",
    title: "Children Ministry",
    givingPurpose: "Children Ministry",
    description: "Nurturing children into a loving, lifelong relationship with Jesus through Bible learning, worship, and fun fellowship.",
    department: "Children Ministry",
    sections: [
      { title: "Sabbath School for Kids", text: "Interactive Bible classes with songs, crafts, and object lessons tailored for every age group." },
      { title: "VBS & Special Programs", text: "Vacation Bible School and child-led worship services that build early Christian character and leadership." },
      { title: "Parenting & Safeguarding", text: "Equipping families and ensuring a safe, joyful environment where children thrive in God's grace." },
    ],
  },
  {
    slug: "possibility-ministries",
    title: "Adventist Possibility Ministries",
    givingPurpose: "Possibility",
    description: "Building belonging and meaningful participation for people with disabilities, special needs, orphans, widows, and caregivers.",
    department: "Adventist Possibility Ministries",
    sections: [
      { title: "Inclusion & Accessibility", text: "Ensuring all worship services, materials, and church spaces are fully accessible and welcoming to everyone." },
      { title: "Empowerment & Advocacy", text: "Recognizing each individual's God-given dignity, abilities, and gifts in active church ministry." },
      { title: "Caregiver & Family Support", text: "Providing community, encouragement, and practical assistance to caregivers and families." },
    ],
  },
  {
    slug: "adventist-youth",
    title: "Adventist Youth Ministry",
    givingPurpose: "Adventist Youth Ministry",
    description: "Helping young people grow in faith, friendship, leadership, and missionary service.",
    // The word the office's programme lines carry, whichever way they spell
    // the ministry — "Adventist Youth (AYM)" and "Adventist Youth Ministry"
    // both name this desk's calendar.
    department: "Adventist Youth",
    sections: [
      { title: "Youth Discipleship", text: "Deepening young people's love for God's Word through vibrant study, prayer, and mentorship." },
      { title: "Community Outreach", text: "Leading compassionate service, evangelism, and community projects in Meru and beyond." },
      { title: "Fellowship & Leadership", text: "Empowering youth with leadership opportunities, wholesome activities, and lifelong Christian friendships." },
    ],
  },
  {
    slug: "adventist-men",
    title: "Adventist Men Ministry",
    givingPurpose: "Adventist Men Ministry",
    description: "Creating space for men to grow spiritually, build strong friendships, and serve the church and community.",
    department: "Adventist Men Ministry",
    sections: [
      { title: "Spiritual Growth & Brotherhood", text: "Gathering for prayer breakfasts, Bible study, and honest conversations on faith and purpose." },
      { title: "Family & Fatherhood", text: "Equipping men to lead their families with love, integrity, and godly example." },
      { title: "Practical Service", text: "Supporting church maintenance, community building, and mentoring younger men." },
    ],
  },
  {
    slug: "adventist-women",
    title: "Adventist Women Ministry",
    givingPurpose: "Adventist Women Ministry",
    description: "Encouraging women through fellowship, discipleship, prayer, care, and outreach.",
    department: "Adventist Women Ministry",
    sections: [
      { title: "Prayer & Fellowship", text: "Deepening spiritual life and sisterhood through prayer networks and inspirational retreats." },
      { title: "Nurture & Mentorship", text: "Supporting young women, mothers, and families with practical Christian guidance and love." },
      { title: "Community Compassion", text: "Visiting the sick, supporting vulnerable neighbors, and leading impactful outreach initiatives." },
    ],
  },
  {
    slug: "personal-ministries",
    title: "Personal Ministries",
    givingPurpose: "Personal",
    description: "Equipping every church member for active personal witnessing, Bible studies, and community evangelism.",
    department: "Personal Ministries",
    sections: [
      { title: "Member Witnessing Training", text: "Providing practical tools and resources to help members share their faith confidently in daily life." },
      { title: "Bible Study & Discipleship", text: "Organizing neighborhood small groups and personal Bible studies for seekers." },
      { title: "Community Care & Missions", text: "Coordinating active local outreach, welfare support, and sharing literature." },
    ],
  },
  {
    slug: "adventist-muslim-relations",
    title: "Adventist Muslim Relations (AMR)",
    givingPurpose: "Personal",
    description: "Building respectful bridges of understanding, dialogue, friendship, and shared truth with Muslim neighbors.",
    department: "Adventist Muslim Relations",
    sections: [
      { title: "Bridge Building & Dialogue", text: "Fostering mutual respect, peaceful understanding, and friendly conversations on shared values." },
      { title: "Community Friendship", text: "Engaging in joint community service, hospitality, and neighborly care." },
      { title: "Sharing Hope", text: "Presenting spiritual truth with gentleness, clarity, and respect." },
    ],
  },
  {
    slug: "chaplaincy",
    title: "Chaplaincy Ministry",
    givingPurpose: "Chaplaincy",
    description: "Offering a ministry of presence, comfort, prayer, and spiritual care in places of need.",
    department: "Chaplaincy Ministry",
    sections: [
      { title: "A ministry of presence", text: "Meeting people where they are, offering compassionate listening, encouragement, and prayer without pressure." },
      { title: "Care in difficult moments", text: "Supporting people in hospitals, schools, workplaces, and during seasons of bereavement or transition." },
      { title: "Hope and dignity", text: "Every person deserves care, respect, and the freedom to be heard. Chaplaincy points to hope while honouring each person's story." },
    ],
  },
  {
    slug: "welfare",
    title: "Welfare Ministry",
    givingPurpose: "Msamaria Mwema",
    description: "Reaching out to members and neighbours in need with practical support, compassion, and the love of Christ.",
    department: "Welfare Ministry",
    sections: [
      { title: "Member Assistance", text: "Walking alongside church members through illness, bereavement, financial hardship, and other life challenges." },
      { title: "Community Outreach", text: "Extending practical care — food, clothing, and essential support — to vulnerable people in the surrounding community." },
      { title: "Hospital & Home Visits", text: "Bringing encouragement, prayer, and a listening ear to the sick, elderly, and those unable to attend church." },
    ],
  },
  {
    slug: "dorcas",
    title: "Dorcas Ministry",
    givingPurpose: "Msamaria Mwema",
    description: "A ministry of compassionate service, providing food, clothing, and care to the poor and vulnerable in the spirit of Acts 9:36.",
    department: "Dorcas Ministry",
    sections: [
      { title: "Clothing & Food Relief", text: "Collecting, sorting, and distributing clothing and food parcels to families and individuals in need." },
      { title: "Compassionate Service", text: "Organising regular outreach visits, practical help, and donations to the less privileged in our community." },
      { title: "Acts of Kindness", text: "Embodying the example of Dorcas — faithful, generous service that makes Christ's love tangible and real." },
    ],
  },
  {
    slug: "development",
    title: "Church Development & Building",
    givingPurpose: "Development",
    description: "Planning, acquiring, and constructing church land, sanctuary infrastructure, and development projects.",
    department: "Development",
    sections: [
      { title: "Church Plot & Land Acquisition", text: "Securing, managing, and developing church plots, title deeds, and expanding the church's physical borders." },
      { title: "Sanctuary & Building Construction", text: "Erecting and maintaining modern worship facilities, classrooms, and community service centers." },
      { title: "Development Stewardship & Giving", text: "Mobilizing financial, material, and professional resources for lasting church infrastructure." },
    ],
  },
];

export type CalendarEvent = { date: string; name: string; department?: string };

export function getMinistryBySlug(slug: string): Ministry | undefined {
  return MINISTRIES.find((m) => m.slug === slug);
}

export function getMinistryGivingPurpose(departmentOrName?: string): string {
  if (!departmentOrName) return "Tithe";
  const lower = departmentOrName.toLowerCase().trim();

  // Match against known keywords. The words returned are the treasury
  // accounts' own labels, so a deep link preselects a real account.
  if (lower.includes("youth") || lower.includes("ay") || lower.includes("aym") || lower.includes("ambassador")) return "Adventist Youth Ministry";
  if (lower.includes("possibility") || lower.includes("apm") || lower.includes("special need") || lower.includes("disabilit")) return "Possibility";
  if (lower.includes("child") || lower.includes("kid") || lower.includes("cradle") || lower.includes("kindergarten") || lower.includes("primary")) return "Children Ministry";
  if (lower.includes("men") || lower.includes("amm") || lower.includes("amo")) return "Adventist Men Ministry";
  if (lower.includes("women") || lower.includes("awm") || lower.includes("dorcas")) return "Adventist Women Ministry";
  if (lower.includes("personal") || lower.includes("witness") || lower.includes("evangelism") || lower.includes("muslim") || lower.includes("amr")) return "Personal";
  if (lower.includes("music") || lower.includes("choir") || lower.includes("ensemble") || lower.includes("sing")) return "Choir";
  if (lower.includes("chaplain")) return "Chaplaincy";
  if (lower.includes("prayer")) return "Prayer";
  if (lower.includes("worship")) return "Worship";
  if (lower.includes("welfare") || lower.includes("deacon") || lower.includes("samaria")) return "Msamaria Mwema";
  if (lower.includes("family") || lower.includes("couple") || lower.includes("marriage")) return "Family Life";
  if (lower.includes("health") || lower.includes("temperance") || lower.includes("medical")) return "Health";
  if (lower.includes("pathfinder") || lower.includes("adventurer")) return "Pathfinders";
  if (lower.includes("communicat") || lower.includes("media") || lower.includes("sound") || lower.includes("tech")) return "Media";
  if (lower.includes("development") || lower.includes("building") || lower.includes("project")) return "Development";
  if (lower.includes("budget") || lower.includes("lcb") || lower.includes("whole church")) return "Budget";
  if (lower.includes("tithe")) return "Tithe";

  return departmentOrName;
}
