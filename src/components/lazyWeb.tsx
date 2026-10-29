import React, { Component, Suspense, lazy, useRef, type ComponentProps, type ComponentType, type ReactNode } from 'react';

import { SuspenseFallback } from './RouteLoadingFallback';

/**
 * Web-only code splitting for the `Foo.web.tsx` shadow files.
 *
 * Expo's web serializer hoists every module that two or more route chunks import into one `__common` chunk that
 * index.html loads up front. The app's role groups ((student), (alumni), (staff), (admin), ...) share most screens and
 * modals, so almost all of the app's code ended up in that chunk even though a visitor only ever uses one role.
 *
 * A `Foo.web.tsx` next to `Foo.tsx` is picked instead of it by Metro on web (never on iOS/Android, whose bundles are
 * untouched) and exposes the same exports, but loads the real implementation through `import()`. That puts it in its
 * own chunk that is only downloaded when the screen is opened or the modal is shown for the first time.
 *
 * Every shadow file must export exactly what `Foo.tsx` does; `src/utils/lazyShadows.test.ts` checks that.
 */

type Options<T extends ComponentType<any>> = {
  /** Show the route loading spinner while the chunk downloads (screens). Default: render nothing. */
  screen?: boolean;
  /**
   * For modals and sheets: the implementation is not even downloaded until this first returns true. Defaults to
   * "always mounted" (for screens and for widgets that decide for themselves when to show).
   */
  open?: (props: ComponentProps<T>) => boolean;
};

class ChunkErrorBoundary extends Component<{ children: ReactNode; screen: boolean }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // A chunk that fails to download (offline, deploy in between) must not take down the whole page for a modal.
    // Screens rethrow so the route error boundary offers its retry UI.
    console.warn('[lazyWeb] could not load a deferred chunk', error);
  }

  render() {
    if (this.state.failed) {
      if (this.props.screen) throw new Error('Could not load this screen. Check your connection and try again.');
      return null;
    }
    return this.props.children;
  }
}

export function lazyWeb<T extends ComponentType<any>>(load: () => Promise<T>, options: Options<T> = {}): T {
  const { screen = false, open } = options;
  // After a failed download React keeps the rejected promise forever, so the next attempt needs a fresh wrapper.
  const make = () =>
    lazy(async () => {
      try {
        return { default: await load() };
      } catch (error) {
        Lazy = make();
        throw error;
      }
    });
  let Lazy = make();

  function Deferred(props: ComponentProps<T>) {
    const everOpen = useRef(false);
    const openCount = useRef(0);
    const wasOpen = useRef(false);
    const isOpen = open ? open(props) : true;
    if (isOpen && !wasOpen.current) openCount.current += 1;
    wasOpen.current = isOpen;
    if (isOpen) everOpen.current = true;
    if (!everOpen.current) return null;

    const Impl = Lazy as unknown as ComponentType<any>;
    return (
      <ChunkErrorBoundary key={openCount.current} screen={screen}>
        <Suspense fallback={screen ? <SuspenseFallback /> : null}>
          <Impl {...props} />
        </Suspense>
      </ChunkErrorBoundary>
    );
  }
  Deferred.displayName = 'Deferred';

  return Deferred as unknown as T;
}
