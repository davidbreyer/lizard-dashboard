const byId = (id) => document.getElementById(id);
const countdownKey = 'timeuntil.events.v1';
const quizKey = 'quiz-your-lizard:v1';
const dashboardDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const eventDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const practiceDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const libraryCount = new Intl.NumberFormat();
const units = ['days', 'hours', 'minutes', 'seconds'];
const unitNodes = units.map(byId);
let selectedEvent;
let displayedDate;

function readCountdown() {
  let storageUnavailable = false;
  try {
    const state = JSON.parse(localStorage.getItem(countdownKey));
    const events = Array.isArray(state?.events) ? state.events.filter((event) =>
      typeof event?.id === 'string' && typeof event.name === 'string' && event.name.trim() &&
      typeof event.target === 'string' && Number.isFinite(Date.parse(event.target))) : [];
    const event = events.find(({ id }) => id === state?.selected) ?? events[0];
    selectedEvent = event && { ...event, timestamp: Date.parse(event.target) };
  } catch {
    selectedEvent = undefined;
    storageUnavailable = true;
  }

  byId('countdown-empty').hidden = Boolean(selectedEvent);
  byId('countdown-event').hidden = !selectedEvent;
  if (selectedEvent) {
    byId('event-name').textContent = selectedEvent.name;
    byId('event-date').textContent = eventDate.format(selectedEvent.timestamp);
    byId('event-date').dateTime = selectedEvent.target;
  } else {
    byId('countdown-message').textContent = storageUnavailable ? 'Saved countdowns unavailable' : 'No countdowns saved here yet';
    byId('countdown-help').textContent = storageUnavailable ? 'Open Time Until to check your saved events.' : 'Add or import a countdown in Time Until using this browser.';
  }
  tick();
}

function tick() {
  const now = new Date();
  const today = now.toDateString();
  if (today !== displayedDate) {
    displayedDate = today;
    const localDay = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    byId('today').dateTime = localDay.toISOString().slice(0, 10);
    byId('today').textContent = dashboardDate.format(now);
  }
  if (!selectedEvent) return;

  const delta = selectedEvent.timestamp - now.getTime();
  const elapsed = delta <= 0;
  const seconds = elapsed ? Math.floor(-delta / 1000) : Math.ceil(delta / 1000);
  const values = [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
  const mode = elapsed ? 'Time since' : 'Counting down';
  if (byId('countdown-mode').textContent !== mode) byId('countdown-mode').textContent = mode;
  unitNodes.forEach((node, index) => {
    const value = String(values[index]).padStart(2, '0');
    if (node.textContent !== value) node.textContent = value;
  });
}

function latestPractice(history) {
  let latest;
  for (const result of history) {
    if (typeof result?.quizName !== 'string' || !result.quizName.trim() || typeof result.date !== 'string' ||
      !['quiz', 'spelling'].includes(result.mode) || !Number.isFinite(result.total) || result.total <= 0 ||
      !Number.isFinite(result.first) || result.first < 0 || result.first > result.total) continue;
    const timestamp = Date.parse(result.date);
    if (Number.isFinite(timestamp) && (!latest || timestamp > latest.timestamp)) latest = { ...result, timestamp };
  }
  return latest;
}

function readQuizSummary() {
  let state;
  let message = 'No saved practice in this browser yet';
  try {
    const raw = localStorage.getItem(quizKey);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      if (saved?.version !== 1 || !Array.isArray(saved.quizzes)) throw new Error('Unsupported quiz data.');
      state = saved;
      message = 'No practice sessions yet';
    }
  } catch {
    message = 'Saved quiz data unavailable';
  }

  const result = Array.isArray(state?.history) ? latestPractice(state.history) : undefined;
  byId('quiz-session').textContent = result?.quizName || message;
  byId('quiz-session-detail').hidden = !result;
  byId('quiz-score-metric').hidden = !result;
  byId('quiz-metrics').hidden = !state;
  if (state) byId('quiz-count').textContent = libraryCount.format(state.quizzes.length);
  if (result) {
    const mode = result.mode === 'spelling' ? 'Spelling' : 'Pop quiz';
    byId('quiz-session-detail').textContent = `${mode} · ${practiceDate.format(result.timestamp)}`;
    byId('quiz-score').textContent = `${Math.round(result.first / result.total * 100)}%`;
  }
}

const defaultLocation = { latitude: 39.1031, longitude: -84.5120, label: 'Cincinnati, OH 45202' };
const timeWindows = [
  { start: 6, end: 12, midpoint: 9 },
  { start: 12, end: 18, midpoint: 15 },
  { start: 18, end: 24, midpoint: 20 },
  { start: 0, end: 6, midpoint: 3, overnight: true }
];
const daypartNodes = [...document.querySelectorAll('#dayparts li')].map((item) =>
  ({ temperature: item.querySelector('strong'), condition: item.querySelector('small') }));
const locationButton = byId('weather-location');
const retryButton = byId('weather-refresh');
let activeLocation = defaultLocation;
let weatherLoadedAt = 0;
let weatherBusy = false;

async function requestWeather(url) {
  const response = await fetch(url, { headers: { Accept: 'application/geo+json' }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Forecast service returned ${response.status}.`);
  return response.json();
}

async function nearestObservation(stationsUrl) {
  if (!stationsUrl) return null;
  const stations = await requestWeather(stationsUrl);
  const station = stations.features?.[0]?.id ?? stations.observationStations?.[0];
  if (!station) return null;
  return (await requestWeather(`${station}/observations/latest`)).properties;
}

function placeName(properties) {
  return [properties.relativeLocation?.properties?.city, properties.relativeLocation?.properties?.state]
    .filter(Boolean).join(', ') || 'Your location';
}

function renderWeather(properties, periods, label, observation, alerts) {
  const now = new Date();
  const localTime = new Intl.DateTimeFormat('en', {
    timeZone: properties.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
  });
  const parts = Object.fromEntries(localTime.formatToParts(now).map(({ type, value }) => [type, value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const nextDay = new Date(Date.parse(`${day}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const recentPeriods = periods.filter(({ endTime, temperature }) => Date.parse(endTime) > now && Number.isFinite(temperature));
  const firstHour = recentPeriods[0];
  const measured = observation?.temperature?.value;
  const measuredAt = Date.parse(observation?.timestamp);
  const freshObservation = Number.isFinite(measured) && measuredAt <= now && now - measuredAt < 3 * 3600000;
  const fahrenheit = observation?.temperature?.unitCode?.endsWith('degF') ? measured : measured * 9 / 5 + 32;

  byId('weather-place').textContent = label;
  byId('weather-temperature').textContent = freshObservation ? `${Math.round(fahrenheit)}°F` : `${firstHour.temperature}°${firstHour.temperatureUnit}`;
  byId('weather-condition').textContent = freshObservation ? observation.textDescription || 'Current conditions' : firstHour.shortForecast;
  byId('weather-source').textContent = freshObservation ? 'Latest observation' : 'Hourly forecast';
  byId('weather-reading').hidden = false;

  timeWindows.forEach((window, index) => {
    const forecastDay = window.overnight ? nextDay : day;
    const candidates = recentPeriods.filter(({ startTime }) => startTime.startsWith(forecastDay) &&
      Number(startTime.slice(11, 13)) >= window.start && Number(startTime.slice(11, 13)) < window.end);
    const nodes = daypartNodes[index];
    if (!candidates.length) {
      nodes.temperature.textContent = '—';
      nodes.condition.textContent = !window.overnight && Number(parts.hour) >= window.end ? 'Passed' : 'Unavailable';
      return;
    }
    const midpointDistance = ({ startTime }) => Math.abs(Number(startTime.slice(11, 13)) - window.midpoint);
    const representative = candidates.reduce((best, period) => midpointDistance(period) < midpointDistance(best) ? period : best);
    const average = Math.round(candidates.reduce((sum, period) => sum + period.temperature, 0) / candidates.length);
    nodes.temperature.textContent = `${average}°${representative.temperatureUnit}`;
    nodes.condition.textContent = representative.shortForecast;
  });

  const active = alerts?.features ?? [];
  const alertLabel = active[0]?.properties?.event || 'Active weather alert';
  byId('weather-alerts').textContent = active.length > 1 ? `${alertLabel} and ${active.length - 1} more` : alertLabel;
  byId('weather-alerts').hidden = active.length === 0;
}

function locateUser() {
  if (!navigator.geolocation) return Promise.reject(new Error('Location access is unavailable.'));
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    ({ coords }) => resolve(coords), () => reject(new Error('Could not use your location.')), { timeout: 8000 }
  ));
}

async function updateWeather(useLocation = false) {
  if (weatherBusy) return;
  weatherBusy = locationButton.disabled = retryButton.disabled = true;
  const status = byId('weather-status');
  retryButton.hidden = true;
  status.textContent = useLocation ? 'Finding your location…' : 'Loading forecast…';
  let location = activeLocation;
  let locating = useLocation;
  try {
    if (useLocation) location = await locateUser();
    locating = false;
    const point = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
    const { properties } = await requestWeather(`https://api.weather.gov/points/${point}`);
    if (!properties?.forecastHourly) throw new Error('Hourly forecast missing.');
    const [forecast, observation, alerts] = await Promise.all([
      requestWeather(properties.forecastHourly),
      nearestObservation(properties.observationStations).catch(() => null),
      requestWeather(`https://api.weather.gov/alerts/active?point=${point}`).catch(() => null)
    ]);
    const periods = forecast.properties?.periods ?? [];
    if (!periods.some(({ endTime, temperature }) => Date.parse(endTime) > Date.now() && Number.isFinite(temperature))) {
      throw new Error('Hourly forecast empty.');
    }
    renderWeather(properties, periods, location.label || placeName(properties), observation, alerts);
    activeLocation = location;
    weatherLoadedAt = Date.now();
    status.textContent = '';
  } catch {
    const error = locating ? 'Could not use your location.' : 'Could not load the forecast.';
    status.textContent = weatherLoadedAt ? `${error} Showing the last forecast.` : error;
    retryButton.hidden = locating && Boolean(weatherLoadedAt);
  } finally {
    weatherBusy = locationButton.disabled = retryButton.disabled = false;
  }
}

function refreshWeatherIfStale() {
  if (!document.hidden && weatherLoadedAt && Date.now() - weatherLoadedAt >= 15 * 60000) updateWeather();
}

window.addEventListener('storage', ({ key }) => {
  if (key === countdownKey || key === null) readCountdown();
  if (key === quizKey || key === null) readQuizSummary();
});
window.addEventListener('pageshow', () => {
  readCountdown();
  readQuizSummary();
  refreshWeatherIfStale();
});
document.addEventListener('visibilitychange', refreshWeatherIfStale);
locationButton.addEventListener('click', () => updateWeather(true));
retryButton.addEventListener('click', () => updateWeather());

readCountdown();
readQuizSummary();
updateWeather();
setInterval(tick, 1000);
setInterval(refreshWeatherIfStale, 15 * 60000);
