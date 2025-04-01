<script>
  import { onMount, onDestroy } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  let requests = [];
  let filter = "";
  let debouncedFilter = "";
  let expandedRows = [];
  let filteredRequests = [];
  let debounceTimeout;
  let currentTabId = null;
  let messageListener;

  // Função para salvar as requests no sessionStorage
  function saveRequests(updatedRequests) {
    try {
      sessionStorage.setItem(
        `requests_${currentTabId}`,
        JSON.stringify(updatedRequests)
      );
      console.log(
        "Requests saved for tab:",
        currentTabId,
        updatedRequests.length
      );
    } catch (error) {
      console.error("Error saving requests:", error);
    }
  }

  // Função para carregar as requests do sessionStorage
  function loadRequests() {
    try {
      const savedRequests = sessionStorage.getItem(`requests_${currentTabId}`);
      if (savedRequests) {
        requests = JSON.parse(savedRequests);
        console.log("Requests loaded for tab:", currentTabId, requests.length);
      } else {
        // Se não houver requests salvas, solicita ao background
        requestInitialRequests();
      }
    } catch (error) {
      console.error("Error loading requests:", error);
      // Em caso de erro, solicita ao background
      requestInitialRequests();
    }
  }

  // Função para solicitar requests iniciais
  function requestInitialRequests() {
    chrome.runtime.sendMessage({ type: "GET_REQUESTS" }, (response) => {
      if (response) {
        requests = response;
        saveRequests(requests);
        console.log(
          "Initial requests loaded from background:",
          requests.length
        );
      }
    });
  }

  // Função para limpar as requests quando mudar de aba
  function clearPreviousTabRequests(previousTabId) {
    if (previousTabId) {
      sessionStorage.removeItem(`requests_${previousTabId}`);
      console.log("Cleared requests for previous tab:", previousTabId);
    }
  }

  // Configura o listener de mensagens
  function setupMessageListener() {
    if (messageListener) {
      chrome.runtime.onMessage.removeListener(messageListener);
    }

    messageListener = (message, sender, sendResponse) => {
      if (
        message.type === "REQUEST_UPDATE" &&
        (!sender.tab || sender.tab.id === currentTabId)
      ) {
        console.log("Received request update:", message.requests.length);
        requests = message.requests;
        saveRequests(requests);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
  }

  // Função para atualizar a aba atual
  async function updateCurrentTab() {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab && tab.id !== currentTabId) {
        const previousTabId = currentTabId;
        currentTabId = tab.id;
        clearPreviousTabRequests(previousTabId);
        loadRequests();
        setupMessageListener();
      }
    } catch (error) {
      console.error("Error updating current tab:", error);
    }
  }

  // Função de debounce para o filtro
  function updateDebouncedFilter(value) {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      debouncedFilter = value;
    }, 500);
  }

  // Atualiza o debounced filter quando o filtro mudar
  $: {
    updateDebouncedFilter(filter);
  }

  // Atualiza os requests filtrados quando o debounced filter mudar
  $: {
    console.log("Filtering requests with:", debouncedFilter);
    filteredRequests = requests.filter((request) => {
      if (!debouncedFilter) return true;

      const searchTerm = debouncedFilter.toLowerCase().trim();

      // Valores para busca
      const method = request.method?.toLowerCase() || "";
      const url = request.url?.toLowerCase() || "";
      const timestamp = request.timestamp?.toLowerCase() || "";
      const status = String(request.status)?.toLowerCase() || "";
      const statusText = request.statusText?.toLowerCase() || "";

      // Verifica se o termo está em qualquer um dos campos
      return (
        method.includes(searchTerm) ||
        url.includes(searchTerm) ||
        timestamp.includes(searchTerm) ||
        status.includes(searchTerm) ||
        statusText.includes(searchTerm)
      );
    });
    console.log("Filtered requests:", filteredRequests.length);
  }

  function toggleRow(id) {
    const index = expandedRows.indexOf(id);
    if (index === -1) {
      expandedRows = [...expandedRows, id];
    } else {
      expandedRows = expandedRows.filter((rowId) => rowId !== id);
    }
  }

  function isExpanded(id) {
    return expandedRows.includes(id);
  }

  function getMethodClass(method) {
    switch (method.toUpperCase()) {
      case "GET":
        return "bg-blue-100 text-blue-800"; // Swagger blue
      case "POST":
        return "bg-green-100 text-green-800"; // Swagger green
      case "PUT":
        return "bg-amber-100 text-amber-800"; // Swagger orange
      case "DELETE":
        return "bg-red-100 text-red-800"; // Swagger red
      case "PATCH":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }

  function formatQueryParams(url) {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      const formattedParams = [];

      for (const [key, value] of params.entries()) {
        formattedParams.push({ key, value });
      }

      return {
        baseUrl: `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`,
        params: formattedParams,
        hasParams: formattedParams.length > 0,
      };
    } catch {
      return {
        baseUrl: url,
        params: [],
        hasParams: false,
      };
    }
  }

  // Função para remover query params da URL
  function removeQueryParams(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.origin + urlObj.pathname;
    } catch (e) {
      // Se não for uma URL válida, retorna a original
      return url;
    }
  }

  function getStatusClass(status) {
    if (status === "pending") return "bg-gray-100 text-gray-800";
    if (status === "error") return "bg-red-100 text-red-800";

    const statusCode = parseInt(status);
    if (statusCode >= 200 && statusCode < 300)
      return "bg-green-100 text-green-800";
    if (statusCode >= 300 && statusCode < 400)
      return "bg-blue-100 text-blue-800";
    if (statusCode >= 400) return "bg-red-100 text-red-800";

    return "bg-gray-100 text-gray-800";
  }

  function getStatusIcon(status) {
    if (status === "pending") {
      return `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
      </svg>`;
    }
    if (status === "error") {
      return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>`;
    }

    const statusCode = parseInt(status);
    if (statusCode >= 200 && statusCode < 300) {
      return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>`;
    }
    if (statusCode >= 300 && statusCode < 400) {
      return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7l4-4m0 0l4 4m-4-4v18" />
      </svg>`;
    }
    if (statusCode >= 400) {
      return `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>`;
    }

    return `<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
    </svg>`;
  }

  onMount(async () => {
    // Inicializa a aba atual e configura os listeners
    await updateCurrentTab();

    // Listener para mudança de aba
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      await updateCurrentTab();
    });

    // Listener para atualização de aba
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && tabId === currentTabId) {
        await updateCurrentTab();
      }
    });

    // Atualiza periodicamente para garantir que as requests não se percam
    const intervalId = setInterval(async () => {
      await updateCurrentTab();
    }, 5000);

    return () => {
      clearInterval(intervalId);
      if (messageListener) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    };
  });

  onDestroy(() => {
    clearTimeout(debounceTimeout);
    if (messageListener) {
      chrome.runtime.onMessage.removeListener(messageListener);
    }
  });
</script>

<main class="w-[800px] h-[600px] bg-white">
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div class="flex-none w-[750px] px-4 py-3 border-b border-gray-200">
      <h1 class="text-lg font-medium text-gray-900">
        TraceFlow - HTTP Request Monitor
      </h1>
      <div class="mt-2">
        <input
          type="text"
          placeholder="Filter requests..."
          class="w-full px-3 py-2 text-sm border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
          bind:value={filter}
        />
      </div>
    </div>

    <!-- Timeline -->
    <div class="flex-1 w-[750px] overflow-y-auto pl-2 p-4">
      {#if requests.length === 0}
        <div class="text-center text-sm text-gray-500 mt-4">
          No requests captured yet. Browse some pages to see the requests.
        </div>
      {:else if filteredRequests.length === 0}
        <div class="text-center text-sm text-gray-500 mt-4">
          No requests found matching "{filter || debouncedFilter}".
        </div>
      {:else}
        <div class="relative">
          <div class="flex flex-col space-y-4">
            {#each filteredRequests as request, index (request.id)}
              <div
                class="relative pl-14"
                in:fly|local={{
                  y: -20,
                  duration: 800,
                  delay: index * 150,
                  easing: quintOut,
                }}
                out:fade|local={{ duration: 800 }}
              >
                <!-- Timeline dot -->
                <div
                  class="absolute left-[0.7rem] top-[50%] -translate-y-[50%] w-[2rem] h-[2rem] rounded-full border-2 flex items-center justify-center {getStatusClass(
                    request.status || 'pending'
                  )
                    .replace('bg-', 'border-')
                    .replace('text-', 'border-')} bg-white z-10"
                >
                  {@html getStatusIcon(request.status || 'pending')}
                </div>

                <!-- Timeline vertical line -->
                <div
                  class="absolute left-[1.6rem] top-0 -bottom-4 w-px bg-gray-200 last:hidden"
                />

                <!-- Request card -->
                <div
                  class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all duration-200 ease-in-out transform hover:-translate-y-0.5 cursor-pointer"
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                      <span
                        class="font-mono text-sm {request.method === 'GET'
                          ? 'text-blue-600'
                          : request.method === 'POST'
                            ? 'text-green-600'
                            : request.method === 'DELETE'
                              ? 'text-red-600'
                              : 'text-gray-600'}">{request.method}</span
                      >
                      <span class="text-sm text-gray-600"
                        >{request.timestamp}</span
                      >
                    </div>
                    {#if request.status && request.status !== 'undefined'}
                      <span
                        class="px-2 py-1 rounded text-xs font-medium {getStatusClass(
                          request.status
                        )}">{request.status}</span
                      >
                    {/if}
                  </div>
                  <div class="mt-2">
                    <p class="text-sm text-gray-800 break-all">
                      {removeQueryParams(request.url)}
                    </p>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</main>
