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
              {student ? 'Your Campus / Institution' : 'Alumni Chapter'}
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

/* Building blocks shared by the Events, Library and Careers screens: the same title row, search pill and
 * filter chips the real pages use. Everything is drawn only - none of it reacts to taps. */

function ScreenTitle({ title, subtitle, action, actionIcon }: { title: string; subtitle: string; action?: string; actionIcon?: IconName }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <AppText weight="bold" numberOfLines={1} style={{ fontSize: 14, flexShrink: 1 }}>
          {title}
        </AppText>
        {action ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.brandPrimary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
            {actionIcon ? <Ionicons name={actionIcon} size={10} color="#FFFFFF" /> : null}
            <AppText weight="bold" style={{ fontSize: 9, color: '#FFFFFF' }}>
              {action}
            </AppText>
          </View>
        ) : null}
      </View>
      <AppText tone="secondary" style={{ fontSize: 9.5, lineHeight: 13 }}>
        {subtitle}
      </AppText>
    </View>
  );
}

function SearchPill({ placeholder, withFilter }: { placeholder: string; withFilter?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 5 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 9, height: 28 }}>
        <Ionicons name="search" size={12} color={colors.textSecondary} />
        <AppText tone="secondary" numberOfLines={1} style={{ fontSize: 9.5, flex: 1 }}>
          {placeholder}
        </AppText>
      </View>
      {withFilter ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 8, height: 28 }}>
          <Ionicons name="options-outline" size={11} color={colors.textPrimary} />
          <AppText weight="bold" style={{ fontSize: 9.5 }}>
            Filter
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/** A horizontally scrolling chip row, clipped like the real one (the last chip runs off the edge). */
function ChipRow({ chips }: { chips: { label: string; icon: IconName }[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 5, overflow: 'hidden' }} pointerEvents="none">
      {chips.map((chip, index) => {
        const selected = index === 0;
        return (
          <View
            key={chip.label}
            style={{
              flexShrink: 0,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: selected ? colors.brandPrimary : colors.surface,
              borderWidth: 1,
              borderColor: selected ? colors.brandPrimary : colors.border,
            }}
          >
            <Ionicons name={chip.icon} size={10} color={selected ? '#FFFFFF' : colors.textSecondary} />
            <AppText weight={selected ? 'bold' : 'medium'} style={{ fontSize: 9, color: selected ? '#FFFFFF' : colors.textSecondary }}>
              {chip.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

/** The app's button, drawn small. Primary is filled, secondary is outlined, ghost is text only. */
function Btn({ label, kind = 'primary', grow }: { label: string; kind?: 'primary' | 'secondary' | 'ghost'; grow?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexGrow: grow ? 1 : 0,
        flexBasis: grow ? 0 : undefined,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: kind === 'primary' ? colors.brandPrimary : 'transparent',
        borderWidth: kind === 'secondary' ? 1.5 : 0,
        borderColor: colors.brandPrimary,
      }}
    >
      <AppText weight="bold" numberOfLines={1} style={{ fontSize: 9.5, color: kind === 'primary' ? '#FFFFFF' : colors.brandPrimary }}>
        {label}
      </AppText>
    </View>
  );
}

/** Plain coloured uppercase label, like the app's Badge. */
function BadgeText({ label, color }: { label: string; color: string }) {
  return (
    <AppText weight="bold" style={{ fontSize: 8.5, letterSpacing: 0.3, color, textTransform: 'uppercase' }}>
      {label}
    </AppText>
  );
}

const EVENT_LIST = [
  {
    id: 'e1',
    month: 'OCT',
    day: '04',
    category: 'Tech',
    title: 'Campus Tech Hackathon',
    time: '10:00 AM',
    where: 'Main Auditorium',
    body: 'A day of building, mentoring and demos. Form a team and ship something real.',
    going: 182,
    max: 250,
    colors: ['#1d4ed8', '#0ea5e9'] as [string, string],
  },
  {
    id: 'e2',
    month: 'OCT',
    day: '09',
    category: 'Academic',
    title: 'Academic Symposium',
    time: '9:00 AM',
    where: 'Faculty Hall',
    body: 'Talks and panels from lecturers and final-year researchers.',
    going: 96,
    max: 0,
    colors: ['#4338ca', '#8b5cf6'] as [string, string],
  },
];

function EventsScreen() {
  const { colors } = useTheme();
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="school" size={11} color={colors.textSecondary} />
        <AppText weight="bold" tone="secondary" numberOfLines={1} style={{ fontSize: 9 }}>
          Your Campus • Institution Hub
        </AppText>
      </View>
      <ScreenTitle title="Campus Events" subtitle="Workshops, career fairs, academic symposiums & student campus gatherings" action="Host Event" actionIcon="add" />
      <SearchPill placeholder="Search campus events, hackathons..." />
      <ChipRow
        chips={[
          { label: 'All Events', icon: 'calendar-outline' },
          { label: 'On Campus', icon: 'business-outline' },
          { label: 'Off Campus', icon: 'globe-outline' },
          { label: 'Virtual Event', icon: 'videocam-outline' },
        ]}
      />

      {EVENT_LIST.map((event) => (
        <View key={event.id} style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          {/* cover */}
          <View style={{ height: 64 }}>
            <LinearGradient colors={event.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <LinearGradient colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.45)']} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
            <View style={{ position: 'absolute', top: 6, left: 7, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="school" size={9} color="#FFFFFF" />
              <AppText weight="bold" style={{ fontSize: 8.5, color: '#FFFFFF' }}>
                Campus
              </AppText>
            </View>
            <AppText weight="semiBold" style={{ position: 'absolute', top: 6, right: 7, fontSize: 9, color: '#FFFFFF' }}>
              {event.category}
            </AppText>
          </View>

          <View style={{ padding: 9 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ width: 34, height: 38, borderRadius: 9, backgroundColor: colors.divider, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                <AppText weight="bold" tone="secondary" style={{ fontSize: 8.5, letterSpacing: 0.4 }}>
                  {event.month}
                </AppText>
                <AppText weight="bold" style={{ fontSize: 14, lineHeight: 17 }}>
                  {event.day}
                </AppText>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                  <AppText weight="bold" style={{ fontSize: 12, lineHeight: 16, flex: 1 }}>
                    {event.title}
                  </AppText>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
                    <Ionicons name="notifications-outline" size={13} color={colors.textSecondary} />
                    <Ionicons name="ellipsis-horizontal" size={13} color={colors.textSecondary} />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 3, marginTop: 2 }}>
                  <Ionicons name="time-outline" size={10} color={colors.textSecondary} style={{ marginTop: 1 }} />
                  <AppText tone="secondary" style={{ fontSize: 9.5, lineHeight: 13, flex: 1 }}>
                    {event.time} | {event.where}
                  </AppText>
                </View>
              </View>
            </View>

            <AppText tone="secondary" style={{ fontSize: 10, lineHeight: 14, marginTop: 6 }}>
              {event.body}
            </AppText>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.divider }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
                <Ionicons name="people" size={12} color={colors.textSecondary} />
                <AppText weight="bold" tone="secondary" numberOfLines={1} style={{ fontSize: 9, flexShrink: 1 }}>
                  {event.going} attending{event.max ? ` (${event.max} max)` : ''}
                </AppText>
              </View>
              <Btn label="RSVP" />
            </View>
          </View>
        </View>
      ))}
    </>
  );
}

const RESOURCE_LIST = [
  {
    id: 'r1',
    course: 'MTH 201',
    category: 'Notes',
    size: '4.2 MB',
    title: 'Linear Algebra Lecture Notes',
    by: 'Mathematics • By Campus Student',
    body: 'Complete notes covering vector spaces, eigenvalues and diagonalisation.',
    downloads: 214,
    upvotes: 38,
  },
  {
    id: 'r2',
    course: 'CSC 305',
    category: 'Past Questions',
    size: '1.8 MB',
    title: 'Operating Systems Past Questions',
    by: 'Computer Science • By Campus Student',
    body: '',
    downloads: 167,
    upvotes: 25,
  },
];

function LibraryScreen() {
  const { colors } = useTheme();
  const label = (text: string) => (
    <AppText weight="bold" tone="secondary" style={{ fontSize: 8.5, letterSpacing: 0.8 }}>
      {text}
    </AppText>
  );
  return (
    <>
      <ScreenTitle title="Campus Resources" subtitle="Past questions, lecture notes & portal directories" />
      <View style={{ flexDirection: 'row', gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.brandPrimary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Ionicons name="school" size={10} color="#FFFFFF" />
          <AppText weight="bold" style={{ fontSize: 9, color: '#FFFFFF' }}>
            Research Hub
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.brandPrimary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Ionicons name="cloud-upload-outline" size={10} color="#FFFFFF" />
          <AppText weight="bold" style={{ fontSize: 9, color: '#FFFFFF' }}>
            Upload
          </AppText>
        </View>
      </View>

      {/* portal directory */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {label('UNI DIRECTORY')}
        </View>
        <AppText tone="secondary" style={{ fontSize: 8.5 }}>
          3 links
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', gap: 5 }} pointerEvents="none">
        {['Your Uni Portals', 'National Portals'].map((text, index) => (
          <View
            key={text}
            style={{
              paddingHorizontal: 9,
              paddingVertical: 3,
              borderRadius: 999,
              backgroundColor: index === 0 ? colors.brandPrimary : colors.surface,
              borderWidth: 1,
              borderColor: index === 0 ? colors.brandPrimary : colors.border,
            }}
          >
            <AppText weight={index === 0 ? 'bold' : 'regular'} style={{ fontSize: 8.5, color: index === 0 ? '#FFFFFF' : colors.textSecondary }}>
              {text}
            </AppText>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, overflow: 'hidden' }} pointerEvents="none">
        {[
          { cat: 'Portal', title: 'Student Portal', url: 'portal.institution.edu.ng' },
          { cat: 'Services', title: 'E-Learning', url: 'lms.institution.edu.ng' },
          { cat: 'Library', title: 'Library Catalogue', url: 'library.institution.edu.ng' },
        ].map((portal) => (
          <View key={portal.title} style={{ width: 82, height: 62, flexShrink: 0, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 7, paddingVertical: 6, gap: 2 }}>
            <AppText weight="semiBold" tone="secondary" numberOfLines={1} style={{ fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              {portal.cat}
            </AppText>
            <AppText weight="bold" numberOfLines={2} style={{ fontSize: 9.5, lineHeight: 12, minHeight: 24 }}>
              {portal.title}
            </AppText>
            <AppText tone="secondary" numberOfLines={1} style={{ fontSize: 8 }}>
              {portal.url}
            </AppText>
          </View>
        ))}
      </View>

      {/* academic repository */}
      {label('ACADEMIC REPOSITORY & STUDY FILES')}
      <SearchPill placeholder="Search by course code, title..." withFilter />
      <ChipRow
        chips={[
          { label: 'All Files', icon: 'document-text-outline' },
          { label: 'Past Questions', icon: 'help-circle-outline' },
          { label: 'Course Notes', icon: 'book-outline' },
          { label: 'Bookmarked', icon: 'bookmark' },
        ]}
      />

      {RESOURCE_LIST.map((item) => (
        <View key={item.id} style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
              <BadgeText label={item.course} color={colors.textSecondary} />
              <BadgeText label={item.category} color={colors.textSecondary} />
              <AppText tone="secondary" style={{ fontSize: 8.5 }}>
                {item.size}
              </AppText>
            </View>
            <Ionicons name="bookmark-outline" size={15} color={colors.textSecondary} />
          </View>
          <AppText weight="bold" style={{ fontSize: 12, lineHeight: 16, marginTop: 4 }}>
            {item.title}
          </AppText>
          <AppText tone="secondary" style={{ fontSize: 9.5, lineHeight: 13, marginTop: 3 }}>
            {item.by}
          </AppText>
          {item.body ? (
            <AppText tone="secondary" style={{ fontSize: 10, lineHeight: 14, marginTop: 4 }}>
              {item.body}
            </AppText>
          ) : null}

          <View style={{ marginTop: 7, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.divider, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="download-outline" size={12} color={colors.textSecondary} />
                <AppText tone="secondary" style={{ fontSize: 9.5 }}>
                  {item.downloads}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="thumbs-up-outline" size={12} color={colors.textSecondary} />
                <AppText tone="secondary" style={{ fontSize: 9.5 }}>
                  {item.upvotes}
                </AppText>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
                <Ionicons name="flag-outline" size={12} color={colors.textSecondary} />
                <AppText tone="secondary" style={{ fontSize: 9.5 }}>
                  Report
                </AppText>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Btn label="Read Online" kind="secondary" grow />
              <Btn label="Download" grow />
            </View>
          </View>
        </View>
      ))}
    </>
  );
}

const JOB_LIST = [
  { id: 'j1', type: 'Full-time', remote: false, title: 'Junior Software Engineer', company: 'Sample Tech Ltd', location: 'Lagos', poster: 'Alumni Member' },
  { id: 'j2', type: 'Internship', remote: true, title: 'Data Analyst Intern', company: 'Example Analytics', location: 'Remote', poster: 'Career Desk' },
];

function CareersScreen() {
  const { colors } = useTheme();
  return (
    <>
      <ScreenTitle title="Career & Jobs" subtitle="Community-posted roles, alumni referrals & industry gigs" action="Post Job" actionIcon="add" />
      <SearchPill placeholder="Search jobs" />
      <ChipRow
        chips={[
          { label: 'All Openings', icon: 'briefcase-outline' },
          { label: 'Internships', icon: 'school-outline' },
          { label: 'Remote Only', icon: 'globe-outline' },
          { label: 'Graduate Roles', icon: 'ribbon-outline' },
        ]}
      />

      {JOB_LIST.map((job) => (
        <View key={job.id} style={{ backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: colors.divider, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="briefcase-outline" size={16} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <BadgeText label={job.type} color={job.type === 'Internship' ? colors.brandAccent : colors.brandPrimary} />
                {job.remote ? <BadgeText label="Remote" color={colors.success} /> : null}
              </View>
              <AppText weight="bold" style={{ fontSize: 12, lineHeight: 16, marginTop: 2 }}>
                {job.title}
              </AppText>
              <AppText tone="secondary" numberOfLines={1} style={{ fontSize: 9.5, lineHeight: 13 }}>
                {job.company} | {job.location}
              </AppText>
            </View>
          </View>

          <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.divider, gap: 5 }}>
            <AppText tone="secondary" numberOfLines={1} style={{ fontSize: 9 }}>
              Posted by {job.poster}
            </AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 4 }}>
              <Btn label="Job Site ↗" kind="ghost" />
              <Btn label="Notify Poster of Interest" />
            </View>
          </View>
        </View>
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
