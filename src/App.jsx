import React, { useEffect, useState } from "react";
import axios from "axios";
import Papa from "papaparse";
import "./App.css";

/** -------------------- CONFIG -------------------- */
const LIST_FIELDS = {
  credit: ["Eligible Credit Cards", "Eligible Cards"],
  debit: ["Eligible Debit Cards", "Applicable Debit Cards"],
  title: ["Offer Title", "Title"],
  image: ["Image", "Credit Card Image", "Offer Image", "image"],
  link: ["Link", "Offer Link"],
  desc: ["Description", "Details", "Offer Description", "Flight Benefit"],
  coupon: ["Coupon code", "Coupon", "Code"],

  // For permanent/inbuilt section (bus)
  permanentCCName: ["Eligible Credit Cards"],
  permanentBenefit: [
    "Bus Ticket Benefit",
    "Grocery Benefit",
    "Benefit",
    "Offer",
    "Hotel Benefit",
  ],
};

const MAX_SUGGESTIONS = 50;

/** -------------------- FALLBACK IMAGES BY SITE -------------------- */
const FALLBACK_IMAGE_BY_SITE = {
  abhibus:
    "https://play-lh.googleusercontent.com/ZgBXowR57R5sLG3BmzrVDYH5f-3I18IMUl1IDGwUOPmGejvN0lzRYCSYsVNDSUW0H51M",
  cleartrip:
    "https://bottindia.com/wp-content/uploads/2023/09/Cleartrip.webp",
  goibibo:
    "https://jsak.goibibo.com/pwa_v3/pwa_growth/images/og-goibibo.aba291ed.png",
  redbus:
    "https://play-lh.googleusercontent.com/2sknePPj33W1Iu2tZbDFario3G7kpIJFkKYm9VgGnQYKzn_WJygKFihJkZTx8H7sb0o",
  ixigo:
    "https://assets.ixigo.com/image/upload/f_auto/ixigo-logo-1708608265.png",
  makemytrip:
    "https://cdn.gadgets360.com/pricee/assets/store/makemytrip-1200x800.png",
  // new confirmtkt logo
  confirmtkt:
    "https://travelmail.in/wp-content/uploads/2018/07/ConfirmTkt-Logo.jpeg",
};

/** -------------------- HELPERS -------------------- */
const toNorm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function firstField(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] && String(obj[k]).trim() !== "") {
      return obj[k];
    }
  }
  return undefined;
}

function splitList(val) {
  if (!val) return [];
  return String(val)
    .replace(/\n/g, " ")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getBase(name) {
  if (!name) return "";
  return String(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function brandCanonicalize(text) {
  let s = String(text || "");
  s = s.replace(/\bMakemytrip\b/gi, "MakeMyTrip");
  s = s.replace(/\bIcici\b/gi, "ICICI");
  s = s.replace(/\bHdfc\b/gi, "HDFC");
  s = s.replace(/\bSbi\b/gi, "SBI");
  s = s.replace(/\bIdfc\b/gi, "IDFC");
  s = s.replace(/\bPnb\b/gi, "PNB");
  s = s.replace(/\bRbl\b/gi, "RBL");
  s = s.replace(/\bYes\b/gi, "YES");
  return s;
}

/** Levenshtein distance */
function lev(a, b) {
  a = toNorm(a);
  b = toNorm(b);
  const n = a.length,
    m = b.length;
  if (!n) return m;
  if (!m) return n;
  const d = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) d[i][0] = i;
  for (let j = 0; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  return d[n][m];
}

/** score search matches */
function scoreCandidate(q, cand) {
  const qs = toNorm(q);
  const cs = toNorm(cand);
  if (!qs) return 0;
  if (cs.includes(qs)) return 100;

  const qWords = qs.split(" ").filter(Boolean);
  const cWords = cs.split(" ").filter(Boolean);

  const matchingWords = qWords.filter((qw) =>
    cWords.some((cw) => cw.includes(qw))
  ).length;

  const sim = 1 - lev(qs, cs) / Math.max(qs.length, cs.length);

  return (matchingWords / Math.max(1, qWords.length)) * 0.7 + sim * 0.3;
}

/** 🔹 Fuzzy name matcher (handles typos like "selct" ≈ "select") */
function isFuzzyNameMatch(query, label) {
  const q = toNorm(query);
  const l = toNorm(label);
  if (!q || !l) return false;

  // direct substring
  if (l.includes(q)) return true;

  // whole-string similarity
  const wholeDist = lev(q, l);
  const wholeSim = 1 - wholeDist / Math.max(q.length, l.length);
  if (wholeSim >= 0.6) return true;

  // per-word similarity (e.g. "selct" ≈ "select")
  const qWords = q.split(" ").filter(Boolean);
  const lWords = l.split(" ").filter(Boolean);
  for (const qw of qWords) {
    if (qw.length < 3) continue;
    for (const lw of lWords) {
      if (lw.length < 3) continue;
      const d = lev(qw, lw);
      const sim = 1 - d / Math.max(qw.length, lw.length);
      if (sim >= 0.7) return true;
    }
  }
  return false;
}

/** Dropdown entry builder */
function makeEntry(raw, type) {
  const base = brandCanonicalize(getBase(raw));
  return { type, display: base, baseNorm: toNorm(base) };
}

/** used for dedup of offers */
function normalizeUrl(u) {
  if (!u) return "";
  let s = String(u).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

function normalizeText(s) {
  return toNorm(s || "");
}

function offerKey(offer) {
  const image = normalizeUrl(firstField(offer, LIST_FIELDS.image) || "");
  const title = normalizeText(firstField(offer, LIST_FIELDS.title) || "");
  const desc = normalizeText(firstField(offer, LIST_FIELDS.desc) || "");
  const link = normalizeUrl(firstField(offer, LIST_FIELDS.link) || "");
  return `${title}||${desc}||${image}||${link}`;
}

function dedupWrappers(arr, seen) {
  const out = [];
  for (const w of arr || []) {
    const k = offerKey(w.offer);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(w);
  }
  return out;
}

/** Image helpers */
function isUsableImage(val) {
  if (!val) return false;
  const s = String(val).trim();
  if (!s) return false;
  if (/^(na|n\/a|null|undefined|-|image unavailable)$/i.test(s)) return false;
  return true;
}

function resolveImage(siteKey, candidate) {
  const key = String(siteKey || "").toLowerCase();
  const fallback = FALLBACK_IMAGE_BY_SITE[key];
  const usingFallback = !isUsableImage(candidate) && !!fallback;
  return { src: usingFallback ? fallback : candidate, usingFallback };
}

function handleImgError(e, siteKey) {
  const key = String(siteKey || "").toLowerCase();
  const fallback = FALLBACK_IMAGE_BY_SITE[key];
  const el = e.currentTarget;
  if (fallback && el.src !== fallback) {
    el.src = fallback;
    el.classList.add("is-fallback");
  } else {
    el.style.display = "none";
  }
}

/** Disclaimer */
const Disclaimer = () => (
  <section className="disclaimer">
    <h3>Disclaimer</h3>
    <p>
      All offers, coupons, and discounts listed on our platform are provided
      for informational purposes only. We do not guarantee the accuracy,
      availability, or validity of any offer. Users are advised to verify the
      terms and conditions with the respective merchants before making any
      purchase. We are not responsible for any discrepancies, expired offers,
      or losses arising from the use of these coupons.
    </p>
  </section>
);

/** -------------------- COMPONENT -------------------- */
const HotelOffers = () => {
  const [creditEntries, setCreditEntries] = useState([]);
  const [debitEntries, setDebitEntries] = useState([]);

  const [filteredCards, setFilteredCards] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  const [permanentOffers, setPermanentOffers] = useState([]);
  const [abhibusOffers, setAbhibusOffers] = useState([]);
  const [cleartripOffers, setCleartripOffers] = useState([]);
  const [goibiboOffers, setGoibiboOffers] = useState([]);
  const [redbusOffers, setRedbusOffers] = useState([]);

  const [marqueeCC, setMarqueeCC] = useState([]);
  const [marqueeDC, setMarqueeDC] = useState([]);

  // load allCards.csv
  useEffect(() => {
    async function loadAllCards() {
      try {
        const res = await axios.get(`/allCards.csv`);
        const parsed = Papa.parse(res.data, {
          header: true,
          skipEmptyLines: true,
        });
        const rows = parsed.data || [];

        const creditMap = new Map();
        const debitMap = new Map();

        for (const row of rows) {
          const ccList = splitList(row["Eligible Credit Cards"]);
          for (const raw of ccList) {
            const base = brandCanonicalize(getBase(raw));
            const baseNorm = toNorm(base);
            if (baseNorm) creditMap.set(baseNorm, base);
          }
          const dcList = splitList(row["Eligible Debit Cards"]);
          for (const raw of dcList) {
            const base = brandCanonicalize(getBase(raw));
            const baseNorm = toNorm(base);
            if (baseNorm) debitMap.set(baseNorm, base);
          }
        }

        const credit = Array.from(creditMap.values())
          .sort((a, b) => a.localeCompare(b))
          .map((d) => makeEntry(d, "credit"));
        const debit = Array.from(debitMap.values())
          .sort((a, b) => a.localeCompare(b))
          .map((d) => makeEntry(d, "debit"));

        setCreditEntries(credit);
        setDebitEntries(debit);
      } catch (e) {
        console.error("allCards.csv load error:", e.message);
      }
    }
    loadAllCards();
  }, []);

  // load offer csvs
  useEffect(() => {
    async function loadOffers() {
      const files = [
        { name: "permanent_offers.csv", setter: setPermanentOffers },
        { name: "Abhibus.csv", setter: setAbhibusOffers },
        { name: "Cleartrip.csv", setter: setCleartripOffers },
        { name: "goibibo.csv", setter: setGoibiboOffers },
        { name: "redbus.csv", setter: setRedbusOffers },
      ];

      await Promise.all(
        files.map(async (f) => {
          try {
            const res = await axios.get(`/${encodeURIComponent(f.name)}`);
            const parsed = Papa.parse(res.data, {
              header: true,
              skipEmptyLines: true,
            });
            f.setter(parsed.data || []);
          } catch (e) {
            console.warn(`Skipping ${f.name}: ${e.message}`);
            f.setter([]);
          }
        })
      );
    }
    loadOffers();
  }, []);

  // build marquee chips
  useEffect(() => {
    const ccMap = new Map();
    const dcMap = new Map();

    const harvestList = (val, map) => {
      for (const raw of splitList(val)) {
        const base = brandCanonicalize(getBase(raw));
        const baseNorm = toNorm(base);
        if (baseNorm) map.set(baseNorm, map.get(baseNorm) || base);
      }
    };

    const harvestRows = (rows) => {
      for (const o of rows || []) {
        const ccField = firstField(o, LIST_FIELDS.credit);
        if (ccField) harvestList(ccField, ccMap);

        const dcField = firstField(o, LIST_FIELDS.debit);
        if (dcField) harvestList(dcField, dcMap);
      }
    };

    harvestRows(abhibusOffers);
    harvestRows(cleartripOffers);
    harvestRows(goibiboOffers);
    harvestRows(redbusOffers);

    for (const o of permanentOffers || []) {
      const nm = firstField(o, LIST_FIELDS.permanentCCName);
      if (nm) {
        const base = brandCanonicalize(getBase(nm));
        const baseNorm = toNorm(base);
        if (baseNorm) ccMap.set(baseNorm, ccMap.get(baseNorm) || base);
      }
    }

    setMarqueeCC(
      Array.from(ccMap.values()).sort((a, b) => a.localeCompare(b))
    );
    setMarqueeDC(
      Array.from(dcMap.values()).sort((a, b) => a.localeCompare(b))
    );
  }, [abhibusOffers, cleartripOffers, goibiboOffers, redbusOffers, permanentOffers]);

  /** collect matches for selected card */
  function matchesFor(offers, type, site) {
    if (!selected) return [];
    const out = [];
    for (const o of offers || []) {
      let list = [];
      if (type === "permanent") {
        const nm = firstField(o, LIST_FIELDS.permanentCCName);
        if (nm) list = [nm];
      } else if (type === "debit") {
        list = splitList(firstField(o, LIST_FIELDS.debit));
      } else {
        list = splitList(firstField(o, LIST_FIELDS.credit));
      }

      for (const raw of list) {
        const base = brandCanonicalize(getBase(raw));
        if (toNorm(base) === selected.baseNorm) {
          out.push({ offer: o, site });
          break;
        }
      }
    }
    return out;
  }

  // per-site wrappers
  const wPermanent = matchesFor(permanentOffers, "permanent", "Permanent");
  const wAbhibus = matchesFor(
    abhibusOffers,
    selected?.type === "debit" ? "debit" : "credit",
    "Abhibus"
  );
  const wCleartrip = matchesFor(
    cleartripOffers,
    selected?.type === "debit" ? "debit" : "credit",
    "Cleartrip"
  );
  const wGoibibo = matchesFor(
    goibiboOffers,
    selected?.type === "debit" ? "debit" : "credit",
    "Goibibo"
  );
  const wRedbus = matchesFor(
    redbusOffers,
    selected?.type === "debit" ? "debit" : "credit",
    "Redbus"
  );

  // virtual sections
  const dIxigo = wAbhibus.map((w) => ({ ...w, site: "Ixigo" }));
  const dConfirmTkt = wAbhibus.map((w) => ({ ...w, site: "Confirmtkt" }));
  const dMakeMyTrip = wRedbus.map((w) => ({ ...w, site: "MakeMyTrip" }));

  // GLOBAL dedup for real sources
  const seen = new Set();
  const dPermanent =
    selected?.type === "credit" ? dedupWrappers(wPermanent, seen) : [];
  const dAbhibus = dedupWrappers(wAbhibus, seen);
  const dCleartrip = dedupWrappers(wCleartrip, seen);
  const dGoibibo = dedupWrappers(wGoibibo, seen);
  const dRedbus = dedupWrappers(wRedbus, seen);

  // VIRTUAL sections must not be removed because originals showed them
  const dIxigoDeduped = dedupWrappers(dIxigo, new Set());
  const dConfirmTktDeduped = dedupWrappers(dConfirmTkt, new Set());
  const dMakeMyTripDeduped = dedupWrappers(dMakeMyTrip, new Set());

  const hasAny =
    dPermanent.length ||
    dAbhibus.length ||
    dCleartrip.length ||
    dGoibibo.length ||
    dRedbus.length ||
    dIxigoDeduped.length ||
    dConfirmTktDeduped.length ||
    dMakeMyTripDeduped.length;

  const handleChipClick = (name, type) => {
    const display = brandCanonicalize(getBase(name));
    const baseNorm = toNorm(display);
    setQuery(display);
    setSelected({ type, display, baseNorm });
    setFilteredCards([]);
  };

  const OfferCard = ({ wrapper, isPermanent = false }) => {
    const o = wrapper.offer;
    const title = firstField(o, LIST_FIELDS.title) || "Offer";
    const rawImage = firstField(o, LIST_FIELDS.image);
    const desc = firstField(o, LIST_FIELDS.desc);
    const coupon = firstField(o, LIST_FIELDS.coupon);
    const siteKey = String(wrapper.site || "").toLowerCase();

    let link = firstField(o, LIST_FIELDS.link);
    if (siteKey === "makemytrip") {
      link = "https://www.makemytrip.com/bus-tickets/";
    } else if (siteKey === "ixigo") {
      link = "https://bus.ixigo.com/offers";
    }

    const wantsFallbackLogic = [
      "abhibus",
      "ixigo",
      "confirmtkt",
      "cleartrip",
      "goibibo",
      "redbus",
      "makemytrip",
    ].includes(siteKey);

    const { src: imgSrc, usingFallback } = wantsFallbackLogic
      ? resolveImage(siteKey, rawImage)
      : { src: rawImage, usingFallback: false };

    const [copied, setCopied] = useState(false);
    async function onCopy(text) {
      try {
        await navigator.clipboard.writeText(String(text || ""));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        /* ignore */
      }
    }

    if (isPermanent) {
      const permanentBenefit = firstField(o, LIST_FIELDS.permanentBenefit);
      return (
        <div className="offer-card">
          {imgSrc && (
            <img
              className={`offer-img ${usingFallback ? "is-fallback" : ""}`}
              src={imgSrc}
              alt={title}
              onError={(e) =>
                wantsFallbackLogic ? handleImgError(e, siteKey) : null
              }
            />
          )}
          <div className="offer-info">
            {permanentBenefit && (
              <p className="offer-desc">{permanentBenefit}</p>
            )}
            <p className="inbuilt-note">
              <strong>This is an inbuilt feature of this credit card</strong>
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="offer-card">
        {imgSrc && (
          <img
            className={`offer-img ${usingFallback ? "is-fallback" : ""}`}
            src={imgSrc}
            alt={title}
            onError={(e) =>
              wantsFallbackLogic ? handleImgError(e, siteKey) : null
            }
          />
        )}

        <div className="offer-info">
          <h3 className="offer-title">{title}</h3>

          {coupon && (
            <div className="coupon-row">
              <code className="coupon-code">{coupon}</code>
              <button className="btn" onClick={() => onCopy(coupon)}>
                {copied ? "✓ Copied" : "📋 Copy"}
              </button>
            </div>
          )}

          {desc && <p className="offer-desc">{desc}</p>}

          {link && (
            <button className="btn" onClick={() => window.open(link, "_blank")}>
              View Offer
            </button>
          )}
        </div>
      </div>
    );
  };

  /** 🔹 UPDATED search: fuzzy + Select boost + Debit-first logic */
  function handleSearchChange(val) {
    setQuery(val);
    setSelected(null);

    if (!val.trim()) {
      setFilteredCards([]);
      return;
    }

    const trimmed = val.trim();
    const qLower = trimmed.toLowerCase();

    const scored = (arr) =>
      arr
        .map((it) => {
          const baseScore = scoreCandidate(trimmed, it.display);
          const inc = it.display.toLowerCase().includes(qLower);
          const fuzzy = isFuzzyNameMatch(trimmed, it.display);

          let s = baseScore;
          if (inc) s += 2.0;   // strong boost if query is substring
          if (fuzzy) s += 1.5; // boost typo-ish matches

          return { it, s, inc, fuzzy };
        })
        .filter(({ s, inc, fuzzy }) => inc || fuzzy || s > 0.3)
        .sort((a, b) => b.s - a.s || a.it.display.localeCompare(b.it.display))
        .slice(0, MAX_SUGGESTIONS)
        .map(({ it }) => it);

    let cc = scored(creditEntries);
    let dc = scored(debitEntries);

    // If nothing matches, clear suggestions
    if (!cc.length && !dc.length) {
      setFilteredCards([]);
      return;
    }

    /** --- SPECIAL CASE 1: "select credit card" / typo like "selct" → move Select cards first --- */
    const qNorm = toNorm(trimmed);
    const qWords = qNorm.split(" ").filter(Boolean);

    const hasSelectWord = qWords.some((w) => {
      if (w === "select") return true;
      if (w.length < 3) return false;
      const d = lev(w, "select");
      const sim = 1 - d / Math.max(w.length, "select".length);
      return sim >= 0.7; // "selct", "selec", "slect", etc.
    });

    const isSelectIntent =
      qNorm.includes("select credit card") ||
      qNorm.includes("select card") ||
      hasSelectWord;

    if (isSelectIntent) {
      const reorderBySelect = (arr) => {
        const selectCards = [];
        const others = [];
        arr.forEach((item) => {
          const labelNorm = toNorm(item.display);
          if (labelNorm.includes("select")) selectCards.push(item);
          else others.push(item);
        });
        return [...selectCards, ...others];
      };
      cc = reorderBySelect(cc);
      dc = reorderBySelect(dc);
    }

    /** --- SPECIAL CASE 2: query contains "dc" / "debit" / "debit card" → Debit Cards first --- */
    const lv = qLower;
    const debitIntent =
      lv.includes("debit card") ||
      lv.includes("debit") ||
      lv.includes("dc"); // substring, not just whole word

    setFilteredCards(
      debitIntent
        ? [
            ...(dc.length ? [{ type: "heading", label: "Debit Cards" }] : []),
            ...dc,
            ...(cc.length ? [{ type: "heading", label: "Credit Cards" }] : []),
            ...cc,
          ]
        : [
            ...(cc.length ? [{ type: "heading", label: "Credit Cards" }] : []),
            ...cc,
            ...(dc.length ? [{ type: "heading", label: "Debit Cards" }] : []),
            ...dc,
          ]
    );
  }

  return (
    <div className="App">
      {(marqueeCC.length > 0 || marqueeDC.length > 0) && (
        <div
          style={{
            maxWidth: 1200,
            margin: "14px auto 0",
            padding: "14px 16px",
            background: "#F7F9FC",
            border: "1px solid #E8EDF3",
            borderRadius: 10,
            boxShadow: "0 6px 18px rgba(15,23,42,.06)",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 16,
              color: "#1F2D45",
              marginBottom: 10,
              display: "flex",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <span>Credit And Debit Cards Which Have Offers</span>
          </div>

          {marqueeCC.length > 0 && (
            <marquee
              direction="left"
              scrollAmount="4"
              style={{ marginBottom: 8, whiteSpace: "nowrap" }}
            >
              <strong style={{ marginRight: 10, color: "#1F2D45" }}>
                Credit Cards:
              </strong>
              {marqueeCC.map((name, idx) => (
                <span
                  key={`cc-chip-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleChipClick(name, "credit")}
                  onKeyDown={(e) =>
                    e.key === "Enter"
                      ? handleChipClick(name, "credit")
                      : null
                  }
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    border: "1px solid #E0E6EE",
                    borderRadius: 9999,
                    marginRight: 8,
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1.2,
                    userSelect: "none",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "#F0F5FF")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "#fff")
                  }
                  title="Click to select this card"
                >
                  {name}
                </span>
              ))}
            </marquee>
          )}

          {marqueeDC.length > 0 && (
            <marquee
              direction="left"
              scrollAmount="4"
              style={{ whiteSpace: "nowrap" }}
            >
              <strong style={{ marginRight: 10, color: "#1F2D45" }}>
                Debit Cards:
              </strong>
              {marqueeDC.map((name, idx) => (
                <span
                  key={`dc-chip-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleChipClick(name, "debit")}
                  onKeyDown={(e) =>
                    e.key === "Enter"
                      ? handleChipClick(name, "debit")
                      : null
                  }
                  style={{
                    display: "inline-block",
                    padding: "6px 10px",
                    border: "1px solid #E0E6EE",
                    borderRadius: 9999,
                    marginRight: 8,
                    background: "#fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1.2,
                    userSelect: "none",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.background = "#F0F5FF")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.background = "#fff")
                  }
                  title="Click to select this card"
                >
                  {name}
                </span>
              ))}
            </marquee>
          )}
        </div>
      )}

      <div
        className="dropdown"
        style={{ position: "relative", width: "600px", margin: "20px auto" }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Type a Credit or Debit Card..."
          className="dropdown-input"
          style={{
            width: "100%",
            padding: "12px",
            fontSize: "16px",
            border: "1px solid #ccc",
            borderRadius: "6px",
          }}
        />

        {query.trim() && !!filteredCards.length && (
          <ul
            className="dropdown-list"
            style={{
              listStyle: "none",
              padding: "10px",
              margin: 0,
              width: "100%",
              maxHeight: "260px",
              overflowY: "auto",
              border: "1px solid #ccc",
              borderRadius: "6px",
              backgroundColor: "#fff",
              position: "absolute",
              zIndex: 1000,
            }}
          >
            {filteredCards.map((item, idx) =>
              item.type === "heading" ? (
                <li
                  key={`h-${idx}`}
                  style={{
                    padding: "8px 10px",
                    fontWeight: 700,
                    background: "#fafafa",
                  }}
                >
                  {item.label}
                </li>
              ) : (
                <li
                  key={`i-${idx}-${item.display}`}
                  onClick={() => {
                    setSelected(item);
                    setQuery(item.display);
                    setFilteredCards([]);
                  }}
                  style={{
                    padding: "10px",
                    cursor: "pointer",
                    borderBottom: "1px solid #f2f2f2",
                  }}
                >
                  {item.display}
                </li>
              )
            )}
          </ul>
        )}
      </div>

      {query.trim() &&
        (selected ? (
          hasAny ? (
            <div className="offers-section">
              {!!dPermanent.length && (
                <div className="offer-group">
                  <h2>Permanent Offers</h2>
                  <div className="offer-grid">
                    {dPermanent.map((w, i) => (
                      <OfferCard key={`perm-${i}`} wrapper={w} isPermanent />
                    ))}
                  </div>
                </div>
              )}

              {!!dAbhibus.length && (
                <div className="offer-group">
                  <h2>Offers on Abhibus</h2>
                  <div className="offer-grid">
                    {dAbhibus.map((w, i) => (
                      <OfferCard key={`abh-${i}`} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}

              {!!dIxigoDeduped.length && (
                <div className="offer-group">
                  <h2>Offers on Ixigo</h2>
                  <div className="offer-grid">
                    {dIxigoDeduped.map((w, i) => (
                      <OfferCard key={`ixi-${i}`} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}

              {!!dConfirmTktDeduped.length && (
                <div className="offer-group">
                  <h2>Offers on Confirmtkt</h2>
                  <div className="offer-grid">
                    {dConfirmTktDeduped.map((w, i) => (
                      <OfferCard key={`ctkt-${i}`} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}

              {!!dCleartrip.length && (
                <div className="offer-group">
                  <h2>Offers on Cleartrip</h2>
                  <div className="offer-grid">
                    {dCleartrip.map((w, i) => (
                      <OfferCard key={`ct-${i}`} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}

              {!!dGoibibo.length && (
                <div className="offer-group">
                  <h2>Offers on Goibibo</h2>
                  <div className="offer-grid">
                    {dGoibibo.map((w, i) => (
                      <OfferCard key={`go-${i}`} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}

              {!!dRedbus.length && (
                <div className="offer-group">
                  <h2>Offers on Redbus</h2>
                  <div className="offer-grid">
                    {dRedbus.map((w, i) => (
                      <OfferCard key={`rb-${i}`} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}

              {!!dMakeMyTripDeduped.length && (
                <div className="offer-group">
                  <h2>Offers on MakeMyTrip</h2>
                  <div className="offer-grid">
                    {dMakeMyTripDeduped.map((w, i) => (
                      <OfferCard key={`mmt-${i}`} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p
              style={{
                color: "red",
                textAlign: "center",
                marginTop: "20px",
                fontSize: "18px",
              }}
            >
              No offers available for this card
            </p>
          )
        ) : (
          <p
            style={{
              color: "red",
              textAlign: "center",
              marginTop: "20px",
              fontSize: "18px",
            }}
          >
            No such card found in our system
          </p>
        ))}

      <Disclaimer />
    </div>
  );
};

export default HotelOffers;
