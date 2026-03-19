import { NextRequest } from 'next/server';

// Open-Meteo — free, no API key, supports geocoding
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

export async function GET(req: NextRequest) {
  const location = req.nextUrl.searchParams.get('location') || 'Hermanus, South Africa';

  try {
    // 1. Geocode location to lat/lon + timezone
    const geoRes = await fetch(`${GEOCODE_URL}?name=${encodeURIComponent(location)}&count=1&language=en`);
    const geoData = await geoRes.json();

    if (!geoData.results?.length) {
      return Response.json({ error: 'Location not found', fallback: true });
    }

    const { latitude, longitude, timezone } = geoData.results[0];

    // 2. Get current weather
    const weatherRes = await fetch(
      `${WEATHER_URL}?latitude=${latitude}&longitude=${longitude}&timezone=${encodeURIComponent(timezone)}&current=temperature_2m,weather_code,is_day,cloud_cover,wind_speed_10m&daily=sunrise,sunset&forecast_days=1`
    );
    const weather = await weatherRes.json();
    const current = weather.current;
    const daily = weather.daily;

    return Response.json({
      timezone,
      latitude,
      longitude,
      temperature: current.temperature_2m,
      weatherCode: current.weather_code,
      isDay: current.is_day === 1,
      cloudCover: current.cloud_cover,
      windSpeed: current.wind_speed_10m,
      sunrise: daily.sunrise?.[0],
      sunset: daily.sunset?.[0],
      localTime: current.time, // ISO format in the correct timezone, e.g. "2026-03-18T11:00"
    });
  } catch (err: any) {
    return Response.json({ error: err.message, fallback: true });
  }
}
