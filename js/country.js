/* Miiuz Beyond Borders — the traveller's home country (ISO 3166-1 alpha-2, e.g. "US", "CN").
 * Separate from the app language: language follows the phone, home country decides currency,
 * date and time formats, units and country facts (visa, consular help, maps).
 * detect() only reads signals that need no permission prompt. Malaysia ("MY") is never a guess,
 * because a local SIM or hotel Wi-Fi in Malaysia says nothing about where someone is from.
 * Shared with scripts/check.mjs, which tests detect(). */
(function (root) {
  // Every country a traveller can pick (ISO 3166-1, plus Kosovo); names come from the browser.
  const COUNTRIES = ("AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW").split(" ");
  const KNOWN = new Set(COUNTRIES);
  // Shown first in pickers. The US and China are Miiuz's main audiences.
  const COMMON = ["US", "CN", "SG", "ID", "TH", "IN", "BN", "PH", "KR", "VN", "JP", "TW", "HK", "AU", "GB", "SA", "MY"];

  // Home currency per country. Countries not listed fall back to the app language's currency.
  const EURO = "AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK".split(" ");
  const CURRENCY = {
    US: "USD", CN: "CNY", HK: "HKD", MO: "MOP", TW: "TWD", KR: "KRW", JP: "JPY", SG: "SGD", ID: "IDR", TH: "THB",
    VN: "VND", PH: "PHP", IN: "INR", BD: "BDT", PK: "PKR", LK: "LKR", NP: "NPR", MM: "MMK", KH: "USD", LA: "LAK",
    BN: "BND", AU: "AUD", NZ: "NZD", GB: "GBP", CH: "CHF", NO: "NOK", SE: "SEK", DK: "DKK", PL: "PLN", CZ: "CZK",
    HU: "HUF", RO: "RON", TR: "TRY", RU: "RUB", UA: "UAH", KZ: "KZT", UZ: "UZS", SA: "SAR", AE: "AED", QA: "QAR",
    KW: "KWD", BH: "BHD", OM: "OMR", IL: "ILS", EG: "EGP", ZA: "ZAR", NG: "NGN", KE: "KES", CA: "CAD", MX: "MXN",
    BR: "BRL", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN", MV: "MVR", MN: "MNT",
    MY: "MYR", // residents: prices are already in their currency, so nothing is converted
  };
  for (const c of EURO) CURRENCY[c] = "EUR";

  // Countries where clocks are usually read in 12-hour time (2:30 PM).
  const H12 = new Set(["US", "CA", "AU", "NZ", "IN", "PH", "PK", "BD", "EG", "SA"]);

  // Phone time zone → country, for the common ones. Unknown zones give no guess.
  const TZ_RULES = [
    [/^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Adak|Boise|Detroit|Juneau|Sitka|Nome|Yakutat|Metlakatla|Menominee|Indiana\/|Kentucky\/|North_Dakota\/)|Pacific\/Honolulu$|US\/)/, "US"],
    [/^(Asia\/(Shanghai|Urumqi|Chongqing|Chungking|Harbin|Kashgar)|PRC)$/, "CN"],
    [/^America\/(Toronto|Vancouver|Edmonton|Winnipeg|Halifax|St_Johns|Regina|Montreal)$/, "CA"],
    [/^Australia\//, "AU"],
  ];
  const TZ = {
    "Asia/Hong_Kong": "HK", "Asia/Macau": "MO", "Asia/Taipei": "TW", "Asia/Seoul": "KR", "Asia/Tokyo": "JP",
    "Asia/Singapore": "SG", "Asia/Jakarta": "ID", "Asia/Pontianak": "ID", "Asia/Makassar": "ID", "Asia/Jayapura": "ID",
    "Asia/Bangkok": "TH", "Asia/Ho_Chi_Minh": "VN", "Asia/Saigon": "VN", "Asia/Manila": "PH", "Asia/Kolkata": "IN",
    "Asia/Calcutta": "IN", "Asia/Dhaka": "BD", "Asia/Karachi": "PK", "Asia/Colombo": "LK", "Asia/Kathmandu": "NP",
    "Asia/Yangon": "MM", "Asia/Rangoon": "MM", "Asia/Phnom_Penh": "KH", "Asia/Vientiane": "LA", "Asia/Brunei": "BN",
    "Asia/Dubai": "AE", "Asia/Riyadh": "SA", "Asia/Qatar": "QA", "Asia/Kuwait": "KW", "Asia/Jerusalem": "IL",
    "Asia/Almaty": "KZ", "Asia/Tashkent": "UZ", "Pacific/Auckland": "NZ", "Europe/London": "GB", "Europe/Dublin": "IE",
    "Europe/Paris": "FR", "Europe/Berlin": "DE", "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Amsterdam": "NL",
    "Europe/Brussels": "BE", "Europe/Zurich": "CH", "Europe/Vienna": "AT", "Europe/Stockholm": "SE", "Europe/Oslo": "NO",
    "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Europe/Warsaw": "PL", "Europe/Prague": "CZ", "Europe/Budapest": "HU",
    "Europe/Bucharest": "RO", "Europe/Athens": "GR", "Europe/Lisbon": "PT", "Europe/Istanbul": "TR", "Europe/Moscow": "RU",
    "Europe/Kyiv": "UA", "Europe/Kiev": "UA", "America/Mexico_City": "MX", "America/Sao_Paulo": "BR", "Africa/Cairo": "EG",
    "Africa/Johannesburg": "ZA", "Africa/Lagos": "NG", "Africa/Nairobi": "KE",
  };
  // Phones in Malaysia. Used for "before you fly" vs "in Malaysia", never as a home country.
  const LOCAL_TZ = ["Asia/Kuala_Lumpur", "Asia/Kuching"];

  // Last resort: the app language's usual country (keeps China, Korea and Japan facts for their readers).
  const LANG_COUNTRY = { zh: "CN", "zh-Hant": "TW", yue: "HK", ko: "KR", ja: "JP" };
  // Phone language not supported by the app: pick a hand-translated one from the home country.
  const COUNTRY_LANG = { CN: "zh", KR: "ko", JP: "ja" };

  const valid = c => typeof c === "string" && KNOWN.has(c);
  const guessable = c => valid(c) && c !== "MY";

  function fromTimeZone(tz) {
    if (!tz) return null;
    if (TZ[tz]) return TZ[tz];
    for (const [re, c] of TZ_RULES) if (re.test(tz)) return c;
    return null;
  }
  // "en-US" → "US", "zh-Hans-CN" → "CN", "zh-Hans" / "es-419" → null.
  function regionOf(tag) {
    const parts = String(tag || "").replace(/_/g, "-").split("-").slice(1);
    const r = parts.find(p => /^[a-z]{2}$/i.test(p));
    return r ? r.toUpperCase() : null;
  }

  /* Best guess from the signals, strongest first:
   * 1. member: the nationality on the traveller's Miiuz profile
   * 2. tz: the phone's time zone, when it isn't Malaysia's (before the trip, or a phone kept on home time)
   * 3. ip: the request's country from Vercel, when it isn't Malaysia (a roaming SIM still shows home)
   * 4. lang: the region in the phone's language settings (en-US, zh-CN)
   * 5. the app language's usual country (zh → CN, ko → KR, ja → JP) */
  function detect({ member = "", timeZone = "", ip = "", languages = [], lang = "" } = {}) {
    if (guessable(member)) return { code: member, by: "member" };
    const tz = fromTimeZone(timeZone);
    if (guessable(tz)) return { code: tz, by: "tz" };
    if (guessable(ip)) return { code: ip, by: "ip" };
    for (const t of languages || []) { const r = regionOf(t); if (guessable(r)) return { code: r, by: "lang" }; }
    if (LANG_COUNTRY[lang]) return { code: LANG_COUNTRY[lang], by: "lang" };
    return { code: null, by: "" };
  }

  const api = {
    COUNTRIES, COMMON, CURRENCY, H12, LOCAL_TZ, COUNTRY_LANG,
    valid, detect, fromTimeZone, regionOf,
    currencyOf: c => CURRENCY[c] || null,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else { root.MBB = root.MBB || {}; root.MBB.origin = api; }
})(typeof window !== "undefined" ? window : globalThis);
