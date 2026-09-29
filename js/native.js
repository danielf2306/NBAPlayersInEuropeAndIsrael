// Android app (Capacitor) integration. On the website none of this runs.
let core = null;

export function isNative() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

async function capacitor() {
  // Only present in the Android build (copied in by tools/build-web.mjs).
  if (!core) core = await import('../vendor/capacitor-core.js');
  return core;
}

/** Save a file on the phone through the Android share sheet (Drive, WhatsApp, Files…). */
export async function shareFile(filename, text) {
  const { registerPlugin } = await capacitor();
  const Filesystem = registerPlugin('Filesystem');
  const Share = registerPlugin('Share');
  const { uri } = await Filesystem.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8' });
  try {
    await Share.share({ title: filename, files: [uri], dialogTitle: 'שמירה או שיתוף של הקובץ' });
  } catch (e) {
    if (!/cancel/i.test(e?.message || '')) throw e;
  }
}

/** Light status-bar icons on the navy top bar; navigation-bar icons follow the theme. */
export async function syncSystemBars() {
  if (!isNative()) return;
  const { SystemBars } = await capacitor();
  const theme = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  await SystemBars.setStyle({ style: 'DARK', bar: 'StatusBar' }).catch(() => {});
  await SystemBars.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT', bar: 'NavigationBar' }).catch(() => {});
}
