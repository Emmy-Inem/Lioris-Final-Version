import { useWindowDimensions } from 'react-native';

export interface ResponsiveInfo {
  width: number;
  height: number;
  isMobile: boolean; // < 768px
  isTablet: boolean; // 768px - 1023px
  isDesktop: boolean; // >= 1024px
  isWideDesktop: boolean; // >= 1440px
  numColumns: number; // 1 (mobile), 2 (tablet), 3 (desktop), 4 (wide desktop)
  contentMaxWidth: number;
  containerPadding: number;
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();

  const isMobile = width < 768;
  const isTablet = width >= 768 && width < 1024;
  const isDesktop = width >= 1024;
  const isWideDesktop = width >= 1440;

  let numColumns = 1;
  if (isWideDesktop) {
    numColumns = 4;
  } else if (isDesktop) {
    numColumns = 3;
  } else if (isTablet) {
    numColumns = 2;
  }

  const contentMaxWidth = isWideDesktop ? 1440 : isDesktop ? 1240 : 1000;
  const containerPadding = isDesktop ? 32 : isTablet ? 24 : 16;

  return {
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    isWideDesktop,
    numColumns,
    contentMaxWidth,
    containerPadding,
  };
}
