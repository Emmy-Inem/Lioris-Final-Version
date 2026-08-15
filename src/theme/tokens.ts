export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// Radius scale aligned to the reference app's actual Compose shapes
// (UserTypeBadge: 8dp, VisibilityBadge/PortalCard: 12dp, SkeletonLoader/
// CampusImage: 16dp, EmptyState icon/buttons: 20dp, GlassCard/frostedCard
// default: 25dp).
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  glass: 25,
  pill: 999,
} as const;

// Minimum touch target per PRD Section 18.5 (Accessibility): 48 x 48 dp.
export const minTouchTarget = 48;

export const glassBlur = {
  light: 30,
  medium: 45,
  strong: 65,
} as const;
