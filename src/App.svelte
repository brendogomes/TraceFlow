<script>
  import { onMount, onDestroy } from "svelte";
  import { fade, fly, slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  let requests = [];
  let filter = "";
  let debouncedFilter = "";
  let expandedRows = [];
  let filteredRequests = [];
  let debounceTimeout;
  let currentTabId = null;
  let messageListener;
  let expandedRequestId = null; // Para controlar qual card está expandido
  let isDarkMode = false;
  let copiedStates = {};
  let searchQuery = "";
  let statusFilter = "all"; // novo estado para o filtro

  // Função para salvar as requests no sessionStorage
  function saveRequests(updatedRequests) {
    try {
      sessionStorage.setItem(
        `requests_${currentTabId}`,
        JSON.stringify(updatedRequests)
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
      }
    });
  }

  // Função para limpar as requests quando mudar de aba
  function clearPreviousTabRequests(previousTabId) {
    if (previousTabId) {
      sessionStorage.removeItem(`requests_${previousTabId}`);
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

  // Função para filtrar as requests
  $: filteredRequests = requests.filter((request) => {
    console.log(filteredRequests);
    // Primeiro aplica o filtro de status
    if (statusFilter === "error" && (!request.status || request.status < 400)) {
      return false;
    }
    if (
      statusFilter === "success" &&
      (!request.status || request.status < 200 || request.status >= 400)
    ) {
      return false;
    }

    // Depois aplica o filtro de texto se existir
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      return (
        request.url.toLowerCase().includes(query) ||
        request.method.toLowerCase().includes(query) ||
        String(request.status).includes(query)
      );
    }

    return true;
  });

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

  function getStatusIcon(status, isDark) {
    if (status === "pending") {
      return `<svg class="w-4 h-4 ${isDark ? "text-gray-400" : "text-gray-600"}" fill="currentColor" viewBox="0 0 24 24">
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

    return `<svg class="w-4 h-4 ${isDark ? "text-gray-400" : "text-gray-600"}" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
    </svg>`;
  }

  function toggleRequest(requestId) {
    expandedRequestId = expandedRequestId === requestId ? null : requestId;
  }

  // Função para copiar para o clipboard
  async function copyToClipboard(text, id) {
    try {
      await navigator.clipboard.writeText(text);
      copiedStates[id] = true;
      setTimeout(() => {
        copiedStates[id] = false;
      }, 3000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }

  // Detecta o tema do sistema
  function detectSystemTheme() {
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      isDarkMode = true;
    }
  }

  // Observer para mudanças no tema do sistema
  function watchSystemTheme() {
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", (event) => {
        isDarkMode = event.matches;
      });
  }

  // Função para formatar a URL sem os query params
  function formatUrl(url) {
    try {
      const urlObj = new URL(url);
      return `${urlObj.origin}${urlObj.pathname}`;
    } catch (e) {
      return url;
    }
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

    detectSystemTheme();
    watchSystemTheme();

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

<main class="w-[600px] h-[600px] {isDarkMode ? 'bg-gray-900' : 'bg-white'}">
  <div class="h-full flex flex-col">
    <!-- Header -->
    <div
      class="flex-none w-[600px] px-4 py-3 pb-0 border-b {isDarkMode
        ? 'border-gray-700 bg-gray-800'
        : 'border-gray-200 bg-white'}"
    >
      <h1
        class="text-lg font-medium {isDarkMode
          ? 'text-white'
          : 'text-gray-900'}"
      >
        TraceFlow - HTTP Request Monitor
      </h1>
      <div class="mt-2">
        <div class="mb-4">
          <input
            type="text"
            placeholder="Search requests..."
            bind:value={searchQuery}
            class="w-full px-3 py-2 border rounded-lg {isDarkMode
              ? 'bg-gray-700 border-gray-600 text-gray-200'
              : 'bg-white border-gray-300 text-gray-700'}"
          />
          <!-- Status Filter -->
          <div class="mt-3 flex items-center justify-center space-x-6">
            <label class="relative flex items-center group cursor-pointer">
              <input
                type="radio"
                class="peer sr-only"
                name="status"
                value="all"
                bind:group={statusFilter}
              />
              <div
                class="w-4 h-4 border-2 rounded-full transition-colors duration-200
                {isDarkMode
                  ? 'border-gray-600 peer-checked:border-blue-500'
                  : 'border-gray-300 peer-checked:border-blue-600'} 
                peer-checked:bg-current relative flex items-center justify-center"
              >
                <div
                  class="w-2 h-2 rounded-full bg-blue-500 opacity-0 peer-checked:opacity-100 transition-opacity duration-200"
                ></div>
              </div>
              <span
                class="ml-2 text-sm font-medium transition-colors duration-200
                {isDarkMode
                  ? 'text-gray-300 group-hover:text-gray-200'
                  : 'text-gray-700 group-hover:text-gray-900'}">All</span
              >
            </label>

            <label class="relative flex items-center group cursor-pointer">
              <input
                type="radio"
                class="peer sr-only"
                name="status"
                value="success"
                bind:group={statusFilter}
              />
              <div
                class="w-4 h-4 border-2 rounded-full transition-colors duration-200
                {isDarkMode
                  ? 'border-gray-600 peer-checked:border-green-500'
                  : 'border-gray-300 peer-checked:border-green-600'} 
                peer-checked:bg-current relative flex items-center justify-center"
              >
                <div
                  class="w-2 h-2 rounded-full bg-green-500 opacity-0 peer-checked:opacity-100 transition-opacity duration-200"
                ></div>
              </div>
              <span
                class="ml-2 text-sm font-medium transition-colors duration-200
                {isDarkMode
                  ? 'text-gray-300 group-hover:text-gray-200'
                  : 'text-gray-700 group-hover:text-gray-900'}">Success</span
              >
            </label>

            <label class="relative flex items-center group cursor-pointer">
              <input
                type="radio"
                class="peer sr-only"
                name="status"
                value="error"
                bind:group={statusFilter}
              />
              <div
                class="w-4 h-4 border-2 rounded-full transition-colors duration-200
                {isDarkMode
                  ? 'border-gray-600 peer-checked:border-red-500'
                  : 'border-gray-300 peer-checked:border-red-600'} 
                peer-checked:bg-current relative flex items-center justify-center"
              >
                <div
                  class="w-2 h-2 rounded-full bg-red-500 opacity-0 peer-checked:opacity-100 transition-opacity duration-200"
                ></div>
              </div>
              <span
                class="ml-2 text-sm font-medium transition-colors duration-200
                {isDarkMode
                  ? 'text-gray-300 group-hover:text-gray-200'
                  : 'text-gray-700 group-hover:text-gray-900'}">Error</span
              >
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- Timeline -->
    <div
      class="flex-1 w-[600px] overflow-y-auto pl-2 p-4 {isDarkMode
        ? 'bg-gray-900'
        : 'bg-white'}"
    >
      {#if requests.length === 0}
        <div
          class="text-center text-sm {isDarkMode
            ? 'text-gray-400'
            : 'text-gray-500'} mt-4"
        >
          No requests captured yet. Browse some pages to see the requests.
        </div>
      {:else if filteredRequests.length === 0}
        <div
          class="text-center text-sm {isDarkMode
            ? 'text-gray-400'
            : 'text-gray-500'} mt-4"
        >
          No requests match your search.
        </div>
      {:else}
        <div class="relative">
          <div class="flex flex-col space-y-4">
            {#each filteredRequests as request, index}
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
                    .replace(
                      'text-',
                      isDarkMode ? 'text-' : 'border-'
                    )} {isDarkMode ? 'bg-gray-800' : 'bg-white'} z-10"
                >
                  {@html getStatusIcon(request.status || "pending", isDarkMode)}
                </div>

                <!-- Timeline vertical line -->
                <div
                  class="absolute left-[1.6rem] top-0 -bottom-4 w-px {isDarkMode
                    ? 'bg-gray-700'
                    : 'bg-gray-200'} last:hidden"
                />

                <!-- Request card -->
                <div
                  class="{isDarkMode
                    ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                    : 'bg-white border-gray-200 hover:border-gray-300'} p-2 rounded-lg shadow-sm border hover:shadow-lg transition-all duration-200 ease-in-out transform hover:-translate-y-0.5 cursor-pointer"
                  on:click={() => toggleRequest(request.id)}
                  on:keydown={(e) =>
                    e.key === "Enter" && toggleRequest(request.id)}
                  tabindex="0"
                  role="button"
                  aria-expanded={expandedRequestId === request.id}
                >
                  <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                      <span
                        class="font-mono text-sm {request.method === 'GET'
                          ? 'text-blue-500'
                          : request.method === 'POST'
                            ? 'text-green-500'
                            : request.method === 'DELETE'
                              ? 'text-red-500'
                              : isDarkMode
                                ? 'text-gray-400'
                                : 'text-gray-600'}">{request.method}</span
                      >
                      <span
                        class="{isDarkMode
                          ? 'text-gray-400'
                          : 'text-gray-600'} text-sm">{request.timestamp}</span
                      >
                    </div>
                    {#if request.status && request.status !== "undefined"}
                      <span
                        class="px-1 rounded text-xs font-medium {getStatusClass(
                          request.status
                        )}">{request.status}</span
                      >
                    {/if}
                  </div>
                  <div class="mt-2">
                    <p
                      class="{isDarkMode
                        ? 'text-gray-300'
                        : 'text-gray-800'} text-sm truncate"
                    >
                      {formatUrl(request.url)}
                    </p>
                  </div>
                </div>
                <!-- Dropdown content -->
                {#if expandedRequestId === request.id}
                  <div
                    class="mt-4 pt-4 {isDarkMode
                      ? 'border-gray-700'
                      : 'border-gray-100'} border-t"
                    transition:slide={{ duration: 200 }}
                  >
                    <div class="space-y-3">
                      <!-- Request Details -->
                      <div>
                        <h4
                          class="{isDarkMode
                            ? 'text-gray-300'
                            : 'text-gray-700'} text-sm font-medium"
                        >
                          Request Details
                        </h4>
                        <div class="mt-1 space-y-2">
                          <div class="flex">
                            <span
                              class="font-medium {isDarkMode
                                ? 'text-gray-400'
                                : 'text-gray-600'}">URL:</span
                            >
                            <span
                              class="ml-2 break-all {isDarkMode
                                ? 'text-gray-400'
                                : 'text-gray-600'}"
                              >{formatUrl(request.url)}</span
                            >
                          </div>

                          <!-- Query Parameters Section -->
                          {#if formatQueryParams(request.url).hasParams}
                            <div class="mt-2">
                              <div class="flex justify-between items-center">
                                <span
                                  class="text-sm font-medium {isDarkMode
                                    ? 'text-gray-300'
                                    : 'text-gray-700'}"
                                >
                                  Query Parameters:
                                </span>
                                <button
                                  class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                  on:click|stopPropagation={() => {
                                    const params = formatQueryParams(
                                      request.url
                                    ).params;
                                    const text = params
                                      .map((p) => `${p.key}: ${p.value}`)
                                      .join("\n");
                                    copyToClipboard(
                                      text,
                                      `${request.id}-params`
                                    );
                                  }}
                                  title="Copy to clipboard"
                                >
                                  {#if copiedStates[`${request.id}-params`]}
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      class="h-4 w-4 text-green-500"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path
                                        fill-rule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clip-rule="evenodd"
                                      />
                                    </svg>
                                  {:else}
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      class="h-4 w-4 {isDarkMode
                                        ? 'text-gray-400'
                                        : 'text-gray-600'}"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path
                                        d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"
                                      />
                                      <path
                                        d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"
                                      />
                                    </svg>
                                  {/if}
                                </button>
                              </div>
                              <div
                                class="mt-1 rounded p-2 {isDarkMode
                                  ? 'bg-gray-700'
                                  : 'bg-gray-50'}"
                              >
                                <div
                                  class="text-xs {isDarkMode
                                    ? 'text-gray-300'
                                    : 'text-gray-700'}"
                                >
                                  {#each formatQueryParams(request.url).params as param}
                                    <div class="flex items-start py-1">
                                      <span class="font-medium"
                                        >{param.key}:</span
                                      >
                                      <span class="ml-2 break-all"
                                        >{param.value}</span
                                      >
                                    </div>
                                  {/each}
                                </div>
                              </div>
                            </div>
                          {/if}

                          <!-- Request Payload -->
                          {#if request.requestBody}
                            <div class="mt-2">
                              <div class="flex justify-between items-center">
                                <span
                                  class="text-sm font-medium {isDarkMode
                                    ? 'text-gray-300'
                                    : 'text-gray-700'}">Request Payload:</span
                                >
                                <button
                                  class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                  on:click|stopPropagation={() =>
                                    copyToClipboard(
                                      JSON.stringify(
                                        request.requestBody,
                                        null,
                                        2
                                      ),
                                      `${request.id}-request`
                                    )}
                                  title="Copy to clipboard"
                                >
                                  {#if copiedStates[`${request.id}-request`]}
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      class="h-4 w-4 text-green-500"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path
                                        fill-rule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clip-rule="evenodd"
                                      />
                                    </svg>
                                  {:else}
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      class="h-4 w-4 {isDarkMode
                                        ? 'text-gray-400'
                                        : 'text-gray-600'}"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path
                                        d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"
                                      />
                                      <path
                                        d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"
                                      />
                                    </svg>
                                  {/if}
                                </button>
                              </div>
                              <div
                                class="mt-1 rounded p-2 {isDarkMode
                                  ? 'bg-gray-700'
                                  : 'bg-gray-50'} max-h-[200px] overflow-y-auto"
                              >
                                <pre
                                  class="text-xs overflow-x-auto {isDarkMode
                                    ? 'text-gray-300'
                                    : 'text-gray-700'}">{JSON.stringify(
                                    request.requestBody,
                                    null,
                                    2
                                  )}</pre>
                              </div>
                            </div>
                          {/if}

                          {#if request.responseBody}
                            <div class="mt-2">
                              <div class="flex justify-between items-center">
                                <span
                                  class="text-sm font-medium {isDarkMode
                                    ? 'text-gray-300'
                                    : 'text-gray-700'}">Response Body:</span
                                >
                                <button
                                  class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                  on:click|stopPropagation={() =>
                                    copyToClipboard(
                                      JSON.stringify(
                                        request.responseBody,
                                        null,
                                        2
                                      ),
                                      `${request.id}-response`
                                    )}
                                  title="Copy to clipboard"
                                >
                                  {#if copiedStates[`${request.id}-response`]}
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      class="h-4 w-4 text-green-500"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path
                                        fill-rule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clip-rule="evenodd"
                                      />
                                    </svg>
                                  {:else}
                                    <svg
                                      xmlns="http://www.w3.org/2000/svg"
                                      class="h-4 w-4 {isDarkMode
                                        ? 'text-gray-400'
                                        : 'text-gray-600'}"
                                      viewBox="0 0 20 20"
                                      fill="currentColor"
                                    >
                                      <path
                                        d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"
                                      />
                                      <path
                                        d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"
                                      />
                                    </svg>
                                  {/if}
                                </button>
                              </div>
                              <div
                                class="mt-1 rounded p-2 {isDarkMode
                                  ? 'bg-gray-700'
                                  : 'bg-gray-50'} max-h-[200px] overflow-y-auto"
                              >
                                <pre
                                  class="text-xs overflow-x-auto {isDarkMode
                                    ? 'text-gray-300'
                                    : 'text-gray-700'}">{JSON.stringify(
                                    request.responseBody,
                                    null,
                                    2
                                  )}</pre>
                              </div>
                            </div>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</main>
