const ALARM_NAME = "stopwatch-alarm";

function getNextAlarmTime(time) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Alarm time must use HH:MM format.");
  }

  const [hours, minutes] = time.split(":").map(Number);
  const when = new Date();
  when.setHours(hours, minutes, 0, 0);
  if (when.getTime() <= Date.now()) {
    when.setDate(when.getDate() + 1);
  }
  return when.getTime();
}

function restoreAlarm() {
  chrome.storage.local.get("alarm").then(({ alarm: settings }) => {
    if (!settings?.enabled || !Number.isFinite(settings.when)) return;
    if (settings.when > Date.now()) {
      chrome.alarms.create(ALARM_NAME, { when: settings.when });
      return;
    }
    return chrome.notifications.create("stopwatch-alarm-notification", {
      type: "basic",
      iconUrl: "icon.svg",
      title: "RP DEV Alarm",
      message: `Your alarm for ${settings.time} was missed.`,
      priority: 2
    }).then(() => chrome.storage.local.set({
      alarm: { ...settings, enabled: false, triggered: true }
    }));
  }).catch((error) => {
    console.error("Unable to restore alarm.", error);
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SET_ALARM") {
    try {
      const when = getNextAlarmTime(message.time);
      chrome.alarms.create(ALARM_NAME, { when });
      chrome.storage.local.set({
        alarm: { enabled: true, time: message.time, when }
      }).then(() => sendResponse({ success: true })).catch((error) => {
        console.error("Unable to save alarm.", error);
        chrome.alarms.clear(ALARM_NAME);
        sendResponse({ success: false });
      });
    } catch (error) {
      console.error("Unable to schedule alarm.", error);
      sendResponse({ success: false });
    }
    return true;
  }

  if (message?.type === "CLEAR_ALARM") {
    chrome.alarms.clear(ALARM_NAME);
    chrome.storage.local.set({
      alarm: { enabled: false, time: "", when: null }
    }).then(() => sendResponse({ success: true })).catch((error) => {
      console.error("Unable to clear saved alarm.", error);
      sendResponse({ success: false });
    });
    return true;
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  chrome.storage.local.get("alarm").then(({ alarm: settings }) => {
    if (!settings?.enabled) return;
    return chrome.notifications.create("stopwatch-alarm-notification", {
      type: "basic",
      iconUrl: "icon.svg",
      title: "RP DEV Alarm",
      message: `It's ${settings.time}.`,
      priority: 2
    }).then(() => chrome.storage.local.set({
      alarm: { ...settings, enabled: false, triggered: true }
    }));
  }).catch((error) => {
    console.error("Unable to deliver alarm notification.", error);
  });
});

chrome.runtime.onStartup.addListener(restoreAlarm);
chrome.runtime.onInstalled.addListener(restoreAlarm);
