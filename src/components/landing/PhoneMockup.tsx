import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText } from '../AppText';
import { LiorisLogo } from '../LiorisLogo';
import { useTheme } from '@/theme/ThemeProvider';
import { haptics } from '@/utils/haptics';

/**
 * The landing page's "device simulator": an iPhone frame that runs a small, self-contained copy of the
 * real app's look - header, floating glass tab bar, and one screen per tab. Every tab is tappable and
 * the content responds (like, vote, RSVP, bookmark, apply...). It is a demo: all names, courses and
 * companies are made up and nothing is fetched or saved.
 */
export type MockRole = 'student' | 'alumni';

type IconName = keyof typeof Ionicons.glyphMap;
interface MockTab {
  key: string;
  label: string;
  icon: IconName;
  iconActive: IconName;
}

// A deliberately short list: the real app has more tabs, the demo only needs to show the idea.
const TABS: Record<MockRole, MockTab[]> = {
  student: [
    { key: 'home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
    { key: 'forum', label: 'Forum', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
    { key: 'events', label: 'Events', icon: 'calendar-outline', iconActive: 'calendar' },
    { key: 'resources', label: 'Library', icon: 'folder-outline', iconActive: 'folder' },
  ],
  alumni: [
    { key: 'home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
    { key: 'careers', label: 'Careers', icon: 'briefcase-outline', iconActive: 'briefcase' },
    { key: 'forum', label: 'Forum', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
    { key: 'mentorship', label: 'Mentors', icon: 'ribbon-outline', iconActive: 'ribbon' },
  ],
};

const INACTIVE_TAB_WIDTH = 34;

export function PhoneMockup({ role }: { role: MockRole }) {
  const { colors, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [active, setActive] = useState('home');
  const scrollRef = useRef<ScrollView>(null);
  const fade = useRef(new Animated.Value(1)).current;

  const tabs = TABS[role];
  // Small on purpose: a phone that fits in one glance, especially on a phone screen.
  const phoneWidth = windowWidth < 520 ? Math.min(windowWidth - 96, 232) : 252;
  const phoneHeight = Math.round(phoneWidth * 1.78);
  const bezel = 8;
  const screenRadius = 32;

  // Reset when the visitor flips between Student and Alumni.
  useEffect(() => {
    setActive('home');
  }, [role]);

  function go(key: string) {
    if (key === active) return;
    haptics.light();
    fade.setValue(0);
    setActive(key);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    Animated.timing(fade, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
  }

  return (
    <View
      accessibilityLabel="Interactive preview of the Lioris app. Tap the bottom tabs to explore."
      style={{ width: phoneWidth + 6, height: phoneHeight + 6, alignItems: 'center', justifyContent: 'center' }}
    >
      {/* side buttons */}
      <View style={{ position: 'absolute', left: 0, top: phoneHeight * 0.17, width: 3, height: 22, borderRadius: 2, backgroundColor: '#2B3140' }} />
      <View style={{ position: 'absolute', left: 0, top: phoneHeight * 0.26, width: 3, height: 38, borderRadius: 2, backgroundColor: '#2B3140' }} />
      <View style={{ position: 'absolute', left: 0, top: phoneHeight * 0.36, width: 3, height: 38, borderRadius: 2, backgroundColor: '#2B3140' }} />
      <View style={{ position: 'absolute', right: 0, top: phoneHeight * 0.28, width: 3, height: 58, borderRadius: 2, backgroundColor: '#2B3140' }} />

      {/* titanium body */}
      <View
        style={{
          width: phoneWidth,
          height: phoneHeight,
          borderRadius: screenRadius + bezel,
          backgroundColor: '#0B0F19',
          padding: bezel,
          borderWidth: 1.5,
          borderColor: '#3A4152',
          ...(Platform.OS === 'web'
            ? ({
                boxShadow: isDark
                  ? '0 24px 54px -16px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,255,255,0.06)'
                  : '0 24px 54px -16px rgba(15,23,42,0.4), inset 0 0 0 1px rgba(255,255,255,0.08)',
              } as any)
            : { elevation: 10 }),
        }}
      >
        <View style={{ flex: 1, borderRadius: screenRadius, overflow: 'hidden', backgroundColor: colors.background }}>
          <StatusBar />
          <AppHeaderMock />

          <Animated.View
            style={{
              flex: 1,
              opacity: fade,
              transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            }}
          >
            <ScrollView
              ref={scrollRef}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 4, paddingBottom: 74, gap: 8 }}
            >
              {active === 'home' ? <HomeScreen role={role} /> : null}
              {active === 'forum' ? <ForumScreen /> : null}
              {active === 'events' ? <EventsScreen /> : null}
              {active === 'resources' ? <LibraryScreen /> : null}
              {active === 'careers' ? <CareersScreen /> : null}
              {active === 'mentorship' ? <MentorshipScreen /> : null}
            </ScrollView>
          </Animated.View>

          <FloatingTabBar tabs={tabs} active={active} onSelect={go} />

          <View style={{ position: 'absolute', bottom: 4, alignSelf: 'center', width: 80, height: 4, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)' }} />
        </View>

        {/* dynamic island */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: bezel + 7, alignSelf: 'center', width: 78, height: 22, borderRadius: 11, backgroundColor: '#000000' }}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Chrome
 * ---------------------------------------------------------------------------------------------- */

function StatusBar() {
  const { colors } = useTheme();
  return (
    <View style={{ height: 36, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 3 }}>
      <AppText weight="bold" style={{ fontSize: 12, color: colors.textPrimary }}>
        9:41
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="cellular" size={12} color={colors.textPrimary} />
        <Ionicons name="wifi" size={12} color={colors.textPrimary} />
        <Ionicons name="battery-full" size={16} color={colors.textPrimary} />
      </View>
    </View>
  );
}

function AppHeaderMock() {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <LiorisLogo size={20} variant="symbol" />
        <LiorisLogo size={12} variant="wordmark" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="notifications-outline" size={12} color={colors.textPrimary} />
        </View>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
          <AppText weight="bold" style={{ fontSize: 10, color: colors.brandPrimary }}>
            Y
          </AppText>
        </View>
      </View>
    </View>
  );
}

/** Same idea as the real floating glass tab bar: one pill, the current tab expands to show its name. */
function FloatingTabBar({ tabs, active, onSelect }: { tabs: MockTab[]; active: string; onSelect: (key: string) => void }) {
  const { colors, isDark } = useTheme();
  const progress = useRef<Record<string, Animated.Value>>({}).current;
  tabs.forEach((tab) => {
    if (!progress[tab.key]) progress[tab.key] = new Animated.Value(tab.key === active ? 1 : 0);
  });

  useEffect(() => {
    tabs.forEach((tab) => {
      Animated.timing(progress[tab.key], {
        toValue: tab.key === active ? 1 : 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    });
  }, [active, tabs, progress]);

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 14, alignItems: 'center' }}>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          padding: 3,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.85)',
          backgroundColor: isDark ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.72)',
          ...(Platform.OS === 'web'
            ? ({
                backdropFilter: 'blur(18px) saturate(180%)',
                WebkitBackdropFilter: 'blur(18px) saturate(180%)',
                boxShadow: '0 6px 22px -4px rgba(15,23,42,0.28)',
              } as any)
            : { elevation: 6 }),
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          const activeWidth = INACTIVE_TAB_WIDTH + 10 + tab.label.length * 6;
          const p = progress[tab.key];
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              onPress={() => onSelect(tab.key)}
              hitSlop={4}
            >
              <Animated.View
                style={{
                  height: 34,
                  width: p.interpolate({ inputRange: [0, 1], outputRange: [INACTIVE_TAB_WIDTH, activeWidth] }),
                  borderRadius: 17,
                  backgroundColor: p.interpolate({ inputRange: [0, 1], outputRange: ['rgba(26,61,255,0)', colors.brandPrimary] }),
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <Ionicons name={isActive ? tab.iconActive : tab.icon} size={17} color={isActive ? '#FFFFFF' : isDark ? '#CBD5E1' : '#475569'} />
                <Animated.View style={{ opacity: p, maxWidth: p.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }), overflow: 'hidden' }}>
                  <AppText
                    numberOfLines={1}
                    weight="bold"
                    style={{ color: '#FFFFFF', fontSize: 11, paddingLeft: 5, ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as any) : null) }}
                  >
                    {tab.label}
                  </AppText>
                </Animated.View>
              </Animated.View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Shared bits
 * ---------------------------------------------------------------------------------------------- */

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  const { colors } = useTheme();
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 11, gap: 5 }, style]}>
      {children}
    </View>
  );
}

/** Looks like the app's small action button; deliberately not tappable - only the tab bar is live. */
function Pill({ label, secondary }: { label: string; secondary?: boolean }) {
  const { colors } = useTheme();
  const filled = !secondary;
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: filled ? colors.brandPrimary : 'transparent',
        borderWidth: filled ? 0 : 1.5,
        borderColor: colors.brandPrimary,
      }}
    >
      <AppText weight="bold" style={{ fontSize: 10.5, color: filled ? '#FFFFFF' : colors.brandPrimary }}>
        {label}
      </AppText>
    </View>
  );
}

function Tag({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <AppText weight="bold" style={{ fontSize: 9.5, letterSpacing: 0.5, color: colors.brandPrimary }}>
      {label}
    </AppText>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <AppText weight="bold" style={{ fontSize: 13, lineHeight: 17 }}>
      {children}
    </AppText>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <AppText tone="secondary" style={{ fontSize: 11, lineHeight: 15 }}>
      {children}
    </AppText>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <AppText weight="bold" style={{ fontSize: 15, lineHeight: 20, marginTop: 2 }}>
      {children}
    </AppText>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Screens - short and plain: what the tab is for, a couple of examples, one thing to tap.
 * ---------------------------------------------------------------------------------------------- */

function HomeScreen({ role }: { role: MockRole }) {
  const { colors, isDark } = useTheme();
  const student = role === 'student';

  // Same order, icons and wording as the real Home: identity card, then the services grid.
  const tiles: { title: string; subtitle: string; icon: IconName; tint: string }[] = student
    ? [
        { title: 'Resources', subtitle: 'Past Qs & notes', icon: 'folder-open', tint: colors.textSecondary },
        { title: 'Forum', subtitle: 'Ask questions', icon: 'chatbubbles', tint: '#EC4899' },
        { title: 'Events & RSVPs', subtitle: 'Talks & summits', icon: 'calendar', tint: '#3B82F6' },
      ]
    : [
        { title: 'Career Board', subtitle: 'Jobs & referrals', icon: 'briefcase', tint: '#F59E0B' },
        { title: 'Mentoring', subtitle: 'Guide the next class', icon: 'ribbon', tint: '#10B981' },
        { title: 'Alumni Network', subtitle: 'Find classmates', icon: 'people', tint: '#3B82F6' },
        { title: 'Global Forum', subtitle: 'Join discussions', icon: 'chatbubbles', tint: '#EC4899' },
      ];

  return (
    <>
      {/* Identity card: cover, institution pill, avatar and welcome line - as on the real Home */}
      <View style={{ borderRadius: 20, overflow: 'hidden', height: 118, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
        <LinearGradient
          colors={isDark ? ['#0d1b2a', '#1e293b', '#0f172a'] : ['#dbeafe', '#bfdbfe', '#93c5fd']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <LinearGradient
          colors={['rgba(10,16,30,0.2)', 'rgba(10,16,30,0.55)', isDark ? 'rgba(8,14,28,0.94)' : 'rgba(15,23,42,0.86)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View style={{ flex: 1, padding: 10, justifyContent: 'space-between' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              alignSelf: 'flex-start',
              backgroundColor: 'rgba(15,23,42,0.65)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.16)',
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
            }}
          >
            <Ionicons name="school" size={10} color="#68D391" />
            <AppText weight="bold" style={{ fontSize: 9.5, color: '#FFFFFF' }}>
              {student ? 'Your University' : 'Alumni Chapter'}
            </AppText>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                borderWidth: 2,
                borderColor: '#FFFFFF',
                backgroundColor: colors.pastelPrimaryBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText weight="bold" style={{ fontSize: 14, color: colors.brandPrimary }}>
                {student ? 'S' : 'A'}
              </AppText>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <AppText weight="bold" numberOfLines={1} style={{ fontSize: 12.5, color: '#FFFFFF', flexShrink: 1 }}>
                  Welcome, {student ? 'Student' : 'Alumni'}
                </AppText>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
              </View>
              <AppText numberOfLines={1} style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.85)' }}>
                {student ? 'Your Department • UNI' : 'Class of 2020 • UNI'}
              </AppText>
            </View>
          </View>
        </View>
      </View>

      <AppText weight="bold" style={{ fontSize: 13, marginTop: 2 }}>
        {student ? 'Student Services' : 'Alumni Services'}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
        {tiles.map((tile) => (
          <View key={tile.title} style={{ flexBasis: '47.5%', flexGrow: 1 }}>
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 9,
                minHeight: 66,
                justifyContent: 'space-between',
                gap: 6,
              }}
            >
              <Ionicons name={tile.icon} size={17} color={tile.tint} />
              <View>
                <AppText weight="bold" numberOfLines={1} style={{ fontSize: 10.5, lineHeight: 14 }}>
                  {tile.title}
                </AppText>
                <AppText tone="secondary" numberOfLines={1} style={{ fontSize: 9, marginTop: 1 }}>
                  {tile.subtitle}
                </AppText>
              </View>
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

/** Static copy of the app's Forum: same header, filters and thread card. Nothing here reacts to taps. */
function ForumScreen() {
  const { colors } = useTheme();
  const chip = (label: string, selected: boolean) => (
    <View
      key={label}
      style={{
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: selected ? colors.brandPrimary : colors.surface,
        borderWidth: 1,
        borderColor: selected ? colors.brandPrimary : colors.border,
      }}
    >
      <AppText weight="bold" style={{ fontSize: 9.5, color: selected ? '#FFFFFF' : colors.textSecondary }}>
        {label}
      </AppText>
    </View>
  );

  const threads = [
    {
      id: 't1',
      channel: 'academic',
      time: '12m',
      pinned: true,
      title: 'Best way to prepare for the practical exam?',
      body: 'Our lab session is on Friday and the past questions look very different this year. How are you revising?',
      helpful: 24,
      comments: 9,
    },
    {
      id: 't2',
      channel: 'campuslife',
      time: '1h',
      pinned: false,
      title: 'Where is a good quiet place to study?',
      body: 'The main library gets packed during exams. Looking for somewhere with sockets and Wi-Fi.',
      helpful: 41,
      comments: 17,
    },
  ];

  return (
    <>
      {/* Title + campus/global switch */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText weight="bold" style={{ fontSize: 15 }}>
          Forum
        </AppText>
        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 999, padding: 2, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.brandPrimary }}>
            <AppText weight="bold" style={{ fontSize: 9, color: '#FFFFFF' }}>
              My Campus
            </AppText>
          </View>
          <View style={{ paddingHorizontal: 8, paddingVertical: 3 }}>
            <AppText weight="bold" style={{ fontSize: 9, color: colors.textSecondary }}>
              Global
            </AppText>
          </View>
        </View>
      </View>

      {/* Search + sort */}
      <View style={{ flexDirection: 'row', gap: 5 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 9, height: 28 }}>
          <Ionicons name="search" size={12} color={colors.textSecondary} />
          <AppText tone="secondary" numberOfLines={1} style={{ fontSize: 10, flex: 1 }}>
            Search discussions...
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 8, height: 28 }}>
          <Ionicons name="swap-vertical" size={11} color={colors.textSecondary} />
          <AppText weight="semiBold" tone="secondary" style={{ fontSize: 9.5 }}>
            Latest
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 5 }}>
        {chip('All Threads', true)}
        {chip('Academic', false)}
        {chip('Polls', false)}
      </View>

      {threads.map((thread) => (
        <View key={thread.id} style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 10 }}>
          {/* author row */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', gap: 7, flex: 1, minWidth: 0 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
                <AppText weight="bold" style={{ fontSize: 10, color: colors.brandPrimary }}>
                  CM
                </AppText>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <AppText weight="bold" numberOfLines={1} style={{ fontSize: 10.5, flexShrink: 1 }}>
                    Campus Member
                  </AppText>
                  <Ionicons name="checkmark-circle" size={11} color={colors.brandPrimary} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
                  <AppText weight="bold" style={{ fontSize: 9, color: colors.brandPrimary }}>
                    c/{thread.channel}
                  </AppText>
                  {thread.pinned ? <Ionicons name="pin" size={9} color={colors.textSecondary} /> : null}
                  <AppText tone="secondary" style={{ fontSize: 9 }}>
                    • {thread.time}
                  </AppText>
                </View>
              </View>
            </View>
            <Ionicons name="ellipsis-horizontal" size={15} color={colors.textSecondary} />
          </View>

          <AppText weight="bold" style={{ fontSize: 12, lineHeight: 16, marginTop: 7 }}>
            {thread.title}
          </AppText>
          <AppText numberOfLines={3} style={{ fontSize: 10.5, lineHeight: 15, marginTop: 3 }}>
            {thread.body}
          </AppText>

          {/* Helpful / comments / share - drawn like the app, not tappable */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8,
              paddingTop: 7,
              borderTopWidth: 1,
              borderTopColor: colors.divider,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="bulb-outline" size={14} color={colors.textSecondary} />
              <AppText weight="medium" style={{ fontSize: 10, color: colors.textSecondary }}>
                {thread.helpful} helpful
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="chatbubble-outline" size={13} color={colors.textSecondary} />
              <AppText weight="medium" style={{ fontSize: 10, color: colors.textSecondary }}>
                {thread.comments}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="share-social-outline" size={13} color={colors.textSecondary} />
              <AppText weight="medium" style={{ fontSize: 10, color: colors.textSecondary }}>
                Share
              </AppText>
            </View>
          </View>
        </View>
      ))}
    </>
  );
}

const EVENTS = [
  { id: 'e1', month: 'OCT', day: '04', title: 'Technology Symposium', where: 'Main Auditorium • 10:00 AM', going: 182 },
  { id: 'e2', month: 'OCT', day: '09', title: 'Career Fair & CV Clinic', where: 'Student Centre • 9:00 AM', going: 264 },
];

function EventsScreen() {
  const { colors } = useTheme();
  return (
    <>
      <Heading>Upcoming events</Heading>
      {EVENTS.map((event) => (
        <Card key={event.id}>
          <View style={{ flexDirection: 'row', gap: 9 }}>
            <View style={{ width: 38, borderRadius: 10, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', paddingVertical: 5 }}>
              <AppText weight="bold" style={{ fontSize: 9, color: colors.brandPrimary }}>
                {event.month}
              </AppText>
              <AppText weight="bold" style={{ fontSize: 15, lineHeight: 18, color: colors.brandPrimary }}>
                {event.day}
              </AppText>
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Title>{event.title}</Title>
              <Meta>{event.where}</Meta>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
            <Meta>{event.going} going</Meta>
            <Pill label="RSVP" />
          </View>
        </Card>
      ))}
    </>
  );
}

const LIBRARY = [
  { id: 'r1', code: 'MTH 201', title: 'Linear Algebra lecture notes', meta: 'Notes • 4.2 MB' },
  { id: 'r2', code: 'CSC 305', title: 'Operating Systems past questions', meta: 'Past questions • 1.8 MB' },
];

function LibraryScreen() {
  return (
    <>
      <Heading>Study library</Heading>
      {LIBRARY.map((item) => (
        <Card key={item.id}>
          <Tag label={item.code} />
          <Title>{item.title}</Title>
          <Meta>{item.meta}</Meta>
          <View style={{ alignItems: 'flex-end', marginTop: 2 }}>
            <Pill label="Download" />
          </View>
        </Card>
      ))}
    </>
  );
}

const JOBS = [
  { id: 'j1', type: 'GRADUATE TRAINEE', title: 'Junior Software Engineer', company: 'Sample Tech Ltd • Lagos' },
  { id: 'j2', type: 'INTERNSHIP', title: 'Data Analyst Intern', company: 'Example Analytics • Abuja' },
];

function CareersScreen() {
  return (
    <>
      <Heading>Open roles</Heading>
      {JOBS.map((job) => (
        <Card key={job.id}>
          <Tag label={job.type} />
          <Title>{job.title}</Title>
          <Meta>{job.company}</Meta>
          <View style={{ alignItems: 'flex-end', marginTop: 2 }}>
            <Pill label="Refer a student" />
          </View>
        </Card>
      ))}
    </>
  );
}

const REQUESTS = [
  { id: 'm1', topic: 'Breaking into cloud engineering', level: '300 Level student' },
  { id: 'm2', topic: 'Preparing for graduate school', level: '400 Level student' },
];

function MentorshipScreen() {
  return (
    <>
      <Heading>Mentorship requests</Heading>
      {REQUESTS.map((request) => (
        <Card key={request.id}>
          <Tag label={request.level.toUpperCase()} />
          <Title>{request.topic}</Title>
          <View style={{ alignItems: 'flex-end', marginTop: 2 }}>
            <Pill label="Accept" />
          </View>
        </Card>
      ))}
    </>
  );
}
