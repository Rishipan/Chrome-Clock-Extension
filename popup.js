const STORAGE_KEY = "stopwatchState";
const MODE_STORAGE_KEY = "stopwatchMode";
const display = document.getElementById("display");
const status = document.getElementById("status");
const modeSelector = document.getElementById("modeSelector");
const timerPanel = document.querySelector(".timer-panel");
const startPauseButton = document.getElementById("startPause");
const lapButton = document.getElementById("lap");
const resetButton = document.getElementById("reset");
const lapsList = document.getElementById("laps");
const lapCount = document.getElementById("lapCount");
const emptyState = document.getElementById("emptyState");
const timerCaption = document.getElementById("timerCaption");
const stopwatchControls = document.getElementById("stopwatchControls");
const lapsSection = document.getElementById("lapsSection");
const alarmPanel = document.getElementById("alarmPanel");
const alarmTime = document.getElementById("alarmTime");
const alarmToggle = document.getElementById("alarmToggle");
const alarmStatus = document.getElementById("alarmStatus");
const alarmMessage = document.getElementById("alarmMessage");
const extensionStorage = globalThis.chrome?.storage?.local;

let state = loadState();
let currentMode = loadMode();
let alarmEnabled = false;

function loadMode() {
  try {
    const savedMode = localStorage.getItem(MODE_STORAGE_KEY);
    return ["stopwatch", "alarm", "clock"].includes(savedMode) ? savedMode : "stopwatch";
  } catch (error) {
    console.error("Unable to read selected mode.", error);
    return "stopwatch";
  }
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (
      saved &&
      Number.isFinite(saved.elapsedMs) &&
      saved.elapsedMs >= 0 &&
      (saved.startedAt === null || Number.isFinite(saved.startedAt)) &&
      Array.isArray(saved.laps) &&
      saved.laps.every((lap) => Number.isFinite(lap))
    ) {
      return saved;
    }
  } catch (error) {
    console.error("Unable to read stopwatch state.", error);
  }

  return { elapsedMs: 0, startedAt: null, laps: [] };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Unable to save stopwatch state.", error);
  }
}

function getElapsedMs() {
  return state.elapsedMs + (state.startedAt === null ? 0 : Date.now() - state.startedAt);
}

function formatTime(milliseconds) {
  const hundredths = Math.floor(milliseconds / 10);
  const hours = Math.floor(hundredths / 360000);
  const minutes = Math.floor((hundredths % 360000) / 6000);
  const seconds = Math.floor((hundredths % 6000) / 100);
  const centiseconds = hundredths % 100;
  const minuteDisplay = hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}` : String(minutes).padStart(2, "0");

  return `${minuteDisplay}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function render() {
  const isRunning = state.startedAt !== null;
  const isClockMode = currentMode === "clock";
  const isAlarmMode = currentMode === "alarm";
  modeSelector.value = currentMode;
  display.textContent = isClockMode
    ? new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
      }).format(new Date())
    : formatTime(getElapsedMs());
  timerCaption.textContent = isClockMode ? "LOCAL TIME" : "MINUTES  |  SECONDS  |  HUNDREDTHS";
  status.textContent = isClockMode
    ? "CLOCK"
    : isAlarmMode
      ? alarmEnabled ? "ALARM ON" : "ALARM OFF"
      : isRunning ? "RUNNING" : state.elapsedMs > 0 ? "PAUSED" : "READY";
  status.classList.toggle("is-running", isRunning && currentMode === "stopwatch");
  timerPanel.hidden = isAlarmMode;
  alarmPanel.hidden = !isAlarmMode;
  stopwatchControls.hidden = currentMode !== "stopwatch";
  lapsSection.hidden = currentMode !== "stopwatch";
  startPauseButton.textContent = isRunning ? "Pause" : "Start";
  lapButton.disabled = !isRunning;
  lapCount.textContent = `${state.laps.length} ${state.laps.length === 1 ? "LAP" : "LAPS"}`;
  emptyState.hidden = state.laps.length > 0;
  lapsList.replaceChildren(
    ...state.laps.map((lap, index) => {
      const row = document.createElement("li");
      row.className = "lap-row";

      const number = document.createElement("span");
      number.className = "lap-number";
      number.textContent = `LAP ${String(state.laps.length - index).padStart(2, "0")}`;

      const time = document.createElement("span");
      time.textContent = formatTime(lap);

      row.append(number, time);
      return row;
    })
  );
}

function updateAlarmUI() {
  alarmToggle.checked = alarmEnabled;
  alarmStatus.textContent = alarmEnabled ? "ON" : "OFF";
  alarmStatus.classList.toggle("is-enabled", alarmEnabled);
}

startPauseButton.addEventListener("click", () => {
  if (state.startedAt === null) {
    state.startedAt = Date.now();
  } else {
    state.elapsedMs = getElapsedMs();
    state.startedAt = null;
  }
  saveState();
  render();
});

lapButton.addEventListener("click", () => {
  if (state.startedAt === null) return;
  state.laps.unshift(getElapsedMs());
  saveState();
  render();
});

resetButton.addEventListener("click", () => {
  state = { elapsedMs: 0, startedAt: null, laps: [] };
  saveState();
  render();
});

modeSelector.addEventListener("change", () => {
  currentMode = modeSelector.value;
  try {
    localStorage.setItem(MODE_STORAGE_KEY, currentMode);
  } catch (error) {
    console.error("Unable to save selected mode.", error);
  }
  render();
});

alarmToggle.addEventListener("change", async () => {
  alarmMessage.textContent = "";
  if (!globalThis.chrome?.runtime?.sendMessage) {
    alarmToggle.checked = alarmEnabled;
    alarmMessage.textContent = "Load this folder as a Chrome extension to use alarms.";
    return;
  }

  if (alarmToggle.checked) {
    if (!alarmTime.value) {
      alarmToggle.checked = false;
      alarmMessage.textContent = "Choose a time to enable the alarm.";
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ type: "SET_ALARM", time: alarmTime.value });
      if (!response?.success) throw new Error("The alarm could not be scheduled.");
      alarmEnabled = true;
      updateAlarmUI();
      alarmMessage.textContent = `Alarm set for ${alarmTime.value}.`;
    } catch (error) {
      alarmToggle.checked = false;
      alarmMessage.textContent = "Unable to set the alarm. Try again.";
      console.error("Unable to set alarm.", error);
    }
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: "CLEAR_ALARM" });
    if (!response?.success) throw new Error("The alarm could not be cleared.");
    alarmEnabled = false;
    updateAlarmUI();
    alarmMessage.textContent = "Alarm turned off.";
  } catch (error) {
    alarmToggle.checked = true;
    alarmMessage.textContent = "Unable to turn off the alarm. Try again.";
    console.error("Unable to clear alarm.", error);
  }
});

alarmTime.addEventListener("change", async () => {
  alarmMessage.textContent = "";
  if (!alarmEnabled) return;
  if (!globalThis.chrome?.runtime?.sendMessage) {
    alarmMessage.textContent = "Load this folder as a Chrome extension to use alarms.";
    return;
  }

  if (!alarmTime.value) {
    alarmToggle.checked = false;
    alarmToggle.dispatchEvent(new Event("change"));
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: "SET_ALARM", time: alarmTime.value });
    if (!response?.success) throw new Error("The alarm could not be updated.");
    alarmMessage.textContent = `Alarm set for ${alarmTime.value}.`;
  } catch (error) {
    alarmMessage.textContent = "Unable to update the alarm. Try again.";
    console.error("Unable to update alarm.", error);
  }
});

render();
window.setInterval(render, 50);

if (extensionStorage) {
  extensionStorage.get("alarm").then(({ alarm }) => {
    if (!alarm) return;
    alarmTime.value = alarm.time || "";
    alarmEnabled = alarm.enabled === true;
    updateAlarmUI();
    render();
  }).catch((error) => {
    console.error("Unable to load alarm settings.", error);
    alarmMessage.textContent = "Unable to load alarm settings.";
  });

  globalThis.chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes.alarm) return;
    const alarm = changes.alarm.newValue;
    alarmEnabled = alarm?.enabled === true;
    updateAlarmUI();
    if (alarm && alarm.enabled === false && alarm.triggered) {
      alarmMessage.textContent = "Alarm triggered.";
    }
    render();
  });
}
