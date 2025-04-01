// Armazena as requests da aba atual
let currentTabId = null;
let currentRequests = [];

// Função para limpar as requests ao mudar de aba
function clearRequests() {
  currentRequests = [];
  notifyRequestUpdate();
}

// Função para notificar a interface sobre mudanças
async function notifyRequestUpdate() {
  try {
    await chrome.runtime.sendMessage({
      type: "REQUEST_UPDATE",
      requests: currentRequests,
    });
  } catch (error) {
    // Ignora erro se a popup não estiver aberta
  }
}

// Função para adicionar uma nova request
async function addRequest(tabId, request) {
  if (tabId !== currentTabId) return;

  currentRequests = [request, ...currentRequests];
  await notifyRequestUpdate();
}

// Função para remover query params da URL
function removeQueryParams(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.origin + urlObj.pathname;
  } catch (e) {
    return url;
  }
}

// Função para atualizar uma request existente
async function updateRequest(tabId, requestId, data) {
  if (tabId !== currentTabId) return;

  const index = currentRequests.findIndex((r) => r.id === requestId);

  if (index !== -1) {
    currentRequests[index] = { ...currentRequests[index], ...data };
    await notifyRequestUpdate();
  }
}

// Listener para requests da web
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.tabId === -1) return;

    // Filtra apenas XHR e Fetch
    if (details.type !== 'xmlhttprequest' && details.type !== 'fetch') return;

    // Filtra recursos estáticos
    if (/\.(css|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$/i.test(details.url)) return;

    let requestBody = null;

    // Tenta extrair o payload do body
    if (details.requestBody) {
      if (details.requestBody.raw) {
        try {
          const decoder = new TextDecoder();
          const raw = details.requestBody.raw[0].bytes;
          const text = decoder.decode(raw);
          requestBody = JSON.parse(text);
        } catch (e) {
          // Se não conseguir parsear como JSON, tenta como texto
          try {
            const decoder = new TextDecoder();
            const raw = details.requestBody.raw[0].bytes;
            requestBody = decoder.decode(raw);
          } catch (err) {
            console.error('Error parsing request body:', err);
          }
        }
      } else if (details.requestBody.formData) {
        requestBody = details.requestBody.formData;
      }
    }

    console.log('Request Body:', requestBody); // Debug log

    const request = {
      id: details.requestId,
      url: details.url,
      method: details.method,
      timestamp: new Date().toLocaleTimeString(),
      status: 'pending',
      type: details.type,
      requestBody: requestBody
    };

    await addRequest(details.tabId, request);
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
);

// Listener para respostas
chrome.webRequest.onHeadersReceived.addListener(
  async (details) => {
    if (details.tabId === -1) return;

    const responseBody = await getResponseData(details);

    const status = details.statusCode.toString();
    await updateRequest(details.tabId, details.requestId, {
      status,
      responseBody,
    });
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// Listener para respostas
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.tabId === -1 || details.tabId !== currentTabId) return;

    const index = currentRequests.findIndex((r) => r.id === details.requestId);

    if (index !== -1) {
      currentRequests[index] = {
        ...currentRequests[index],
        status: details.statusCode,
        statusText: details.statusCode.toString(),
      };

      await notifyRequestUpdate();
    }
  },
  { urls: ['<all_urls>'] }
);

// Listener para erros
chrome.webRequest.onErrorOccurred.addListener(
  async (details) => {
    if (details.tabId === -1 || details.tabId !== currentTabId) return;

    const index = currentRequests.findIndex((r) => r.id === details.requestId);

    if (index !== -1) {
      currentRequests[index] = {
        ...currentRequests[index],
        status: 'error',
        statusText: details.error,
      };

      await notifyRequestUpdate();
    }
  },
  { urls: ['<all_urls>'] }
);

// Função para capturar o corpo da resposta
async function getResponseData(details) {
  try {
    const response = await fetch(details.url);
    const contentType = response.headers.get('content-type');

    // Se for JSON, retorna o corpo parseado
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }

    // Se for texto, retorna como string
    if (contentType && contentType.includes('text')) {
      return await response.text();
    }

    // Para outros tipos, retorna null
    return null;
  } catch (error) {
    return {
      error: error.message,
    };
  }
}

// Listener para mensagens da interface
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_REQUESTS') {
    sendResponse(currentRequests);
  }
  return true;
});

// Listener para mudança de aba ativa
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  currentTabId = activeInfo.tabId;
  clearRequests();
});

// Listener para atualização de aba
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tabId === currentTabId) {
    clearRequests();
  }
});
