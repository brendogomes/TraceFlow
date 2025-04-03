import "./app.css";
import './i18n';
import App from "./App.svelte";

// Aguarda a inicialização do i18n antes de montar o app
import { waitLocale } from 'svelte-i18n';

async function startApp() {
  await waitLocale();
  
  const app = new App({
    target: document.body,
  });
}

startApp();
