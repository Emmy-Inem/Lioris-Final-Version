import { Platform } from 'react-native';

/**
 * Web-only accessibility safety nets for two react-native-web primitives whose DOM output axe
 * (and screen readers) reject. They live in one small MutationObserver instead of ~85 call sites.
 *
 * 1. <Modal>: react-native-web always renders `aria-modal="true"` on the container but only adds
 *    `role="dialog"` once the modal is the topmost one AND its open animation has finished (see
 *    ModalContent: `role: active ? 'dialog' : null`). While a modal animates in - or while another
 *    modal is stacked above it - the container is a plain <div aria-modal>, which is invalid
 *    (`aria-allowed-attr`). We keep the invariant "aria-modal implies a dialog role"; react-native-web
 *    still manages/overrides the role itself when the modal becomes the active one.
 *
 * 2. <ActivityIndicator> renders `role="progressbar"` with no name (`aria-progressbar-name`).
 *    Spinners that were not given a label get the generic name "Loading".
 *
 * 3. <Pressable> that was written without an `accessibilityRole` renders a bare `<div tabindex="0">`: it is
 *    clickable and focusable but a screen reader announces it as plain text, never as an action (hundreds of
 *    call sites: filter chips, "Host New Event", cards). A focusable, role-less div that has a readable name
 *    and no interactive descendant is given `role="button"` (the Enter/Space handling react-native-web already
 *    attaches to every Pressable then matches the role). Wrappers around other controls are left alone so no
 *    control ends up nested in another one.
 *
 * A no-op on native and on repeat calls.
 */
let installed = false;

const MODAL_SELECTOR = '[aria-modal="true"]:not([role])';
const SPINNER_SELECTOR = '[role="progressbar"]:not([aria-label]):not([aria-labelledby])';

const PRESSABLE_SELECTOR = 'div[tabindex="0"]:not([role]):not([aria-hidden="true"])';
const INTERACTIVE_DESCENDANT =
  'a[href],button,input,textarea,select,summary,[tabindex="0"],[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="radio"],[role="switch"],[role="menuitem"],[role="slider"],[role="textbox"],[role="combobox"],[role="option"]';
const ICON_GLYPHS = /[\uE000-\uF8FF\s]/g;

function giveRoleToPressable(el: Element) {
  if (el.hasAttribute('role') || el.getAttribute('tabindex') !== '0') return;
  const name = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.textContent ?? '').replace(ICON_GLYPHS, '');
  if (!name) return;
  if (el.querySelector(INTERACTIVE_DESCENDANT)) return;
  el.setAttribute('role', 'button');
}

function fixElement(el: Element) {
  if (el.tagName === 'DIV' && el.matches(PRESSABLE_SELECTOR)) giveRoleToPressable(el);
  if (el.getAttribute('aria-modal') === 'true' && !el.hasAttribute('role')) el.setAttribute('role', 'dialog');
  if (el.getAttribute('role') === 'progressbar' && !el.hasAttribute('aria-label') && !el.hasAttribute('aria-labelledby')) {
    el.setAttribute('aria-label', 'Loading');
  }
}

function fixTree(root: ParentNode) {
  root.querySelectorAll?.(`${MODAL_SELECTOR},${SPINNER_SELECTOR},${PRESSABLE_SELECTOR}`).forEach(fixElement);
}

export function installWebA11yFixes(): void {
  if (installed || Platform.OS !== 'web' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
  installed = true;
  const run = () => {
    fixTree(document);
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes') {
          fixElement(m.target as Element);
        } else {
          m.addedNodes.forEach((n) => {
            if (n.nodeType !== 1) return;
            fixElement(n as Element);
            fixTree(n as Element);
          });
        }
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'aria-modal'] });
  };
  if (document.body) run();
  else document.addEventListener('DOMContentLoaded', run, { once: true });
}
