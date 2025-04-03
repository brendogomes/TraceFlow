import { addMessages, init, getLocaleFromNavigator } from 'svelte-i18n';

import en from './en.json';
import ptBR from './pt-BR.json';

addMessages('en', en);
addMessages('pt-BR', ptBR);

init({
  fallbackLocale: 'en',
  initialLocale: getLocaleFromNavigator(),
});
