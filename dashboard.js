import { CARD_IDS, normalizeCardOrder } from './backup.mjs?v=development';
import { initBackup } from './backup-ui.mjs?v=development';
import { buildUpcoming } from './upcoming.mjs?v=development';
import { RECENT_TOOLS_KEY, refreshRecentTools } from './recent-tools.mjs?v=development';

const byId = (id) => document.getElementById(id);
const countdownKey = 'timeuntil.events.v1';
const quizKey = 'quiz-your-lizard:v1';
const todoKey = 'todo-lizard:v1';
const hiddenCardsKey = 'lizard-dashboard.hidden-cards.v1';
const cardOrderKey = 'lizard-dashboard.card-order.v1';
let cardOrder = [...CARD_IDS];
const cardSettings = byId('card-settings');
const cardChoices = [...cardSettings.querySelectorAll('input[type="checkbox"]')];
const weatherCard = byId('weather-card');
const dashboardDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const eventDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const practiceDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const taskDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
const taskMonth = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' });
const upcomingDate = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const upcomingWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' });
const upcomingTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const numberFormat = new Intl.NumberFormat();
const taskPriority = ['high', 'normal', 'low'];
// To Do Lizard reads the first 5,000 entries in its saved list.
const maxTodoTasks = 5000;
const todoAddToggle = byId('todo-add-toggle');
const todoAddForm = byId('todo-add-form');
const todoAddTitle = byId('todo-add-title');
const todoAddError = byId('todo-add-error');
const units = ['days', 'hours', 'minutes', 'seconds'];
const unitNodes = units.map(byId);
const countdownSelect = byId('countdown-select');
const countdownThemes = {
  ember: ['#ff915d', '255,145,93'],
  violet: ['#b5a3ff', '181,163,255'],
  tidal: ['#79d8d0', '121,216,208'],
  gold: ['#f4ce71', '244,206,113']
};
let selectedEvent;
let displayedDate;
let upcomingRefreshAt = 0;
let upcomingExpanded = false;
let upcomingSignature = '';

function savedCountdowns(state) {
  return Array.isArray(state?.events) ? state.events.filter((event) =>
    typeof event?.id === 'string' && typeof event.name === 'string' && event.name.trim() &&
    typeof event.target === 'string' && Number.isFinite(Date.parse(event.target))) : [];
}

function readCountdown() {
  let storageUnavailable = false;
  let events = [];
  try {
    const state = JSON.parse(localStorage.getItem(countdownKey));
    events = savedCountdowns(state);
    const event = events.find(({ id }) => id === state?.selected) ?? events[0];
    selectedEvent = event && { ...event, timestamp: Date.parse(event.target) };
  } catch {
    selectedEvent = undefined;
    storageUnavailable = true;
  }

  countdownSelect.replaceChildren(...events.map((event) => new Option(event.name, event.id)));
  countdownSelect.value = selectedEvent?.id ?? '';
  countdownSelect.hidden = events.length < 2;
  byId('countdown-title-picker').classList.toggle('can-select', events.length > 1);
  byId('countdown-empty').hidden = Boolean(selectedEvent);
  byId('countdown-event').hidden = !selectedEvent;
  const theme = Object.hasOwn(countdownThemes, selectedEvent?.color) ? selectedEvent.color : 'ember';
  const [accent, rgb] = countdownThemes[theme];
  byId('countdown-card').style.setProperty('--countdown-accent', accent);
  byId('countdown-card').style.setProperty('--countdown-rgb', rgb);
  if (selectedEvent) {
    byId('event-name').textContent = selectedEvent.name;
    byId('event-date').textContent = eventDate.format(selectedEvent.timestamp);
    byId('event-date').dateTime = selectedEvent.target;
  } else {
    byId('countdown-message').textContent = storageUnavailable ? 'Saved countdowns unavailable' : 'No countdowns saved here yet';
    byId('countdown-help').textContent = storageUnavailable ? 'Open Time Until to check your saved events.' : 'Add or import a countdown in Time Until using this browser.';
  }
  tick();
  readUpcoming();
}

function selectCountdown() {
  const id = countdownSelect.value;
  const error = byId('countdown-error');
  error.textContent = '';
  try {
    const state = JSON.parse(localStorage.getItem(countdownKey));
    if (!savedCountdowns(state).some((event) => event.id === id)) {
      throw new Error('Countdown no longer available.');
    }
    localStorage.setItem(countdownKey, JSON.stringify({ ...state, selected: id }));
  } catch {
    error.textContent = 'Could not save the countdown selection. Try again.';
  }
  readCountdown();
}

function tick() {
  const now = new Date();
  const today = now.toDateString();
  if (today !== displayedDate) {
    displayedDate = today;
    byId('today').dateTime = localDateKey(now);
    byId('today').textContent = dashboardDate.format(now);
    readTodoSummary();
  }
  if (now.getTime() >= upcomingRefreshAt) readUpcoming();
  if (!selectedEvent) return;

  const delta = selectedEvent.timestamp - now.getTime();
  const elapsed = delta <= 0;
  const seconds = elapsed ? Math.floor(-delta / 1000) : Math.ceil(delta / 1000);
  const values = [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60];
  const mode = elapsed ? 'Time since' : 'Counting down';
  if (byId('countdown-mode').textContent !== mode) byId('countdown-mode').textContent = mode;
  unitNodes.forEach((node, index) => {
    const value = String(values[index]).padStart(2, '0');
    if (node.textContent !== value) {
      node.textContent = value;
      node.style.setProperty('--digits', value.length);
    }
  });
}

function localDateKey(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function validDueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

function renderTodoTask(task, today) {
  const row = byId('todo-task-template').content.firstElementChild.cloneNode(true);
  row.querySelector('.todo-task-name').textContent = task.title;
  const checkbox = row.querySelector('.todo-task-check');
  checkbox.setAttribute('aria-label', `Complete ${task.title}`);
  checkbox.addEventListener('change', () => completeTodoTask(task.source, checkbox));
  row.querySelector('.todo-task-priority').hidden = task.priority !== 'high';
  row.querySelector('.todo-task-details').hidden = !task.dueDate && task.priority !== 'high';
  if (task.dueDate) {
    const date = row.querySelector('.todo-task-due');
    const overdue = task.dueDate < today;
    const due = new Date(`${task.dueDate}T00:00:00Z`);
    const formatted = taskDate.format(due);
    date.dateTime = task.dueDate;
    date.textContent = task.dueDate === today ? 'Due today' : `${overdue ? 'Overdue' : 'Due'} · ${formatted}`;
    date.classList.toggle('is-overdue', overdue);
    date.hidden = false;
    const stamp = row.querySelector('.todo-task-stamp');
    stamp.dateTime = task.dueDate;
    stamp.querySelector('.todo-task-month').textContent = taskMonth.format(due);
    stamp.querySelector('.todo-task-day').textContent = due.getUTCDate();
    stamp.hidden = false;
    stamp.classList.toggle('is-overdue', overdue);
    row.classList.add('has-due-date');
  }
  return row;
}

function readTodoTasks() {
  const tasks = JSON.parse(localStorage.getItem(todoKey) ?? '[]');
  if (!Array.isArray(tasks)) throw new Error('Unsupported task data.');
  return tasks;
}

function completeTodoTask(source, checkbox) {
  const error = byId('todo-complete-error');
  error.textContent = '';
  try {
    const tasks = readTodoTasks();
    const task = tasks.find((task) => typeof source.id === 'string' && source.id
      ? task?.id === source.id
      : JSON.stringify(task) === JSON.stringify(source));
    if (!task) throw new Error('Task no longer available.');
    if (!task.completed) {
      task.completed = true;
      task.completedAt = new Date().toISOString();
      localStorage.setItem(todoKey, JSON.stringify(tasks));
    }
  } catch {
    checkbox.checked = false;
    error.textContent = 'Could not complete the task. Try again.';
    return;
  }
  const keepFocus = document.activeElement === checkbox;
  readTodoSummary();
  if (keepFocus) (byId('todo-list').querySelector('input') ?? todoAddToggle).focus();
}

function setTodoAddOpen(isOpen) {
  todoAddForm.hidden = !isOpen;
  todoAddToggle.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    todoAddTitle.focus();
  } else {
    todoAddForm.reset();
    todoAddError.textContent = '';
    todoAddToggle.focus();
  }
}

function addTodoTask(event) {
  event.preventDefault();
  const title = todoAddTitle.value.trim();
  if (!title) {
    todoAddError.textContent = 'Enter a task name.';
    todoAddTitle.focus();
    return;
  }

  try {
    const tasks = readTodoTasks();
    if (tasks.length >= maxTodoTasks) {
      todoAddError.textContent = 'Your task list is full.';
      return;
    }
    tasks.unshift({
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      dueDate: '',
      priority: 'normal',
      completed: false,
      createdAt: new Date().toISOString(),
      completedAt: null
    });
    localStorage.setItem(todoKey, JSON.stringify(tasks));
  } catch {
    todoAddError.textContent = 'Could not save the task in this browser.';
    return;
  }

  readTodoSummary();
  setTodoAddOpen(false);
}

function readTodoSummary() {
  readUpcoming();
  const today = byId('today').dateTime;
  const status = byId('todo-status');
  const list = byId('todo-list');
  let tasks;
  try {
    tasks = readTodoTasks().filter((task) => typeof task?.title === 'string' && task.title.trim());
  } catch {
    status.textContent = 'Saved tasks unavailable';
    list.replaceChildren();
    list.hidden = true;
    return;
  }

  const open = tasks.filter((task) => !task.completed).map((task) => ({
    source: task,
    title: task.title.trim(),
    dueDate: validDueDate(task.dueDate),
    priority: taskPriority.includes(task.priority) ? task.priority : 'normal',
    createdAt: typeof task.createdAt === 'string' ? Date.parse(task.createdAt) || 0 : 0
  }));
  open.sort((a, b) => Number(!a.dueDate) - Number(!b.dueDate) || a.dueDate.localeCompare(b.dueDate) ||
    taskPriority.indexOf(a.priority) - taskPriority.indexOf(b.priority) || b.createdAt - a.createdAt);

  let summary = tasks.length ? 'No open tasks' : 'No tasks saved in this browser yet';
  if (open.length) {
    const overdue = open.filter((task) => task.dueDate && task.dueDate < today).length;
    summary = `${numberFormat.format(open.length)} open ${open.length === 1 ? 'task' : 'tasks'}`;
    if (overdue) summary += ` · ${numberFormat.format(overdue)} overdue`;
  }
  if (status.textContent !== summary) status.textContent = summary;
  list.replaceChildren(...open.slice(0, 3).map((task) => renderTodoTask(task, today)));
  list.hidden = open.length === 0;
}

function readUpcoming() {
  let tasks = [], events = [];
  const errors = [];
  try { tasks = readTodoTasks(); }
  catch { errors.push('Saved tasks unavailable.'); }
  try {
    const state = JSON.parse(localStorage.getItem(countdownKey));
    if (state !== null && !Array.isArray(state?.events)) throw new Error('Invalid saved countdowns.');
    events = savedCountdowns(state);
  } catch { errors.push('Saved countdowns unavailable.'); }
  const now = new Date();
  const schedule = buildUpcoming({ tasks, events }, now);
  const { items, startKey } = schedule;
  upcomingRefreshAt = schedule.refreshAt;
  const tasksCount = items.filter(item => item.kind === 'task').length;
  const eventsCount = items.length - tasksCount;
  const summary = items.length
    ? numberFormat.format(tasksCount) + (tasksCount === 1 ? ' task' : ' tasks') + ' · ' +
      numberFormat.format(eventsCount) + (eventsCount === 1 ? ' countdown' : ' countdowns')
    : errors.length ? 'No upcoming items could be shown.' : 'Nothing scheduled in the next 7 days.';
  const status = byId('upcoming-status');
  if (status.textContent !== summary) status.textContent = summary;
  const error = byId('upcoming-error');
  error.textContent = errors.join(' ');
  error.hidden = errors.length === 0;
  byId('upcoming-help').hidden = items.length > 0 || errors.length > 0;
  const shown = upcomingExpanded ? items : items.slice(0, 6);
  const signature = JSON.stringify([startKey, shown]);
  const list = byId('upcoming-list');
  if (signature !== upcomingSignature) {
    upcomingSignature = signature;
    const groups = [];
    const tomorrow = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
    let dayKey, dayList;
    for (const item of shown) {
      if (item.dateKey !== dayKey) {
        dayKey = item.dateKey;
        const group = document.createElement('li');
        group.className = 'upcoming-group';
        const heading = document.createElement('h3');
        const time = document.createElement('time');
        time.dateTime = dayKey;
        const date = new Date(dayKey + 'T00:00:00Z');
        const relative = document.createElement('span');
        relative.className = 'upcoming-relative';
        relative.textContent = dayKey === startKey ? 'Today' : dayKey === tomorrow ? 'Tomorrow' : upcomingWeekday.format(date);
        const label = document.createElement('span');
        label.className = 'upcoming-group-date';
        label.textContent = dayKey.slice(0, 4) === startKey.slice(0, 4) ? upcomingDate.format(date) : taskDate.format(date);
        time.append(relative, label);
        heading.append(time);
        dayList = document.createElement('ul');
        dayList.className = 'upcoming-day-items';
        group.append(heading, dayList);
        groups.push(group);
      }
      const row = byId('upcoming-item-template').content.firstElementChild.cloneNode(true);
      row.querySelector('.upcoming-item-name').textContent = item.title;
      row.querySelector('a').href = item.kind === 'task'
        ? 'https://www.davidbreyer.com/todo-lizard/' : 'https://www.davidbreyer.com/timeuntil/';
      row.querySelector('.upcoming-item-kind').textContent = item.kind === 'task' ? 'Task' : 'Countdown';
      row.querySelector('.upcoming-item-priority').hidden = item.kind !== 'task' || item.priority !== 'high';
      if (item.kind === 'event') {
        const time = row.querySelector('.upcoming-item-time');
        time.hidden = false;
        time.dateTime = new Date(item.timestamp).toISOString();
        time.textContent = upcomingTime.format(item.timestamp);
      }
      dayList.append(row);
    }
    list.replaceChildren(...groups);
  }
  list.hidden = items.length === 0;
  const more = byId('upcoming-more');
  more.hidden = items.length <= 6;
  more.textContent = upcomingExpanded ? 'Show fewer' : 'Show all ' + numberFormat.format(items.length);
  more.setAttribute('aria-expanded', String(upcomingExpanded));
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
  if (state) byId('quiz-count').textContent = numberFormat.format(state.quizzes.length);
  if (result) {
    const mode = result.mode === 'spelling' ? 'Spelling' : 'Pop quiz';
    byId('quiz-session-detail').textContent = `${mode} · ${practiceDate.format(result.timestamp)}`;
    byId('quiz-score').textContent = `${Math.round(result.first / result.total * 100)}%`;
  }
}

const defaultLocation = { latitude: 39.1031, longitude: -84.5120, label: 'Cincinnati, OH 45202' };
// Shared with Weather Lizard on the same origin.
const weatherLocationKey = 'weather-lizard.location.v1';
const timeWindows = [
  { start: 6, end: 12, midpoint: 9 },
  { start: 12, end: 18, midpoint: 15 },
  { start: 18, end: 24, midpoint: 20 },
  { start: 0, end: 6, midpoint: 3, overnight: true }
];
const daypartNodes = [...document.querySelectorAll('#dayparts li')].map((item) =>
  ({ temperature: item.querySelector('strong'), condition: item.querySelector('small') }));
const locationButton = byId('weather-location');
const defaultButton = byId('weather-default');
const refreshButton = byId('weather-refresh');
let activeLocation = readWeatherLocation() ?? defaultLocation;
let weatherLoadedAt = 0;
let weatherBusy = false;
let weatherRequest = 0;

function approximateWeatherLocation(coords) {
  const { latitude, longitude } = coords ?? {};
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return { latitude: Number(latitude.toFixed(3)), longitude: Number(longitude.toFixed(3)) };
}

function readWeatherLocation() {
  try {
    return approximateWeatherLocation(JSON.parse(localStorage.getItem(weatherLocationKey)));
  } catch {
    return null;
  }
}

function saveWeatherLocation(location) {
  try {
    if (location) localStorage.setItem(weatherLocationKey, JSON.stringify(location));
    else localStorage.removeItem(weatherLocationKey);
    return true;
  } catch {
    return false;
  }
}

async function requestWeather(url) {
  const response = await fetch(url, { headers: { Accept: 'application/geo+json' }, cache: 'no-cache', signal: AbortSignal.timeout(10000) });
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

async function updateWeather(mode = 'refresh') {
  if (weatherBusy || weatherCard.hidden) return;
  const request = ++weatherRequest;
  weatherBusy = locationButton.disabled = defaultButton.disabled = refreshButton.disabled = true;
  const status = byId('weather-status');
  let locating = mode === 'locate';
  let preferenceSaved = true;
  if (mode === 'default') {
    activeLocation = defaultLocation;
    preferenceSaved = saveWeatherLocation(null);
  }
  let location = activeLocation;
  if (!weatherLoadedAt) byId('weather-place').textContent = location.label || 'Saved location';
  status.textContent = locating ? 'Finding your location…' : 'Loading forecast…';
  try {
    if (locating) {
      location = approximateWeatherLocation(await locateUser());
      if (request !== weatherRequest) return;
      if (!location) throw new Error('Invalid location.');
      status.textContent = 'Loading forecast…';
    }
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
    if (request !== weatherRequest) return;
    renderWeather(properties, periods, location.label || placeName(properties), observation, alerts);
    activeLocation = location;
    weatherLoadedAt = Date.now();
    if (mode === 'locate') preferenceSaved = saveWeatherLocation(location);
    status.textContent = preferenceSaved ? '' : 'Could not save the location change in this browser.';
  } catch {
    if (request !== weatherRequest) return;
    const error = locating ? 'Could not use your location.' : 'Could not load the forecast.';
    status.textContent = weatherLoadedAt ? `${error} Showing the last forecast.` : error;
  } finally {
    if (request === weatherRequest) {
      defaultButton.hidden = activeLocation === defaultLocation;
      weatherBusy = locationButton.disabled = defaultButton.disabled = refreshButton.disabled = false;
    }
  }
}

function refreshSavedWeather() {
  weatherRequest++;
  weatherBusy = locationButton.disabled = defaultButton.disabled = refreshButton.disabled = false;
  activeLocation = readWeatherLocation() ?? defaultLocation;
  weatherLoadedAt = 0;
  byId('weather-reading').hidden = true;
  byId('weather-alerts').hidden = true;
  byId('weather-place').textContent = activeLocation.label || 'Saved location';
  updateWeather();
}

function refreshWeatherIfStale() {
  if (!document.hidden && weatherLoadedAt && Date.now() - weatherLoadedAt >= 15 * 60000) updateWeather();
}

function applyCardVisibility() {
  const weatherWasHidden = weatherCard.hidden;
  const orderedChoices = cardOrder.map(id => cardChoices.find(choice => choice.value === id));
  const widgets = document.querySelector('.widgets');
  const choices = document.querySelector('.card-choices');
  if ([...widgets.children].map(card => card.id).join() !== cardOrder.join()) {
    widgets.append(...cardOrder.map(byId));
  }
  if ([...choices.children].map(row => row.dataset.card).join() !== cardOrder.join()) {
    choices.append(...cardOrder.map(id => choices.querySelector('[data-card="' + id + '"]')));
  }
  for (const [index, id] of cardOrder.entries()) {
    const row = choices.querySelector('[data-card="' + id + '"]');
    row.querySelector('[data-move="-1"]').disabled = index === 0;
    row.querySelector('[data-move="1"]').disabled = index === cardOrder.length - 1;
  }
  const visible = orderedChoices.filter((choice) => choice.checked);
  const wideCard = visible.length % 2 === 1 ? visible.at(-1) : null;
  for (const choice of cardChoices) {
    const card = byId(choice.value);
    card.hidden = !choice.checked;
    card.classList.toggle('widget-wide', choice === wideCard);
  }
  byId('cards-empty').hidden = visible.length > 0;
  if (weatherWasHidden && !weatherCard.hidden) updateWeather();
}

function readCardVisibility() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(hiddenCardsKey) ?? '[]');
  } catch {
    saved = [];
  }
  const hidden = Array.isArray(saved) ? saved : [];
  try { cardOrder = normalizeCardOrder(JSON.parse(localStorage.getItem(cardOrderKey))); }
  catch { cardOrder = [...CARD_IDS]; }
  for (const choice of cardChoices) choice.checked = !hidden.includes(choice.value);
  applyCardVisibility();
}

function moveCard(button) {
  const id = button.closest('.card-choice').dataset.card;
  const index = cardOrder.indexOf(id);
  const destination = index + Number(button.dataset.move);
  if (destination < 0 || destination >= cardOrder.length) return;
  [cardOrder[index], cardOrder[destination]] = [cardOrder[destination], cardOrder[index]];
  applyCardVisibility();
  const status = byId('card-settings-status');
  try {
    localStorage.setItem(cardOrderKey, JSON.stringify(cardOrder));
    status.textContent = byId(id).querySelector('h2').textContent + ' moved to position ' + (destination + 1) + ' of ' + cardOrder.length + '.';
    status.classList.remove('is-error');
  } catch {
    status.textContent = 'Order changed for this visit, but could not be saved in this browser.';
    status.classList.add('is-error');
  }
  const focus = button.disabled ? button.parentElement.querySelector('button:not(:disabled)') : button;
  focus?.focus();
}

window.addEventListener('storage', ({ key }) => {
  if (key === hiddenCardsKey || key === cardOrderKey || key === null) readCardVisibility();
  if (key === countdownKey || key === null) readCountdown();
  if (key === quizKey || key === null) readQuizSummary();
  if (key === todoKey || key === null) readTodoSummary();
  if (key === weatherLocationKey || key === null) refreshSavedWeather();
});
window.addEventListener('pageshow', () => {
  readCountdown();
  readQuizSummary();
  readTodoSummary();
  refreshWeatherIfStale();
});
document.addEventListener('visibilitychange', refreshWeatherIfStale);
countdownSelect.addEventListener('change', selectCountdown);
byId('cards-button').addEventListener('click', () => cardSettings.showModal());
cardSettings.addEventListener('click', event => {
  const button = event.target.closest('[data-move]');
  if (button) moveCard(button);
});
cardSettings.addEventListener('change', () => {
  applyCardVisibility();
  const status = byId('card-settings-status');
  try {
    const hidden = cardChoices.filter((choice) => !choice.checked).map((choice) => choice.value);
    localStorage.setItem(hiddenCardsKey, JSON.stringify(hidden));
    status.textContent = '';
    status.classList.remove('is-error');
  } catch {
    status.textContent = 'Could not save your card choices in this browser.';
    status.classList.add('is-error');
  }
});
todoAddToggle.addEventListener('click', () => setTodoAddOpen(todoAddForm.hidden));
byId('todo-add-cancel').addEventListener('click', () => setTodoAddOpen(false));
todoAddForm.addEventListener('submit', addTodoTask);
todoAddTitle.addEventListener('input', () => { todoAddError.textContent = ''; });
todoAddForm.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  setTodoAddOpen(false);
});
locationButton.addEventListener('click', () => updateWeather('locate'));
defaultButton.addEventListener('click', () => updateWeather('default'));
refreshButton.addEventListener('click', () => updateWeather());
byId('upcoming-more').addEventListener('click', () => {
  upcomingExpanded = !upcomingExpanded;
  readUpcoming();
});

initBackup({ onRestore(keys) {
  if (keys.includes(RECENT_TOOLS_KEY)) refreshRecentTools();
  if (keys.includes(hiddenCardsKey) || keys.includes(cardOrderKey)) readCardVisibility();
  if (keys.includes(countdownKey)) readCountdown();
  if (keys.includes(quizKey)) readQuizSummary();
  if (keys.includes(todoKey)) readTodoSummary();
  if (keys.includes(weatherLocationKey)) refreshSavedWeather();
} });

readCardVisibility();
readCountdown();
readQuizSummary();
updateWeather();
setInterval(tick, 1000);
setInterval(refreshWeatherIfStale, 15 * 60000);
