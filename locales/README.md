# Bundled translations

Files here (`<code>.json`) are pre-made translations for languages that Miiuz AI would
otherwise translate on each phone the first time the language is chosen. Make or refresh
them with:

```bash
ANTHROPIC_API_KEY=... npm run translate -- ms zh-Hant th id   # codes from js/locales.js
```

Each entry is `"key": [sourceHash, "translation"]`. When the English source of a string
changes, its hash no longer matches and the app translates that string again. Edit a
translation by hand to fix wording; keep the hash.
