/* Miiuz Beyond Borders — supported languages (BCP 47 tags).
 * full: true  → interface and content are hand-translated and ship with the app.
 * otherwise   → Miiuz AI translates the English text the first time the language is chosen
 *               (or `npm run translate -- <code>` bundles it in advance; see README).
 * Key = the field name used in content objects ("zh" = Simplified Chinese).
 * Shared with api/translate.mjs, which only accepts languages listed here. */
(function (root) {
  const LANGS = {
    en: { tag: "en", short: "EN", native: "English", name: "English", locale: "en-GB", currency: "USD", full: true },
    zh: { tag: "zh-Hans", short: "简", native: "简体中文", name: "Simplified Chinese", locale: "zh-CN", currency: "CNY", full: true },
    ko: { tag: "ko", short: "한", native: "한국어", name: "Korean", locale: "ko-KR", currency: "KRW", full: true },
    ja: { tag: "ja", short: "日", native: "日本語", name: "Japanese", locale: "ja-JP", currency: "JPY", full: true },
    "zh-Hant": { tag: "zh-Hant", short: "繁", native: "繁體中文", name: "Traditional Chinese (Taiwan)", locale: "zh-TW", currency: "TWD" },
    yue: { tag: "yue-Hant", short: "粵", native: "粵語（香港）", name: "Cantonese, written in Traditional Chinese as used in Hong Kong", locale: "zh-HK", currency: "HKD" },
    ms: { tag: "ms", native: "Bahasa Melayu", name: "Malay", locale: "ms-MY", currency: "SGD" },
    id: { tag: "id", native: "Bahasa Indonesia", name: "Indonesian", locale: "id-ID", currency: "IDR" },
    th: { tag: "th", native: "ไทย", name: "Thai", locale: "th-TH", currency: "THB" },
    vi: { tag: "vi", native: "Tiếng Việt", name: "Vietnamese", locale: "vi-VN", currency: "VND" },
    fil: { tag: "fil", native: "Filipino", name: "Filipino (Tagalog)", locale: "fil-PH", currency: "PHP" },
    km: { tag: "km", native: "ខ្មែរ", name: "Khmer", locale: "km-KH", currency: "USD" },
    my: { tag: "my", native: "မြန်မာ", name: "Burmese", locale: "my-MM", currency: "USD" },
    lo: { tag: "lo", native: "ລາວ", name: "Lao", locale: "lo-LA", currency: "USD" },
    hi: { tag: "hi", native: "हिन्दी", name: "Hindi", locale: "hi-IN", currency: "INR" },
    bn: { tag: "bn", native: "বাংলা", name: "Bengali", locale: "bn-BD", currency: "USD" },
    ta: { tag: "ta", native: "தமிழ்", name: "Tamil", locale: "ta-IN", currency: "INR" },
    ur: { tag: "ur", native: "اردو", name: "Urdu", locale: "ur-PK", currency: "USD", rtl: true },
    ne: { tag: "ne", native: "नेपाली", name: "Nepali", locale: "ne-NP", currency: "USD" },
    si: { tag: "si", native: "සිංහල", name: "Sinhala", locale: "si-LK", currency: "USD" },
    ar: { tag: "ar", native: "العربية", name: "Arabic (Modern Standard)", locale: "ar", currency: "SAR", rtl: true },
    fa: { tag: "fa", native: "فارسی", name: "Persian", locale: "fa-IR", currency: "USD", rtl: true },
    he: { tag: "he", native: "עברית", name: "Hebrew", locale: "he-IL", currency: "USD", rtl: true },
    tr: { tag: "tr", native: "Türkçe", name: "Turkish", locale: "tr-TR", currency: "EUR" },
    ru: { tag: "ru", native: "Русский", name: "Russian", locale: "ru-RU", currency: "USD" },
    uk: { tag: "uk", native: "Українська", name: "Ukrainian", locale: "uk-UA", currency: "EUR" },
    pl: { tag: "pl", native: "Polski", name: "Polish", locale: "pl-PL", currency: "EUR" },
    de: { tag: "de", native: "Deutsch", name: "German", locale: "de-DE", currency: "EUR" },
    fr: { tag: "fr", native: "Français", name: "French", locale: "fr-FR", currency: "EUR" },
    es: { tag: "es", native: "Español", name: "Spanish", locale: "es-ES", currency: "EUR" },
    pt: { tag: "pt", native: "Português", name: "Portuguese", locale: "pt-PT", currency: "EUR" },
    it: { tag: "it", native: "Italiano", name: "Italian", locale: "it-IT", currency: "EUR" },
    nl: { tag: "nl", native: "Nederlands", name: "Dutch", locale: "nl-NL", currency: "EUR" },
    sv: { tag: "sv", native: "Svenska", name: "Swedish", locale: "sv-SE", currency: "EUR" },
    nb: { tag: "nb", native: "Norsk bokmål", name: "Norwegian Bokmål", locale: "nb-NO", currency: "EUR" },
    da: { tag: "da", native: "Dansk", name: "Danish", locale: "da-DK", currency: "EUR" },
    fi: { tag: "fi", native: "Suomi", name: "Finnish", locale: "fi-FI", currency: "EUR" },
    el: { tag: "el", native: "Ελληνικά", name: "Greek", locale: "el-GR", currency: "EUR" },
    cs: { tag: "cs", native: "Čeština", name: "Czech", locale: "cs-CZ", currency: "EUR" },
    hu: { tag: "hu", native: "Magyar", name: "Hungarian", locale: "hu-HU", currency: "EUR" },
    ro: { tag: "ro", native: "Română", name: "Romanian", locale: "ro-RO", currency: "EUR" },
    kk: { tag: "kk", native: "Қазақ тілі", name: "Kazakh", locale: "kk-KZ", currency: "USD" },
    uz: { tag: "uz", native: "Oʻzbekcha", name: "Uzbek (Latin script)", locale: "uz-UZ", currency: "USD" },
  };

  // Pick the best supported language for a list of BCP 47 tags (e.g. navigator.languages).
  // Only hand-translated languages are chosen automatically, so nobody waits for AI on first open.
  // `fallback` is returned when none of the tags is supported (core.js passes null to try the home country next).
  function negotiate(tags, fallback = "en") {
    for (const raw of tags || []) {
      const t = String(raw).toLowerCase();
      if (/^zh-(tw|hk|mo|hant)/.test(t)) continue; // Traditional Chinese is AI-translated; offer it, don't auto-pick it
      const base = t.split("-")[0];
      const key = base === "zh" ? "zh" : base;
      if (LANGS[key]?.full) return key;
    }
    return fallback;
  }

  const api = { LANGS, negotiate };
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.MBB = root.MBB || {}; root.MBB.LANGS = LANGS; root.MBB.negotiateLang = negotiate; }
})(typeof window !== "undefined" ? window : globalThis);
