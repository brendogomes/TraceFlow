<script>
  import { t } from "svelte-i18n";
  import FlagIcons from "./FlagIcons.svelte";

  export let isDarkMode;
  export let statusFilter = "all";
  export let searchQuery = "";
  let isPopup = true;

  // Verifica se está em uma janela popup ou não
  chrome.windows.getCurrent((window) => {
    isPopup = window.type === "popup";
  });

  async function openInNewWindow() {
    try {
      // Primeiro procura por janelas existentes do TraceFlow
      const windows = await chrome.windows.getAll({ populate: true });
      const traceflowUrl = chrome.runtime.getURL("index.html");
      
      // Procura por uma janela do TraceFlow
      const traceflowWindow = windows.find(window => 
        window.type === "popup" && 
        window.tabs && 
        window.tabs.some(tab => tab.url === traceflowUrl)
      );

      if (traceflowWindow) {
        // Se encontrou uma janela, foca nela
        await chrome.windows.update(traceflowWindow.id, { 
          focused: true,
          drawAttention: true
        });
      } else {
        // Se não encontrou, cria uma nova
        await chrome.windows.create({
          url: traceflowUrl,
          type: "popup",
          width: 800,
          height: 600
        });
      }

      // Fecha a janela atual do popup
      window.close();
    } catch (error) {
      console.error("Erro ao abrir/focar janela:", error);
    }
  }
</script>

<div
  class="flex-none px-4 py-3 border-b {isDarkMode
    ? 'border-gray-700 bg-gray-800'
    : 'border-gray-100 bg-white'}"
>
  <div class="flex items-center justify-between">
    <div class="flex items-center">
      <img
        src="/assets/svg/trace-flow-logo.svg"
        alt="TraceFlow Logo"
        class="h-7 w-7"
      />
      <h1
        class="ml-2 text-lg font-semibold {isDarkMode
          ? 'text-white'
          : 'text-gray-900'}"
      >
        TraceFlow
      </h1>
    </div>
    <div class="flex items-center space-x-2">
      <FlagIcons />
      {#if !isPopup}
      <button
        class="p-2 border-none rounded-lg {isDarkMode
          ? 'hover:bg-gray-700'
          : 'hover:bg-gray-100'}"
        on:click={openInNewWindow}
        title={$t("header.openInNewWindow")}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="w-5 h-5 {isDarkMode ? 'text-gray-300' : 'text-gray-600'}"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
          />
        </svg>
      </button>
      {/if}
      <button
        class="p-2 border-none rounded-lg {isDarkMode
          ? 'hover:bg-gray-700'
          : 'hover:bg-gray-100'}"
        on:click={() => (isDarkMode = !isDarkMode)}
      >
        {#if isDarkMode}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="w-5 h-5 text-gray-300"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="w-5 h-5 text-gray-600"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
            />
          </svg>
        {/if}
      </button>
    </div>
  </div>

  <div class="mt-3">
    <div class="mb-3">
      <input
        type="text"
        placeholder={$t("filters.search")}
        class="w-full px-3 py-2 rounded-lg {isDarkMode
          ? 'bg-gray-700 text-white placeholder-gray-400 border-gray-600'
          : 'bg-gray-100 text-gray-900 placeholder-gray-500 border-gray-200'} border focus:outline-none focus:ring-2 focus:ring-blue-500"
        bind:value={searchQuery}
      />
    </div>
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
           relative flex items-center justify-center"
        >
          <div
            class="w-2 h-2 rounded-full bg-blue-500 opacity-0 peer-checked:opacity-100 transition-opacity duration-200"
          ></div>
        </div>
        <span
          class="ml-2 text-sm font-medium transition-colors duration-200
          {isDarkMode
            ? 'text-gray-300 group-hover:text-gray-200'
            : 'text-gray-700 group-hover:text-gray-900'}"
          >{$t("filters.all")}</span
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
            ? 'border-gray-600 peer-checked:border-blue-500'
            : 'border-gray-300 peer-checked:border-blue-600'} 
           relative flex items-center justify-center"
        >
          <div
            class="w-2 h-2 rounded-full bg-blue-500 opacity-0 peer-checked:opacity-100 transition-opacity duration-200"
          ></div>
        </div>
        <span
          class="ml-2 text-sm font-medium transition-colors duration-200
          {isDarkMode
            ? 'text-gray-300 group-hover:text-gray-200'
            : 'text-gray-700 group-hover:text-gray-900'}"
          >{$t("filters.success")}</span
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
            ? 'border-gray-600 peer-checked:border-blue-500'
            : 'border-gray-300 peer-checked:border-blue-600'} 
           relative flex items-center justify-center"
        >
          <div
            class="w-2 h-2 rounded-full bg-blue-500 opacity-0 peer-checked:opacity-100 transition-opacity duration-200"
          ></div>
        </div>
        <span
          class="ml-2 text-sm font-medium transition-colors duration-200
          {isDarkMode
            ? 'text-gray-300 group-hover:text-gray-200'
            : 'text-gray-700 group-hover:text-gray-900'}"
          >{$t("filters.error")}</span
        >
      </label>
    </div>
  </div>
</div>
