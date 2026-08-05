import { Capacitor } from '@capacitor/core';
import { NativeActionMenu } from '../plugins/NativeActionMenu';

const isNativeIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

export function isNativeActionMenuAvailable() {
  return isNativeIOS();
}

/**
 * Presents a real native UIAlertController action sheet (iPhone) / anchored
 * popover (iPad) and resolves with the selected action's id, or null if
 * cancelled/dismissed. Throws if native presentation isn't available — call
 * isNativeActionMenuAvailable() first, and keep the existing web menu as the
 * fallback branch; never assume this resolves on non-iOS.
 *
 * `actions`: [{ id, label, style? }] — style is "default" | "destructive".
 * A "cancel"-style entry is optional; if omitted, a plain "Cancel" row is
 * added automatically (matching every first-party iOS action sheet).
 * `sourceRect`: the tapped element's getBoundingClientRect() — required for
 * a real anchored arrow on iPad; omit only for menus with no clear anchor.
 */
export async function showNativeActionMenu({ title, message, actions, sourceRect } = {}) {
  if (!isNativeIOS()) throw new Error('native action menu only available on iOS');
  const { selectedId } = await NativeActionMenu.show({ title, message, actions, sourceRect });
  return selectedId ?? null;
}
