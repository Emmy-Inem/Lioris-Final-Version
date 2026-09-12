import { Ionicons } from '@expo/vector-icons';

// Single source of truth for Forum communities/categories. Previously
// CommunityFeedScreen (CAMPUS_SUB_FORUMS), PublishThreadModal
// (SUB_FORUM_COMMUNITIES) and ForumsModerationTab (WORKSPACES) each kept
// their own hand-typed copy of this list, so the composer's category
// picker, the moderation filter pills, and the feed's own directory could
// silently drift apart. There's exactly one list now.
export interface ForumCommunity {
  id: string;
  slug: string;
  label: string;
  category: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  flagKey?: string;
  description: string;
  moderatorBadge: string;
  moderatorTitle: string;
  rules: string[];
  bannerColor: string;
  accentColor: string;
}

export const FORUM_COMMUNITIES: ForumCommunity[] = [
  {
    id: 'all',
    slug: 'c/all',
    label: 'All Threads',
    category: null,
    icon: 'planet-outline',
    description: 'Unified feed aggregating student discussions, academic questions, and polls across every space.',
    moderatorBadge: 'Moderation Desk',
    moderatorTitle: 'Verified Faculty Staff & Student Union Council',
    rules: [
      'Maintain civil and constructive discourse at all times.',
      'Tag your threads with the accurate community space.',
      'No hate speech, unverified rumors, or academic dishonesty.',
    ],
    bannerColor: '#3B82F6',
    accentColor: '#2563EB',
  },
  {
    id: 'tech',
    slug: 'c/tech',
    label: 'Tech & Code Hub',
    category: 'Tech Hub',
    icon: 'code-slash',
    description: 'Software engineering, AI projects, hackathons, debugging queries, and developer tooling.',
    moderatorBadge: 'Developer Guild Lead',
    moderatorTitle: 'Department Tech Reps & GDSC Leads',
    rules: [
      'Provide code context, error logs, or reproducible snippets.',
      'Respect peer developers of all experience levels.',
      'No unauthorized course test/exam solution leaks.',
    ],
    bannerColor: '#6366F1',
    accentColor: '#4F46E5',
  },
  {
    id: 'academic',
    slug: 'c/academic',
    label: 'Academic & Courses',
    category: 'Academic',
    icon: 'school',
    description: 'Course registration, lecture notes, syllabus revision, past questions, and departmental discussions.',
    moderatorBadge: 'Academic Board',
    moderatorTitle: 'Department Representatives & Course TAs',
    rules: [
      'Include course codes in thread titles (e.g. [CSC 301]).',
      'Verify exam dates and senate timetables before announcing.',
      'Strict academic integrity rules apply.',
    ],
    bannerColor: '#059669',
    accentColor: '#047857',
  },
  {
    id: 'polls',
    slug: 'c/polls',
    label: 'Polls & Votes',
    category: 'Polls',
    icon: 'stats-chart',
    flagKey: 'discussion_workspaces',
    description: 'Student union surveys, canteen ratings, and real-time student opinion referendums.',
    moderatorBadge: 'Electoral Commission',
    moderatorTitle: 'Student Union Government (SUG) Secretariat',
    rules: [
      'Keep poll questions clear, balanced, and constructive.',
      'One poll per topic to avoid voter fatigue and split results.',
      'Zero manipulation, multi-voting, or vote brigading.',
    ],
    bannerColor: '#8B5CF6',
    accentColor: '#7C3AED',
  },
  {
    id: 'housing',
    slug: 'c/housing',
    label: 'Hostel & Housing',
    category: 'Housing',
    icon: 'home',
    description: 'Hall of residence allocations, off-campus apartments, roommate matching, and maintenance updates.',
    moderatorBadge: 'Hall Committee',
    moderatorTitle: 'Hall Wardens & Student Hall Executives',
    rules: [
      'Never pay agent inspection fees or deposits upfront.',
      'Provide exact hostel/apartment location and verified rental costs.',
      'Report misleading accommodation ads immediately.',
    ],
    bannerColor: '#EA580C',
    accentColor: '#C2410C',
  },
  {
    id: 'social',
    slug: 'c/social',
    label: 'Life & Sports',
    category: 'Social',
    icon: 'football',
    description: 'Hostel football leagues, dinner awards, cultural days, music festivals, and student clubs.',
    moderatorBadge: 'Directorate of Socials',
    moderatorTitle: 'Student Union Social & Sports Directors',
    rules: [
      'Celebrate rivalries with respect and sportsmanship.',
      'State event venue, ticket fees (if any), and timing clearly.',
      'No personal harassment or bullying of fellow students.',
    ],
    bannerColor: '#EC4899',
    accentColor: '#DB2777',
  },
  {
    id: 'lost',
    slug: 'c/lost-found',
    label: 'Lost & Found',
    category: 'Lost & Found',
    icon: 'search',
    description: 'Find lost student ID cards, flash drives, wallets, glasses, backpacks, and lecture notes.',
    moderatorBadge: 'Security Desk',
    moderatorTitle: 'Campus Marshal Helpdesk & Student Affairs',
    rules: [
      'Turn in valuable items (laptops, wallets) to Hall Porters or DSA.',
      'Do not display full bank card numbers or BVN/NIN in photos.',
      'Claimants must show student identification upon pickup.',
    ],
    bannerColor: '#0284C7',
    accentColor: '#0369A1',
  },
];

export function getForumCommunity(category: string | null): ForumCommunity {
  return FORUM_COMMUNITIES.find((c) => c.category === category) ?? FORUM_COMMUNITIES[0];
}
