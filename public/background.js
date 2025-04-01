// Armazenamento de requisições por aba
let requestsByTab = new Map();
let currentTabId = null;

// Lista de tipos de recursos que queremos ignorar
const ignoredResourceTypes = [
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
];

// Função para verificar se é uma requisição de API
function isApiRequest(details) {
  // Ignora tipos de recursos que não são de API
  if (ignoredResourceTypes.includes(details.type)) {
    return false;
  }

  // Verifica se é uma requisição XHR ou Fetch
  if (details.type === "xmlhttprequest" || details.type === "fetch") {
    return true;
  }

  // Para outros tipos, verifica se parece ser uma API pela URL ou headers
  const url = details.url.toLowerCase();
  return (
    url.includes("/api/") ||
    url.includes("/v1/") ||
    url.includes("/v2/") ||
    url.includes("/rest/") ||
    url.includes("/graphql")
  );
}

// Função para formatar a data
function formatDate(date) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

// Função para carregar requisições do storage
async function loadRequestsFromStorage() {
  const data = await chrome.storage.local.get(['requestsByTab', 'currentTabId']);
  if (data.requestsByTab) {
    requestsByTab = new Map(JSON.parse(data.requestsByTab));
  }
  if (data.currentTabId) {
    currentTabId = data.currentTabId;
  }
}

// Função para salvar requisições no storage
async function saveRequestsToStorage() {
  await chrome.storage.local.set({
    requestsByTab: JSON.stringify([...requestsByTab]),
    currentTabId: currentTabId
  });
}

// Carrega as requisições ao iniciar
loadRequestsFromStorage();

// Monitora mudanças de aba
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  currentTabId = activeInfo.tabId;
  // Limpa o array de requisições da aba anterior
  requestsByTab.clear();
  // Inicializa o array vazio para a nova aba
  requestsByTab.set(currentTabId, []);
  // Notifica o popup com array vazio
  notifyPopup([]);
  // Reseta o badge
  updateBadge(0);
  // Salva o estado
  await saveRequestsToStorage();
});

// Monitora o fechamento de abas
chrome.tabs.onRemoved.addListener(async (tabId) => {
  requestsByTab.delete(tabId);
  await saveRequestsToStorage();
});

// Listener para capturar requisições
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    // Ignora requisições que não são de uma aba ou não são APIs
    if (details.tabId === -1 || !isApiRequest(details)) return;

    // Inicializa o array de requisições para a aba se necessário
    if (!requestsByTab.has(details.tabId)) {
      requestsByTab.set(details.tabId, []);
    }

    const request = {
      id: details.requestId,
      method: "GET", // O método real será capturado no onBeforeSendHeaders
      url: details.url,
      timestamp: formatDate(new Date()),
      type: details.type,
      status: "pending",
    };

    const tabRequests = requestsByTab.get(details.tabId);
    tabRequests.unshift(request);

    // Limita a 100 requisições por aba
    if (tabRequests.length > 100) {
      tabRequests.pop();
    }

    // Atualiza o badge apenas se for a aba atual
    if (details.tabId === currentTabId) {
      updateBadge(tabRequests.length);
      notifyPopup(tabRequests);
    }

    // Salva o estado
    await saveRequestsToStorage();
  },
  { urls: ["<all_urls>"] }
);

// Captura o método HTTP real
chrome.webRequest.onBeforeSendHeaders.addListener(
  async (details) => {
    if (details.tabId === -1) return;
    const tabRequests = requestsByTab.get(details.tabId);
    if (!tabRequests) return;

    const request = tabRequests.find((r) => r.id === details.requestId);
    if (request) {
      request.method = details.method;
      if (details.tabId === currentTabId) {
        notifyPopup(tabRequests);
      }
      await saveRequestsToStorage();
    }
  },
  { urls: ["<all_urls>"] },
  ["requestHeaders"]
);

// Captura o status da resposta
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.tabId === -1) return;
    const tabRequests = requestsByTab.get(details.tabId);
    if (!tabRequests) return;

    const request = tabRequests.find((r) => r.id === details.requestId);
    if (request) {
      request.status = details.statusCode;
      request.statusText = `${details.statusCode}`;
      if (details.tabId === currentTabId) {
        notifyPopup(tabRequests);
      }
      await saveRequestsToStorage();
    }
  },
  { urls: ["<all_urls>"] }
);

// Captura erros nas requisições
chrome.webRequest.onErrorOccurred.addListener(
  async (details) => {
    if (details.tabId === -1) return;
    const tabRequests = requestsByTab.get(details.tabId);
    if (!tabRequests) return;

    const request = tabRequests.find((r) => r.id === details.requestId);
    if (request) {
      request.status = "error";
      request.statusText = details.error;
      if (details.tabId === currentTabId) {
        notifyPopup(tabRequests);
      }
      await saveRequestsToStorage();
    }
  },
  { urls: ["<all_urls>"] }
);

// Função para notificar o popup sobre mudanças nas requisições
async function notifyPopup(requests) {
  try {
    await chrome.runtime.sendMessage({
      type: 'REQUEST_UPDATE',
      requests: requests
    }).catch(() => {
      // Ignora erros de comunicação quando o popup não está aberto
    });
  } catch (error) {
    // Ignora outros erros de comunicação
  }
}

// Atualiza o badge com o número de requisições
function updateBadge(count) {
  chrome.action.setBadgeText({
    text: count.toString()
  });
}

// Limpa as requisições antigas a cada minuto
setInterval(async () => {
  for (const [tabId, requests] of requestsByTab.entries()) {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const filteredRequests = requests.filter((request) => {
      return new Date(request.timestamp).getTime() > fiveMinutesAgo;
    });
    requestsByTab.set(tabId, filteredRequests);

    if (tabId === currentTabId) {
      updateBadge(filteredRequests.length);
      notifyPopup(filteredRequests);
    }
  }
  await saveRequestsToStorage();
}, 60000);

// Listener para mensagens do popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_REQUESTS") {
    // Retorna as requisições da aba atual
    const requests = currentTabId ? requestsByTab.get(currentTabId) || [] : [];
    sendResponse(requests);
  }
});
