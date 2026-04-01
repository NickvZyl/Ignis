import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

export async function initNative() {
  if (!isNative) return;

  // Status bar — dark theme to match Ignis
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setBackgroundColor({ color: '#1a0e08' });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {}

  // Splash screen — hide after app loads
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {}
}

export async function hapticTap() {
  if (!isNative) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {}
}

export async function hapticPulse() {
  if (!isNative) return;
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {}
}

export async function scheduleLocalNotification(title: string, body: string, delaySeconds: number) {
  if (!isNative) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: Date.now(),
          schedule: { at: new Date(Date.now() + delaySeconds * 1000) },
        },
      ],
    });
  } catch {}
}
