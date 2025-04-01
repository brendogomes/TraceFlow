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
      type: 'REQUEST_UPDATE',
      requests: currentRequests
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

// Listener para requests da web
chrome.webRequest.onBeforeRequest.addListener(
  async (details) => {
    if (details.tabId === -1) return;

    // Filtra apenas XHR e Fetch
    if (details.type !== 'xmlhttprequest' && details.type !== 'fetch') return;

    // Filtra recursos estáticos
    if (/\.(css|jpg|jpeg|png|gif|ico|svg|woff|woff2|ttf|eot)$/i.test(details.url)) return;

    const request = {
      id: details.requestId,
      url: removeQueryParams(details.url),
      method: details.method,
      timestamp: new Date().toLocaleTimeString(),
      status: 'pending',
      type: details.type
    };

    await addRequest(details.tabId, request);
  },
  { urls: ['<all_urls>'] }
);

// Listener para respostas
chrome.webRequest.onCompleted.addListener(
  async (details) => {
    if (details.tabId === -1 || details.tabId !== currentTabId) return;

    const index = currentRequests.findIndex(r => r.id === details.requestId);
    
    if (index !== -1) {
      currentRequests[index] = {
        ...currentRequests[index],
        status: details.statusCode,
        statusText: details.statusCode.toString()
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

    const index = currentRequests.findIndex(r => r.id === details.requestId);
    
    if (index !== -1) {
      currentRequests[index] = {
        ...currentRequests[index],
        status: 'error',
        statusText: details.error
      };
      
      await notifyRequestUpdate();
    }
  },
  { urls: ['<all_urls>'] }
);

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
