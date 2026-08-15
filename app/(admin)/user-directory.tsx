import React, { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { AppHeader } from '@/components/AppHeader';
import { AppText } from '@/components/AppText';
import { AppTextField } from '@/components/AppTextField';
import { ChipSelect } from '@/components/ChipSelect';
import { SolidCard } from '@/components/SolidCard';
import { Badge } from '@/components/Badge';
import { ActionSheetModal } from '@/components/ActionSheetModal';
import { EmptyState } from '@/components/EmptyState';
import { useTheme } from '@/theme/ThemeProvider';

interface DirectoryUser {
  id: string;
  fullName: string;
  username: string;
  role: 'Student' | 'Alumni' | 'Staff' | 'Admin';
  campus: string;
  suspended: boolean;
}

const MOCK_USERS: DirectoryUser[] = [
  { id: 'u1', fullName: 'Tunde Adebayo', username: 'tundea', role: 'Student', campus: 'Main Campus', suspended: false },
  { id: 'u2', fullName: 'Chioma Nwosu', username: 'chioman', role: 'Student', campus: 'Main Campus', suspended: false },
  { id: 'u3', fullName: 'Priya Nair', username: 'priyan', role: 'Alumni', campus: 'Main Campus', suspended: false },
  { id: 'u4', fullName: 'Marcus Webb', username: 'marcusw', role: 'Alumni', campus: 'North Campus', suspended: true },
  { id: 'u5', fullName: 'Dean of Students', username: 'deanoffice', role: 'Staff', campus: 'Main Campus', suspended: false },
];

const ROLE_FILTERS = ['All', 'Student', 'Alumni', 'Staff', 'Admin'];

export default function UserDirectoryScreen() {
  const { colors, spacing } = useTheme();
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('All');
  const [menuUser, setMenuUser] = useState<DirectoryUser | null>(null);
  const [users, setUsers] = useState(MOCK_USERS);

  const filtered = users.filter(
    (u) =>
      (role === 'All' || u.role === role) &&
      (u.fullName.toLowerCase().includes(query.toLowerCase()) || u.username.toLowerCase().includes(query.toLowerCase())),
  );

  function toggleSuspend(id: string) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, suspended: !u.suspended } : u)));
    setMenuUser(null);
  }

  return (
    <ScreenContainer glow={false}>
      <AppHeader />
      <AppText variant="h1" weight="bold" style={{ paddingTop: spacing.lg, marginBottom: spacing.md }}>
        Global User Directory
      </AppText>
      <AppTextField label="" placeholder="Search by name or username" value={query} onChangeText={setQuery} />
      <View style={{ marginBottom: spacing.lg }}>
        <ChipSelect options={ROLE_FILTERS} selected={[role]} onToggle={setRole} />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SolidCard style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <AppText weight="bold" variant="bodySmall">
                  {item.fullName}
                </AppText>
                <AppText tone="secondary" variant="caption">
                  @{item.username} {'\u00b7'} {item.campus}
                </AppText>
                {item.suspended ? (
                  <View style={{ marginTop: 4 }}>
                    <Badge label="Suspended" tone="critical" />
                  </View>
                ) : null}
              </View>
              <Badge label={item.role} tone="neutral" />
              <Pressable
                onPress={() => setMenuUser(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Options for ${item.fullName}`}
                style={{ padding: spacing.xs }}
              >
                <Ionicons name="ellipsis-vertical" size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
          </SolidCard>
        )}
        ListEmptyComponent={<EmptyState title="No users found" description="Try a different search or filter." />}
      />

      <ActionSheetModal visible={!!menuUser} onClose={() => setMenuUser(null)}>
        <AppText weight="bold" style={{ marginBottom: spacing.sm }}>
          {menuUser?.fullName}
        </AppText>
        <Pressable
          style={{ paddingVertical: spacing.sm }}
          onPress={() => setMenuUser(null)}
          accessibilityRole="button"
          accessibilityLabel="Mutate role to Alumni"
        >
          <AppText>Mutate role to Alumni</AppText>
        </Pressable>
        <Pressable
          style={{ paddingVertical: spacing.sm }}
          onPress={() => menuUser && toggleSuspend(menuUser.id)}
          accessibilityRole="button"
          accessibilityLabel={menuUser?.suspended ? 'Revoke suspension' : 'Shadow-ban or suspend'}
        >
          <AppText>{menuUser?.suspended ? 'Revoke suspension' : 'Shadow-ban / suspend'}</AppText>
        </Pressable>
        <Pressable
          style={{ paddingVertical: spacing.sm }}
          onPress={() => setMenuUser(null)}
          accessibilityRole="button"
          accessibilityLabel="Wipe account"
        >
          <AppText tone="critical">Wipe account</AppText>
        </Pressable>
      </ActionSheetModal>
    </ScreenContainer>
  );
}
