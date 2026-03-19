import { create } from 'zustand';
import { supabase } from '@web/lib/supabase';

interface WeatherData {
  timezone: string;
  temperature: number;
  weatherCode: number;     // WMO weather code
  isDay: boolean;
  cloudCover: number;      // 0-100
  windSpeed: number;
  sunrise: string;
  sunset: string;
  localTime: string;
}

const ENV_CACHE_KEY = 'ignis_environment';

function loadCachedEnv(): { weather: WeatherData | null; location: string | null; lastFetch: number } {
  try {
    const raw = localStorage.getItem(ENV_CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { weather: null, location: null, lastFetch: 0 };
}

function saveCachedEnv(weather: WeatherData, location: string | null, lastFetch: number) {
  localStorage.setItem(ENV_CACHE_KEY, JSON.stringify({ weather, location, lastFetch }));
}

interface EnvironmentState {
  weather: WeatherData | null;
  location: string | null;
  loading: boolean;
  lastFetch: number;

  fetchEnvironment: (userId: string) => Promise<void>;
}

// WMO weather codes → simple categories
export function getWeatherCategory(code: number): 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog' {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code >= 45 && code <= 48) return 'fog';
  if (code >= 51 && code <= 67) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

const cached = loadCachedEnv();

export const useEnvironmentStore = create<EnvironmentState>((set, get) => ({
  weather: cached.weather,
  location: cached.location,
  loading: false,
  lastFetch: cached.lastFetch,

  fetchEnvironment: async (userId: string) => {
    // Don't refetch more than once every 25 minutes
    const now = Date.now();
    if (now - get().lastFetch < 25 * 60 * 1000 && get().weather) return;

    set({ loading: true });

    try {
      // Try to find location from memories
      const { data: memories } = await supabase
        .from('memories')
        .select('content')
        .eq('user_id', userId)
        .order('importance', { ascending: false });

      let location = 'Hermanus, South Africa'; // fallback

      if (memories) {
        for (const m of memories) {
          const content = m.content.toLowerCase();
          // Look for location-related memories
          if (content.includes('lives in') || content.includes('from') || content.includes('home') || content.includes('located')) {
            // Extract the location part
            const match = m.content.match(/(?:lives?\s+in|from|home\s+(?:is\s+)?in|located\s+in)\s+(.+?)(?:\s*[—–-]|$)/i);
            if (match) {
              location = match[1].trim();
              break;
            }
            // If the whole memory is a location fact, use it
            if (content.includes('hermanus') || content.includes('south africa')) {
              location = 'Hermanus, South Africa';
              break;
            }
          }
        }
      }

      set({ location });

      const res = await fetch(`/api/weather?location=${encodeURIComponent(location)}`);
      const data = await res.json();

      if (data.error) {
        console.warn('[Environment] weather fetch failed:', data.error);
        return;
      }

      set({ weather: data, lastFetch: now });
      saveCachedEnv(data, location, now);
      console.log(`[Environment] ${location}: ${data.temperature}°C, ${getWeatherCategory(data.weatherCode)}, isDay=${data.isDay}`);
    } catch (err) {
      console.warn('[Environment] failed:', err);
    } finally {
      set({ loading: false });
    }
  },
}));
