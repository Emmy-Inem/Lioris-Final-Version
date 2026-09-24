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

const TABS: Record<MockRole, MockTab[]> = {
  student: [
    { key: 'home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
    { key: 'forum', label: 'Forum', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
    { key: 'events', label: 'Events', icon: 'calendar-outline', iconActive: 'calendar' },
    { key: 'resources', label: 'Resources', icon: 'folder-outline', iconActive: 'folder' },
  ],
  alumni: [
    { key: 'home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
    { key: 'careers', label: 'Careers', icon: 'briefcase-outline', iconActive: 'briefcase' },
    { key: 'forum', label: 'Forum', icon: 'chatbubbles-outline', iconActive: 'chatbubbles' },
    { key: 'events', label: 'Events', icon: 'calendar-outline', iconActive: 'calendar' },
    { key: 'mentorship', label: 'Mentors', icon: 'ribbon-outline', iconActive: 'ribbon' },
  ],
};

const INACTIVE_TAB_WIDTH = 38;

export function PhoneMockup({ role }: { role: MockRole }) {
  const { colors, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const [active, setActive] = useState('home');
  const scrollRef = useRef<ScrollView>(null);
  const fade = useRef(new Animated.Value(1)).current;

  const tabs = TABS[role];
  const phoneWidth = Math.min(windowWidth - 32, 316);
  const phoneHeight = Math.round(phoneWidth * 2.02);
  const bezel = 9;
  const screenRadius = 38;

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

  const screenBg = colors.background;

  return (
    <View
      accessibilityLabel="Interactive preview of the Lioris app. Tap the bottom tabs to explore."
      style={{
        width: phoneWidth + 6,
        height: phoneHeight + 6,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* side buttons */}
      <View style={{ position: 'absolute', left: 0, top: phoneHeight * 0.17, width: 3, height: 26, borderRadius: 2, backgroundColor: '#2B3140' }} />
      <View style={{ position: 'absolute', left: 0, top: phoneHeight * 0.25, width: 3, height: 44, borderRadius: 2, backgroundColor: '#2B3140' }} />
      <View style={{ position: 'absolute', left: 0, top: phoneHeight * 0.34, width: 3, height: 44, borderRadius: 2, backgroundColor: '#2B3140' }} />
      <View style={{ position: 'absolute', right: 0, top: phoneHeight * 0.28, width: 3, height: 70, borderRadius: 2, backgroundColor: '#2B3140' }} />

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
                  ? '0 30px 70px -16px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,255,255,0.06)'
                  : '0 30px 70px -16px rgba(15,23,42,0.45), inset 0 0 0 1px rgba(255,255,255,0.08)',
              } as any)
            : { elevation: 12 }),
        }}
      >
        {/* screen */}
        <View style={{ flex: 1, borderRadius: screenRadius, overflow: 'hidden', backgroundColor: screenBg }}>
          <StatusBar />
          <AppHeaderMock onGo={go} tabs={tabs} />

          <Animated.View
            style={{
              flex: 1,
              opacity: fade,
              transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
            }}
          >
            <ScrollView
              ref={scrollRef}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 92, gap: 10 }}
            >
              {role === 'student' && active === 'home' ? <StudentHome onGo={go} /> : null}
              {role === 'alumni' && active === 'home' ? <AlumniHome onGo={go} /> : null}
              {active === 'forum' ? <ForumScreen role={role} /> : null}
              {active === 'events' ? <EventsScreen role={role} /> : null}
              {active === 'resources' ? <ResourcesScreen /> : null}
              {active === 'careers' ? <CareersScreen /> : null}
              {active === 'mentorship' ? <MentorshipScreen /> : null}
            </ScrollView>
          </Animated.View>

          <FloatingTabBar tabs={tabs} active={active} onSelect={go} />

          {/* home indicator */}
          <View style={{ position: 'absolute', bottom: 5, alignSelf: 'center', width: 96, height: 4, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.55)' }} />
        </View>

        {/* dynamic island */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: bezel + 9, alignSelf: 'center', width: 92, height: 26, borderRadius: 13, backgroundColor: '#000000' }}
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
    <View style={{ height: 44, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 4 }}>
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

function AppHeaderMock({ onGo, tabs }: { onGo: (key: string) => void; tabs: MockTab[] }) {
  const { colors } = useTheme();
  const roundButton = (icon: IconName, label: string, onPress?: () => void) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={icon} size={14} color={colors.textPrimary} />
    </Pressable>
  );
  const goForum = tabs.find((t) => t.key === 'forum');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <LiorisLogo size={22} variant="symbol" />
        <LiorisLogo size={14} variant="wordmark" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {roundButton('chatbubble-ellipses-outline', 'Messages', goForum ? () => onGo('forum') : undefined)}
        {roundButton('bookmark-outline', 'Saved')}
        {roundButton('search-outline', 'Search')}
        {roundButton('notifications-outline', 'Alerts')}
        <View
          style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}
        >
          <AppText weight="bold" style={{ fontSize: 11, color: colors.brandPrimary }}>
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
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center' }}>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          padding: 4,
          borderRadius: 26,
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
          const activeWidth = INACTIVE_TAB_WIDTH + 12 + tab.label.length * 6.6;
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
                  height: 38,
                  width: p.interpolate({ inputRange: [0, 1], outputRange: [INACTIVE_TAB_WIDTH, activeWidth] }),
                  borderRadius: 19,
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

function Card({ children, onPress, style }: { children: React.ReactNode; onPress?: () => void; style?: any }) {
  const { colors } = useTheme();
  const body = (
    <View
      style={[
        { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 11, gap: 5 },
        style,
      ]}
    >
      {children}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }} style={{ flexGrow: 0 }}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              haptics.light();
              onChange(option);
            }}
            style={{
              paddingHorizontal: 11,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: selected ? colors.brandPrimary : colors.surface,
              borderWidth: 1,
              borderColor: selected ? colors.brandPrimary : colors.border,
            }}
          >
            <AppText weight="bold" style={{ fontSize: 10.5, color: selected ? '#FFFFFF' : colors.textSecondary }}>
              {option}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Pill({ label, onPress, done, doneLabel, secondary }: { label: string; onPress: () => void; done?: boolean; doneLabel?: string; secondary?: boolean }) {
  const { colors } = useTheme();
  const filled = !secondary && !done;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptics.light();
        onPress();
      }}
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
        {done ? doneLabel ?? label : label}
      </AppText>
    </Pressable>
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
 * Screens
 * ---------------------------------------------------------------------------------------------- */

function StudentHome({ onGo }: { onGo: (key: string) => void }) {
  const { colors } = useTheme();
  const tiles: { label: string; icon: IconName; go: string }[] = [
    { label: 'Forum', icon: 'chatbubbles-outline', go: 'forum' },
    { label: 'Events', icon: 'calendar-outline', go: 'events' },
    { label: 'Resources', icon: 'folder-open-outline', go: 'resources' },
  ];
  return (
    <>
      <LinearGradient colors={['#1A3DFF', '#5B7CFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, padding: 14, gap: 3 }}>
        <AppText weight="bold" style={{ fontSize: 10, letterSpacing: 0.8, color: 'rgba(255,255,255,0.8)' }}>
          YOUR UNIVERSITY
        </AppText>
        <AppText weight="bold" style={{ fontSize: 17, color: '#FFFFFF' }}>
          Welcome back, Student
        </AppText>
        <AppText style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>Your department • 300 Level</AppText>
      </LinearGradient>

      <Heading>Student services</Heading>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {tiles.map((tile) => (
          <Pressable key={tile.label} accessibilityRole="button" onPress={() => onGo(tile.go)} style={{ flex: 1 }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 8, minHeight: 74, justifyContent: 'space-between' }}>
              <Ionicons name={tile.icon} size={18} color={colors.brandPrimary} />
              <AppText weight="bold" style={{ fontSize: 11 }}>
                {tile.label}
              </AppText>
            </View>
          </Pressable>
        ))}
      </View>

      <Card>
        <Tag label="ANNOUNCEMENT" />
        <Title>Course registration closes Friday</Title>
        <Meta>Confirm your courses before the portal locks at 5:00 PM.</Meta>
      </Card>

      <Heading>Coming up</Heading>
      <Card onPress={() => onGo('events')}>
        <Tag label="CAMPUS CALENDAR" />
        <Title>Innovation & Technology Symposium</Title>
        <Meta>Main Auditorium • Tomorrow, 10:00 AM</Meta>
      </Card>
    </>
  );
}

function AlumniHome({ onGo }: { onGo: (key: string) => void }) {
  const { colors } = useTheme();
  const stats = [
    { label: 'Mentees', value: '3' },
    { label: 'Open roles', value: '12' },
    { label: 'Events', value: '2' },
  ];
  return (
    <>
      <LinearGradient colors={['#0F766E', '#14B8A6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, padding: 14, gap: 3 }}>
        <AppText weight="bold" style={{ fontSize: 10, letterSpacing: 0.8, color: 'rgba(255,255,255,0.8)' }}>
          ALUMNI CIRCLE
        </AppText>
        <AppText weight="bold" style={{ fontSize: 17, color: '#FFFFFF' }}>
          Welcome back, Alumnus
        </AppText>
        <AppText style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>Class of 2020 • Your industry</AppText>
      </LinearGradient>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {stats.map((stat) => (
          <View key={stat.label} style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 10, alignItems: 'center' }}>
            <AppText weight="bold" style={{ fontSize: 18, color: colors.brandPrimary }}>
              {stat.value}
            </AppText>
            <AppText tone="secondary" style={{ fontSize: 10 }}>
              {stat.label}
            </AppText>
          </View>
        ))}
      </View>

      <Heading>For you</Heading>
      <Card onPress={() => onGo('careers')}>
        <Tag label="CAREER PIPELINE" />
        <Title>Graduate Trainee • Sample Tech Ltd</Title>
        <Meta>Refer a graduating student directly to the hiring team.</Meta>
      </Card>
      <Card onPress={() => onGo('mentorship')}>
        <Tag label="MENTORSHIP" />
        <Title>2 students asked for your guidance</Title>
        <Meta>Review the requests and pick a time that suits you.</Meta>
      </Card>
    </>
  );
}

const FORUM_POSTS = [
  { id: 'p1', channel: 'Academic', title: 'Best way to prepare for the practical exam?', body: 'Our lab session is on Friday and the past questions look very different this year. How are you revising?', likes: 24, comments: 9, time: '12m' },
  { id: 'p2', channel: 'Campus Life', title: 'Where is the best quiet study spot on campus?', body: 'The main library is packed during exams. Looking for somewhere with sockets and Wi-Fi.', likes: 41, comments: 17, time: '1h' },
  { id: 'p3', channel: 'Career', title: 'Internship applications open next month', body: 'Sharing a checklist for CVs and cover letters that worked for our cohort last year.', likes: 66, comments: 12, time: '3h' },
];

function ForumScreen({ role }: { role: MockRole }) {
  const { colors } = useTheme();
  const [channel, setChannel] = useState('All Threads');
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [vote, setVote] = useState<number | null>(null);
  const posts = FORUM_POSTS.filter((post) => channel === 'All Threads' || channel === 'Polls' || post.channel === channel);
  const pollOptions = ['Morning sessions', 'Evening sessions', 'Weekend only'];
  const pollBase = [42, 31, 12];
  const total = pollBase.reduce((a, b) => a + b, 0) + (vote !== null ? 1 : 0);

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, height: 32 }}>
        <Ionicons name="search" size={13} color={colors.textSecondary} />
        <AppText tone="secondary" style={{ fontSize: 11 }}>
          Search discussions, topics, codes...
        </AppText>
      </View>
      <Chips options={['All Threads', 'Academic', 'Campus Life', 'Career', 'Polls']} value={channel} onChange={setChannel} />

      {channel === 'Polls' ? (
        <Card>
          <Tag label="C/POLLS" />
          <Title>{role === 'student' ? 'When should the revision classes hold?' : 'Which mentorship format works best?'}</Title>
          {pollOptions.map((option, index) => {
            const votes = pollBase[index] + (vote === index ? 1 : 0);
            const percent = Math.round((votes / total) * 100);
            const chosen = vote === index;
            return (
              <Pressable
                key={option}
                accessibilityRole="button"
                onPress={() => {
                  haptics.light();
                  setVote(index);
                }}
                style={{ borderRadius: 10, borderWidth: 1, borderColor: chosen ? colors.brandPrimary : colors.border, overflow: 'hidden' }}
              >
                {vote !== null ? (
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${percent}%`, backgroundColor: colors.pastelPrimaryBg }} />
                ) : null}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 8 }}>
                  <AppText weight={chosen ? 'bold' : 'medium'} style={{ fontSize: 11 }}>
                    {option}
                  </AppText>
                  {vote !== null ? (
                    <AppText weight="bold" style={{ fontSize: 11 }}>
                      {percent}%
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
          <Meta>{vote === null ? 'Tap an option to vote' : `${total} votes • thanks for voting`}</Meta>
        </Card>
      ) : (
        posts.map((post) => {
          const isLiked = !!liked[post.id];
          return (
            <Card key={post.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person" size={13} color={colors.brandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" style={{ fontSize: 11.5 }}>
                    Campus Member <AppText tone="secondary" style={{ fontSize: 10.5 }}>• {role === 'student' ? 'Student' : 'Alumni'}</AppText>
                  </AppText>
                  <AppText tone="secondary" style={{ fontSize: 10 }}>
                    c/{post.channel.toLowerCase().replace(/\s/g, '')} • {post.time}
                  </AppText>
                </View>
              </View>
              <Title>{post.title}</Title>
              <AppText numberOfLines={3} style={{ fontSize: 11.5, lineHeight: 16 }}>
                {post.body}
              </AppText>
              <View style={{ flexDirection: 'row', gap: 16, marginTop: 2 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isLiked ? 'Unlike' : 'Like'}
                  onPress={() => {
                    haptics.light();
                    setLiked((prev) => ({ ...prev, [post.id]: !prev[post.id] }));
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={15} color={isLiked ? colors.critical : colors.textSecondary} />
                  <AppText weight="bold" style={{ fontSize: 11, color: isLiked ? colors.critical : colors.textSecondary }}>
                    {post.likes + (isLiked ? 1 : 0)}
                  </AppText>
                </Pressable>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="chatbubble-outline" size={14} color={colors.textSecondary} />
                  <AppText tone="secondary" style={{ fontSize: 11 }}>
                    {post.comments}
                  </AppText>
                </View>
              </View>
            </Card>
          );
        })
      )}
    </>
  );
}

const EVENTS = [
  { id: 'e1', month: 'OCT', day: '04', title: 'Innovation & Technology Symposium', where: 'Main Auditorium', time: '10:00 AM', going: 182, virtual: false },
  { id: 'e2', month: 'OCT', day: '09', title: 'Career Fair & CV Clinic', where: 'Student Centre', time: '9:00 AM', going: 264, virtual: false },
  { id: 'e3', month: 'OCT', day: '15', title: 'Research Writing Workshop', where: 'Online (video call)', time: '4:00 PM', going: 97, virtual: true },
];
const ALUMNI_EVENTS = [
  { id: 'a1', month: 'DEC', day: '12', title: 'Annual Alumni Dinner & Gala', where: 'City Convention Hall', time: '6:00 PM', going: 140, virtual: false },
  { id: 'a2', month: 'NOV', day: '21', title: 'Homecoming Networking Mixer', where: 'Alumni House', time: '3:00 PM', going: 88, virtual: false },
  { id: 'a3', month: 'NOV', day: '02', title: 'Careers in Tech: Alumni Panel', where: 'Online (video call)', time: '5:00 PM', going: 120, virtual: true },
];

function EventsScreen({ role }: { role: MockRole }) {
  const { colors } = useTheme();
  const [filter, setFilter] = useState('All');
  const [rsvp, setRsvp] = useState<Record<string, boolean>>({});
  const list = (role === 'student' ? EVENTS : ALUMNI_EVENTS).filter((e) => filter === 'All' || (filter === 'Online' ? e.virtual : !e.virtual));
  return (
    <>
      <Chips options={['All', 'On campus', 'Online']} value={filter} onChange={setFilter} />
      {list.map((event) => {
        const going = !!rsvp[event.id];
        return (
          <Card key={event.id}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ width: 42, borderRadius: 12, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', paddingVertical: 6 }}>
                <AppText weight="bold" style={{ fontSize: 9.5, color: colors.brandPrimary }}>
                  {event.month}
                </AppText>
                <AppText weight="bold" style={{ fontSize: 17, lineHeight: 20, color: colors.brandPrimary }}>
                  {event.day}
                </AppText>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Title>{event.title}</Title>
                <Meta>
                  {event.time} • {event.where}
                </Meta>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Ionicons name="people" size={14} color={colors.textSecondary} />
                <AppText weight="bold" tone="secondary" style={{ fontSize: 11 }}>
                  {event.going + (going ? 1 : 0)} attending
                </AppText>
              </View>
              <Pill label="RSVP" done={going} doneLabel="Going ✓" secondary={going} onPress={() => setRsvp((prev) => ({ ...prev, [event.id]: !prev[event.id] }))} />
            </View>
          </Card>
        );
      })}
    </>
  );
}

const RESOURCES = [
  { id: 'r1', kind: 'Notes', code: 'MTH 201', title: 'Linear Algebra - Complete Lecture Notes', meta: 'Mathematics • 4.2 MB', downloads: 812 },
  { id: 'r2', kind: 'Past Questions', code: 'CSC 305', title: 'Operating Systems Past Questions (5 sessions)', meta: 'Computer Science • 1.8 MB', downloads: 1204 },
  { id: 'r3', kind: 'Projects', code: 'ENG 402', title: 'Final Year Project Report Template', meta: 'Engineering • 620 KB', downloads: 356 },
];

function ResourcesScreen() {
  const { colors } = useTheme();
  const [kind, setKind] = useState('All');
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [got, setGot] = useState<Record<string, boolean>>({});
  const list = RESOURCES.filter((r) => kind === 'All' || r.kind === kind);
  return (
    <>
      <Chips options={['All', 'Notes', 'Past Questions', 'Projects']} value={kind} onChange={setKind} />
      {list.map((resource) => {
        const bookmarked = !!saved[resource.id];
        const downloaded = !!got[resource.id];
        return (
          <Card key={resource.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText weight="bold" style={{ fontSize: 10, color: colors.textSecondary }}>
                {resource.code} • {resource.kind.toUpperCase()}
              </AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={bookmarked ? 'Remove bookmark' : 'Bookmark'}
                onPress={() => {
                  haptics.light();
                  setSaved((prev) => ({ ...prev, [resource.id]: !prev[resource.id] }));
                }}
              >
                <Ionicons name={bookmarked ? 'bookmark' : 'bookmark-outline'} size={16} color={bookmarked ? colors.brandPrimary : colors.textSecondary} />
              </Pressable>
            </View>
            <Title>{resource.title}</Title>
            <Meta>{resource.meta}</Meta>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="download-outline" size={13} color={colors.textSecondary} />
              <AppText tone="secondary" style={{ fontSize: 10.5 }}>
                {resource.downloads + (downloaded ? 1 : 0)}
              </AppText>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
              <View style={{ flex: 1 }}>
                <PillBlock label="Read Online" secondary onPress={() => undefined} />
              </View>
              <View style={{ flex: 1 }}>
                <PillBlock label="Download" done={downloaded} doneLabel="Saved" onPress={() => setGot((prev) => ({ ...prev, [resource.id]: !prev[resource.id] }))} />
              </View>
            </View>
          </Card>
        );
      })}
    </>
  );
}

/** A full-width version of Pill for two-button rows. */
function PillBlock(props: { label: string; onPress: () => void; done?: boolean; doneLabel?: string; secondary?: boolean }) {
  return (
    <View style={{ alignItems: 'stretch' }}>
      <View style={{ alignSelf: 'stretch' }}>
        <PillFill {...props} />
      </View>
    </View>
  );
}

function PillFill({ label, onPress, done, doneLabel, secondary }: { label: string; onPress: () => void; done?: boolean; doneLabel?: string; secondary?: boolean }) {
  const { colors } = useTheme();
  const outlined = secondary || done;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        haptics.light();
        onPress();
      }}
      style={{
        paddingVertical: 7,
        borderRadius: 999,
        alignItems: 'center',
        backgroundColor: outlined ? 'transparent' : colors.brandPrimary,
        borderWidth: outlined ? 1.5 : 0,
        borderColor: colors.brandPrimary,
      }}
    >
      <AppText weight="bold" style={{ fontSize: 10.5, color: outlined ? colors.brandPrimary : '#FFFFFF' }}>
        {done ? doneLabel ?? label : label}
      </AppText>
    </Pressable>
  );
}

const JOBS = [
  { id: 'j1', type: 'Graduate Trainee', title: 'Junior Software Engineer', company: 'Sample Tech Ltd', where: 'Lagos • Hybrid', remote: true },
  { id: 'j2', type: 'Internship', title: 'Data Analyst Intern', company: 'Example Analytics', where: 'Abuja • On site', remote: false },
  { id: 'j3', type: 'Full-time', title: 'Product Designer', company: 'Demo Studio', where: 'Remote', remote: true },
];

function CareersScreen() {
  const { colors } = useTheme();
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  return (
    <>
      <Heading>Open roles</Heading>
      {JOBS.map((job) => (
        <Card key={job.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Tag label={job.type.toUpperCase()} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save job"
              onPress={() => {
                haptics.light();
                setSaved((prev) => ({ ...prev, [job.id]: !prev[job.id] }));
              }}
            >
              <Ionicons name={saved[job.id] ? 'bookmark' : 'bookmark-outline'} size={16} color={saved[job.id] ? colors.brandPrimary : colors.textSecondary} />
            </Pressable>
          </View>
          <Title>{job.title}</Title>
          <Meta>
            {job.company} • {job.where}
          </Meta>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 }}>
            <Pill label="Refer a student" done={!!applied[job.id]} doneLabel="Referral sent ✓" secondary={!!applied[job.id]} onPress={() => setApplied((prev) => ({ ...prev, [job.id]: !prev[job.id] }))} />
          </View>
        </Card>
      ))}
    </>
  );
}

const REQUESTS = [
  { id: 'm1', name: 'Student A', topic: 'Breaking into cloud engineering', level: '300 Level' },
  { id: 'm2', name: 'Student B', topic: 'Preparing for graduate school applications', level: '400 Level' },
];

function MentorshipScreen() {
  const { colors } = useTheme();
  const [answer, setAnswer] = useState<Record<string, 'accepted' | 'declined'>>({});
  return (
    <>
      <Heading>Mentorship requests</Heading>
      {REQUESTS.map((request) => {
        const state = answer[request.id];
        return (
          <Card key={request.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.pastelPrimaryBg, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="school" size={14} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText weight="bold" style={{ fontSize: 12 }}>
                  {request.name}
                </AppText>
                <AppText tone="secondary" style={{ fontSize: 10.5 }}>
                  {request.level}
                </AppText>
              </View>
            </View>
            <Title>{request.topic}</Title>
            {state ? (
              <AppText weight="bold" style={{ fontSize: 11.5, color: state === 'accepted' ? colors.success : colors.textSecondary }}>
                {state === 'accepted' ? 'Accepted - a chat with the student opens next' : 'Declined - the student is notified politely'}
              </AppText>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                <View style={{ flex: 1 }}>
                  <PillFill label="Accept" onPress={() => setAnswer((prev) => ({ ...prev, [request.id]: 'accepted' }))} />
                </View>
                <View style={{ flex: 1 }}>
                  <PillFill label="Decline" secondary onPress={() => setAnswer((prev) => ({ ...prev, [request.id]: 'declined' }))} />
                </View>
              </View>
            )}
          </Card>
        );
      })}
    </>
  );
}
