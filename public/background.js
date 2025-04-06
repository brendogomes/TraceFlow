const ignoredTypes = [
  "stylesheet",
  "image",
  "media",
  "font",
  "script",
  "texttrack",
  "object",
  "beacon",
  "csp_report",
  "imageset",
  "wss",
  "websocket",
];

const MAX_REQUESTS = 100;

let requestsByTab = new Map();
let activeRequests = new Map();
let currentTabId = null;
let port = null;
let debuggerAttached = new Set();

function isApiRequest(details) {
  if (ignoredTypes.includes(details.type)) {
    return false;
  }

  if (
    /\.(css|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$/i.test(details.url)
  ) {
    return false;
  }

  return true;
}

function formatDate(date) {
  return date.toLocaleTimeString();
}

async function notifyRequestUpdate() {
  try {
    const requests = currentTabId ? requestsByTab.get(currentTabId) || [] : [];

    if (port) {
      port.postMessage({
        type: "REQUEST_UPDATE",
        requests: requests,
      });
    }

    chrome.runtime
      .sendMessage({
        type: "REQUEST_UPDATE",
        requests: requests,
      })
      .catch(() => {});
  } catch (error) {
    console.debug("Erro ao notificar popup:", error);
  }
}

async function saveRequestsToStorage() {
  try {
    await chrome.storage.local.set({
      requestsByTab: JSON.stringify([...requestsByTab]),
      currentTabId: currentTabId,
    });
  } catch (error) {
    console.error("Erro ao salvar dados no storage:", error);
  }
}

async function loadRequestsFromStorage() {
  try {
    const data = await chrome.storage.local.get([
      "requestsByTab",
      "currentTabId",
    ]);
    if (data.requestsByTab) {
      requestsByTab = new Map(JSON.parse(data.requestsByTab));
    }
    if (data.currentTabId) {
      currentTabId = data.currentTabId;
    }
  } catch (error) {
    console.error("Erro ao carregar dados do storage:", error);
  }
}

loadRequestsFromStorage();

async function attachDebugger(tabId) {
  if (debuggerAttached.has(tabId)) return;

  try {
    await chrome.debugger.attach({ tabId }, "1.0");
    await chrome.debugger.sendCommand({ tabId }, "Network.enable");
    debuggerAttached.add(tabId);

    const debuggerListener = async (source, method, params) => {
      if (source.tabId !== tabId) return;

      const tabRequests = requestsByTab.get(tabId);
      if (!tabRequests) return;

      if (method === "Network.requestWillBeSent") {
        const request = tabRequests.find((r) => r.url === params.request.url);
        if (request) {
          activeRequests.set(params.requestId, request);

          request.requestBody = params.request.postData;
          if (request.requestBody) {
            try {
              request.requestBody = JSON.parse(request.requestBody);
            } catch (e) {}
          }
          if (tabId === currentTabId) {
            await notifyRequestUpdate();
          }
          await saveRequestsToStorage();
        }
      }

      if (method === "Network.responseReceived") {
        const request = activeRequests.get(params.requestId);
        if (request) {
          try {
            const response = await chrome.debugger.sendCommand(
              { tabId },
              "Network.getResponseBody",
              { requestId: params.requestId }
            );

            if (response.body) {
              try {
                request.responseBody = JSON.parse(response.body);
              } catch (e) {
                request.responseBody = response.body;
              }

              if (tabId === currentTabId) {
                await notifyRequestUpdate();
              }
              await saveRequestsToStorage();
            }
          } catch (error) {
            activeRequests.delete(params.requestId);
          }
        }
      }

      if (method === "Network.loadingFinished") {
        activeRequests.delete(params.requestId);
      }
    };

    chrome.debugger.onEvent.addListener(debuggerListener);

    const detachListener = (debuggee) => {
      if (debuggee.tabId === tabId) {
        chrome.debugger.onEvent.removeListener(debuggerListener);
        chrome.debugger.onDetach.removeListener(detachListener);
        debuggerAttached.delete(tabId);
        activeRequests.clear();
      }
    };

    chrome.debugger.onDetach.addListener(detachListener);
  } catch (error) {
    if (error.message.includes("Permission denied")) {
      debuggerAttached.delete(tabId);
    }
    console.debug("Erro ao anexar debugger:", error);
  }
}

async function detachDebugger(tabId) {
  if (!debuggerAttached.has(tabId)) return;

  try {
    await chrome.debugger.detach({ tabId });
    debuggerAttached.delete(tabId);
  } catch (error) {
    console.debug("Erro ao desanexar debugger:", error);
  }
}

chrome.runtime.onConnect.addListener((newPort) => {
  port = newPort;
  port.onDisconnect.addListener(() => {
    port = null;
  });

  if (currentTabId) {
    attachDebugger(currentTabId);
  }

  notifyRequestUpdate();
});

chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    try {
      if (details.tabId === -1 || !isApiRequest(details)) return;

      if (!requestsByTab.has(details.tabId)) {
        requestsByTab.set(details.tabId, []);
      }

      const request = {
        id: details.requestId,
        method: details.method,
        url: details.url,
        timestamp: formatDate(new Date()),
        type: details.type,
        status: "pending",
      };

      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (tab && tab.url) {
          request.pagePath = new URL(tab.url).pathname;
        }
      } catch (error) {
        console.debug("Erro ao obter path da página:", error);
        request.pagePath = "/";
      }

      const tabRequests = requestsByTab.get(details.tabId);

      tabRequests.unshift(request);

      if (tabRequests.length > MAX_REQUESTS) {
        tabRequests.pop();
      }

      if (details.tabId === currentTabId) {
        updateBadge(tabRequests.length);
        await notifyRequestUpdate();
      }
      await saveRequestsToStorage();
    } catch (error) {
      console.error("Erro ao capturar requisição:", error);
    }
  },
  { urls: ["<all_urls>"] }
);

function updateBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#666666" });
}

chrome.webRequest.onCompleted.addListener(
  async (details) => {
    try {
      if (details.tabId === -1) return;
      const tabRequests = requestsByTab.get(details.tabId);
      if (!tabRequests) return;

      const request = tabRequests.find((r) => r.id === details.requestId);
      if (request) {
        request.status = details.statusCode;
        request.statusText = `${details.statusCode}`;

        if (details.tabId === currentTabId) {
          await notifyRequestUpdate();
        }
        await saveRequestsToStorage();
      }
    } catch (error) {
      console.error("Erro ao capturar status da resposta:", error);
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.webRequest.onErrorOccurred.addListener(
  async (details) => {
    try {
      if (details.tabId === -1) return;
      const tabRequests = requestsByTab.get(details.tabId);
      if (!tabRequests) return;

      const request = tabRequests.find((r) => r.id === details.requestId);
      if (request) {
        request.status = "error";
        request.statusText = details.error;

        if (details.tabId === currentTabId) {
          await notifyRequestUpdate();
        }
        await saveRequestsToStorage();
      }
    } catch (error) {
      console.error("Erro ao capturar erro nas requisições:", error);
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    currentTabId = activeInfo.tabId;

    updateBadge(0);
    await chrome.storage.local.clear();
    requestsByTab.clear();
    requestsByTab.set(currentTabId, []);

    if (port) {
      port.postMessage({
        type: "REQUEST_UPDATE",
        requests: [],
      });
    }
    await attachDebugger(currentTabId);
  } catch (error) {
    console.error("Erro ao mudar de aba:", error);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    await detachDebugger(tabId);
    requestsByTab.delete(tabId);
    await saveRequestsToStorage();
  } catch (error) {
    console.error("Erro ao monitorar fechamento de aba:", error);
  }
});
