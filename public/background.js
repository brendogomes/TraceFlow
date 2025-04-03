// Tipos de recursos a serem ignorados
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

// Map para armazenar as requisições por aba
let requestsByTab = new Map();
let currentTabId = null;
let port = null;
let debuggerAttached = new Set();

// Constante para o limite máximo de requisições
const MAX_REQUESTS = 100;

// Função para verificar se é uma requisição de API
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

// Função para formatar a data
function formatDate(date) {
  return date.toLocaleTimeString();
}

// Função para notificar o popup sobre mudanças nas requisições
async function notifyRequestUpdate() {
  try {
    if (port) {
      port.postMessage({
        type: "REQUEST_UPDATE",
        requests: currentTabId ? requestsByTab.get(currentTabId) || [] : [],
      });
    }
  } catch (error) {
    console.debug("Erro ao notificar popup:", error);
  }
}

// Função para salvar as requisições no storage
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

// Função para carregar as requisições do storage
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

// Carrega as requisições ao iniciar
loadRequestsFromStorage();

// Função para anexar o debugger a uma aba
async function attachDebugger(tabId) {
  if (debuggerAttached.has(tabId)) return;

  try {
    await chrome.debugger.attach({ tabId }, "1.0");
    await chrome.debugger.sendCommand({ tabId }, "Network.enable");
    debuggerAttached.add(tabId);

    // Listener para eventos do debugger
    const debuggerListener = async (source, method, params) => {
      if (source.tabId !== tabId) return;

      const tabRequests = requestsByTab.get(tabId);
      if (!tabRequests) return;

      if (method === "Network.requestWillBeSent") {
        const request = tabRequests.find((r) => r.url === params.request.url);
        if (request) {
          request.requestBody = params.request.postData;
          if (request.requestBody) {
            try {
              request.requestBody = JSON.parse(request.requestBody);
            } catch (e) {
              // Se não for JSON, mantém como texto
            }
          }
          if (tabId === currentTabId) {
            await notifyRequestUpdate();
          }
          await saveRequestsToStorage();
        }
      }

      if (method === "Network.responseReceived") {
        const request = tabRequests.find((r) => r.url === params.response.url);
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
            // Ignora erros ao capturar o corpo da resposta
            // Isso acontece quando o usuário fecha a notificação sem clicar em cancelar
            if (!error.message.includes("Debugger is not attached")) {
              console.debug("Erro ao capturar resposta:", error);
            }
          }
        }
      }
    };

    // Adiciona o listener e guarda a referência
    chrome.debugger.onEvent.addListener(debuggerListener);

    // Listener para detecção de desanexação do debugger
    const detachListener = (debuggee) => {
      if (debuggee.tabId === tabId) {
        chrome.debugger.onEvent.removeListener(debuggerListener);
        chrome.debugger.onDetach.removeListener(detachListener);
        debuggerAttached.delete(tabId);
      }
    };

    chrome.debugger.onDetach.addListener(detachListener);
  } catch (error) {
    // Se o erro for de permissão negada, remove o debugger
    if (error.message.includes("Permission denied")) {
      debuggerAttached.delete(tabId);
    }
    console.debug("Erro ao anexar debugger:", error);
  }
}

// Função para desanexar o debugger de uma aba
async function detachDebugger(tabId) {
  if (!debuggerAttached.has(tabId)) return;

  try {
    await chrome.debugger.detach({ tabId });
    debuggerAttached.delete(tabId);
  } catch (error) {
    console.debug("Erro ao desanexar debugger:", error);
  }
}

// Listener para conexões do popup
chrome.runtime.onConnect.addListener((newPort) => {
  port = newPort;
  port.onDisconnect.addListener(() => {
    port = null;
  });

  // Anexa o debugger à aba atual quando o popup é aberto
  if (currentTabId) {
    attachDebugger(currentTabId);
  }

  // Envia as requisições atuais quando o popup conecta
  notifyRequestUpdate();
});

// Listener para capturar requisições
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

      const tabRequests = requestsByTab.get(details.tabId);

      // Adiciona a nova requisição no início
      tabRequests.unshift(request);

      // Remove a última requisição se exceder o limite
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

// Função para atualizar o contador no ícone da extensão
function updateBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#666666" });
}

// Listener para respostas
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

// Listener para erros nas requisições
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

// Função para limpar as requisições
async function clearRequests() {
  try {
    if (currentTabId) {
      requestsByTab.set(currentTabId, []);
      await attachDebugger(currentTabId);
      // Notifica o popup com array vazio
      await notifyRequestUpdate();
      // Reseta o badge
      updateBadge(0);
      // Salva o estado
      await saveRequestsToStorage();
    }
  } catch (error) {
    console.error("Erro ao limpar requisições:", error);
  }
}

// Monitora mudanças de aba
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    currentTabId = activeInfo.tabId;

    // Zera o contador ao mudar de aba
    updateBadge(0);

    // Atualiza as requisições no popup
    if (port) {
      const requests = requestsByTab.get(currentTabId) || [];
      port.postMessage({
        type: "REQUEST_UPDATE",
        requests: Array.from(requests),
      });
    }

    // Anexa o debugger à nova aba
    await attachDebugger(currentTabId);
  } catch (error) {
    console.error("Erro ao mudar de aba:", error);
  }
});

// Monitora o fechamento de abas
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    await detachDebugger(tabId);
    requestsByTab.delete(tabId);
    await saveRequestsToStorage();
  } catch (error) {
    console.error("Erro ao monitorar fechamento de aba:", error);
  }
});
