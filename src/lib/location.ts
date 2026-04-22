import * as Location from 'expo-location';

export interface LocationSample {
  latitude: number;
  longitude: number;
  city?: string;
}

/**
 * Fetch the user's current coordinates once. Returns null if permission
 * is denied or the fix fails — callers should treat location as optional.
 */
export async function getCurrentLocation(): Promise<LocationSample | null> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    let finalStatus = status;
    if (status !== 'granted') {
      const req = await Location.requestForegroundPermissionsAsync();
      finalStatus = req.status;
    }
    if (finalStatus !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = pos.coords;

    let city: string | undefined;
    try {
      const reverse = await Location.reverseGeocodeAsync({ latitude, longitude });
      const first = reverse[0];
      city = first?.city ?? first?.district ?? first?.subregion ?? undefined;
    } catch {
      // ignore — reverse geocoding is optional
    }

    return { latitude, longitude, city };
  } catch (err) {
    console.warn('[location] fetch failed', err);
    return null;
  }
}
