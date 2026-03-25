import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import th from './locales/th.json';
import hi from './locales/hi.json';
import ta from './locales/ta.json';
import ar from './locales/ar.json';
import fr from './locales/fr.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      th: { translation: th },
      hi: { translation: hi },
      ta: { translation: ta },
      ar: { translation: ar },
      fr: { translation: fr },
    },
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    initImmediate: false
  });

export default i18n;
