import "./app.css";
import "./i18n";
import App from "./App.svelte";
import { waitLocale } from "svelte-i18n";

async function startApp() {
  await waitLocale();

  const app = new App({
    target: document.body,
  });
}

startApp();
