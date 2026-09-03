import React, { useState } from 'react';
import { View, ScrollView, Pressable, Modal, Dimensions, Platform } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { AppText } from './AppText';
import { Avatar } from './Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { useAuth } from '@/auth/AuthContext';
import { useToast } from '@/context/ToastContext';
import { haptics } from '@/utils/haptics';

interface CampusStory {
  id: string;
  authorName: string;
  authorRole: string;
  avatarUrl?: any;
  title: string;
  mediaUrl: any;
  timestamp: string;
  hasUnseen: boolean;
}

const DEFAULT_CAMPUS_STORIES: CampusStory[] = [
  {
    id: 'story-1',
    authorName: 'SUG Senate',
    authorRole: 'Student Union',
    title: 'Senate Meeting & Shuttle Subsidy Briefing 🚌',
    mediaUrl: require('../../assets/images/student_rep_group.jpg'),
    timestamp: '2h ago',
    hasUnseen: true,
  },
  {
    id: 'story-2',
    authorName: 'Tech Hub',
    authorRole: 'Hackfest Arena',
    title: 'Live Hacking: 48 Teams building with AI 💻⚡',
    mediaUrl: require('../../assets/images/event_tech_hackathon.jpg'),
    timestamp: '4h ago',
    hasUnseen: true,
  },
  {
    id: 'story-3',
    authorName: 'Dike e-Library',
    authorRole: 'Campus Study Hub',
    title: 'Quiet Zone Floor 3 now open 24/7 for Exam Prep 📚',
    mediaUrl: require('../../assets/images/campus_library_study.jpg'),
    timestamp: '6h ago',
    hasUnseen: true,
  },
  {
    id: 'story-4',
    authorName: 'Faculty of Tech',
    authorRole: 'Engineering',
    title: 'Annual Robotics & Embedded Systems Demo 🤖',
    mediaUrl: require('../../assets/images/campus_students_photo.jpg'),
    timestamp: '8h ago',
    hasUnseen: false,
  },
];

export function StoriesBar() {
  const { colors, spacing, radius, isDark } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const [stories, setStories] = useState<CampusStory[]>(DEFAULT_CAMPUS_STORIES);
  const [activeStory, setActiveStory] = useState<CampusStory | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);

  function handleOpenStory(story: CampusStory, index: number) {
    haptics.light();
    setActiveStory(story);
    setStoryIndex(index);
    // Mark as seen
    setStories((prev) =>
      prev.map((s) => (s.id === story.id ? { ...s, hasUnseen: false } : s)),
    );
  }

  function handleAddStory() {
    haptics.medium();
    toast.info('Temporary story feature is active! Tap any fleet to view campus updates.');
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="sparkles" size={15} color={colors.brandPrimary} />
          <AppText variant="caption" weight="bold" tone="brand" style={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Campus Fleets & Stories
          </AppText>
        </View>
        <AppText variant="caption" tone="secondary">
          24h live updates
        </AppText>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={{ gap: 12, paddingRight: spacing.md }}
        style={{ flexDirection: 'row' }}
        {...({ 'data-horizontal-scroll': 'true' } as any)}
      >
        {/* Add Story Circle */}
        <Pressable
          onPress={handleAddStory}
          style={{ alignItems: 'center', width: 68 }}
        >
          <View
            style={{
              width: 58,
              height: 58,
              borderRadius: 29,
              borderWidth: 2,
              borderStyle: 'dashed',
              borderColor: colors.brandPrimary,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.pastelPrimaryBg,
              marginBottom: 4,
            }}
          >
            <Ionicons name="add" size={26} color={colors.brandPrimary} />
          </View>
          <AppText variant="caption" weight="semiBold" numberOfLines={1} style={{ textAlign: 'center', fontSize: 11 }}>
            Your Story
          </AppText>
        </Pressable>

        {/* Campus Stories Circles */}
        {stories.map((story, idx) => {
          return (
            <Pressable
              key={story.id}
              onPress={() => handleOpenStory(story, idx)}
              style={{ alignItems: 'center', width: 68 }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  padding: 2.5,
                  backgroundColor: story.hasUnseen
                    ? '#F59E0B'
                    : colors.border,
                  marginBottom: 4,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: 28,
                    overflow: 'hidden',
                    backgroundColor: colors.surface,
                    borderWidth: 2,
                    borderColor: colors.surface,
                  }}
                >
                  <Image
                    source={story.mediaUrl}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                </View>
              </View>
              <AppText variant="caption" weight={story.hasUnseen ? 'bold' : 'regular'} numberOfLines={1} style={{ textAlign: 'center', fontSize: 11 }}>
                {story.authorName.split(' ')[0]}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Story Viewer Modal */}
      {activeStory && (
        <Modal visible={!!activeStory} transparent animationType="fade" onRequestClose={() => setActiveStory(null)}>
          <View
            style={{
              flex: 1,
              backgroundColor: '#000',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {/* Header / Progress Bar */}
            <View
              style={{
                position: 'absolute',
                top: Platform.OS === 'web' ? 24 : 50,
                left: 16,
                right: 16,
                zIndex: 20,
              }}
            >
              {/* Progress Line */}
              <View
                style={{
                  height: 3,
                  backgroundColor: 'rgba(255, 255, 255, 0.4)',
                  borderRadius: 2,
                  overflow: 'hidden',
                  marginBottom: 12,
                }}
              >
                <View style={{ width: '100%', height: '100%', backgroundColor: '#FFF' }} />
              </View>

              {/* Author Info */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Avatar name={activeStory.authorName} size={36} />
                  <View>
                    <AppText weight="bold" tone="inverse" variant="bodySmall">
                      {activeStory.authorName}
                    </AppText>
                    <AppText tone="inverse" variant="caption" style={{ opacity: 0.8 }}>
                      {activeStory.authorRole} • {activeStory.timestamp}
                    </AppText>
                  </View>
                </View>
                <Pressable
                  onPress={() => setActiveStory(null)}
                  hitSlop={12}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="close" size={22} color="#FFF" />
                </Pressable>
              </View>
            </View>

            {/* Media Image */}
            <Image
              source={activeStory.mediaUrl}
              style={{
                width: Dimensions.get('window').width,
                height: Dimensions.get('window').height * 0.78,
              }}
              contentFit="cover"
            />

            {/* Bottom Caption Overlay */}
            <View
              style={{
                position: 'absolute',
                bottom: 40,
                left: 20,
                right: 20,
                backgroundColor: 'rgba(0, 0, 0, 0.65)',
                borderRadius: 16,
                padding: 16,
                borderWidth: 1,
                borderColor: 'rgba(255, 255, 255, 0.2)',
              }}
            >
              <AppText tone="inverse" weight="semiBold" variant="body">
                {activeStory.title}
              </AppText>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
