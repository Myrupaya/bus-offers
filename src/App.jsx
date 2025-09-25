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

/** Scoring with word overlap + Levenshtein */
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

/** Dropdown entry */
function makeEntry(raw, type) {
  const base = brandCanonicalize(getBase(raw));
  return { type, display: base, baseNorm: toNorm(base) };
}

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

/** Disclaimer */
const Disclaimer = () => (
  <section className="disclaimer">
    <h3>Disclaimer</h3>
    <p>
      All offers, coupons, and discounts listed on our platform are provided for
      informational purposes only. We do not guarantee the accuracy,
      availability, or validity of any offer. Users are advised to verify the
      terms and conditions with the respective merchants before making any
      purchase. We are not responsible for any discrepancies, expired offers, or
      losses arising from the use of these coupons.
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

  // Load allCards.csv
  useEffect(() => {
    async function loadAllCards() {
      try {
        const res = await axios.get(`/allCards.csv`);
        const parsed = Papa.parse(res.data, { header: true });
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
        console.error("allCards.csv load error:", e);
      }
    }
    loadAllCards();
  }, []);

  // Load offers
  useEffect(() => {
    async function loadOffers() {
      try {
        const files = [
          { name: "permanent_offers.csv", setter: setPermanentOffers },
          { name: "abhibus.csv", setter: setAbhibusOffers },
          { name: "cleartrip.csv", setter: setCleartripOffers },
          { name: "goibibo.csv", setter: setGoibiboOffers },
          { name: "redbus.csv", setter: setRedbusOffers },
        ];
        await Promise.all(
          files.map(async (f) => {
            const res = await axios.get(`/${encodeURIComponent(f.name)}`);
            const parsed = Papa.parse(res.data, { header: true });
            f.setter(parsed.data || []);
          })
        );
      } catch (e) {
        console.error("Offer CSV load error:", e);
      }
    }
    loadOffers();
  }, []);

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

  const seen = new Set();
  const dPermanent =
    selected?.type === "credit" ? dedupWrappers(wPermanent, seen) : [];
  const dAbhibus = dedupWrappers(wAbhibus, seen);
  const dCleartrip = dedupWrappers(wCleartrip, seen);
  const dGoibibo = dedupWrappers(wGoibibo, seen);
  const dRedbus = dedupWrappers(wRedbus, seen);

  const dIxigo = dAbhibus.map((w) => ({ ...w, site: "Ixigo" }));
  const dMakeMyTrip = dRedbus.map((w) => ({ ...w, site: "MakeMyTrip" }));

  const hasAny =
    dPermanent.length ||
    dAbhibus.length ||
    dCleartrip.length ||
    dGoibibo.length ||
    dRedbus.length ||
    dIxigo.length ||
    dMakeMyTrip.length;

  /** -------------------- OfferCard -------------------- */
  const OfferCard = ({ wrapper, isPermanent = false }) => {
    const o = wrapper.offer;
    const title = firstField(o, LIST_FIELDS.title) || "Offer";
    const image = firstField(o, LIST_FIELDS.image);
    const desc = firstField(o, LIST_FIELDS.desc);
    const coupon = firstField(o, LIST_FIELDS.coupon);
    const [copied, setCopied] = useState(false);

    // ✅ Override links based on site
    let link = firstField(o, LIST_FIELDS.link);
    if (wrapper.site === "MakeMyTrip") {
      link = "https://www.makemytrip.com/bus-tickets/";
    } else if (wrapper.site === "Ixigo") {
      link = "https://bus.ixigo.com/offers";
    }

    const onCopy = async (text) => {
      try {
        await navigator.clipboard.writeText(String(text || ""));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {}
    };

    if (isPermanent) {
      const permanentBenefit = firstField(o, LIST_FIELDS.permanentBenefit);
      return (
        <div className="offer-card">
          {image && <img src={image} alt={title} />}
          <div className="offer-info">
            {permanentBenefit && (
              <p className="offer-desc">{permanentBenefit}</p>
            )}
            <p>
              <strong>This is an inbuilt feature of this credit card</strong>
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="offer-card">
        {image && <img src={image} alt={title} />}
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
            <button
              className="btn"
              onClick={() => window.open(link, "_blank")}
            >
              View Offer
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="App">
      {/* Search / Dropdown */}
      <div
        className="dropdown"
        style={{ position: "relative", width: "600px", margin: "20px auto" }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            setSelected(null);

            if (!val.trim()) {
              setFilteredCards([]);
              return;
            }

            const scored = (arr) =>
              arr
                .map((it) => ({ it, s: scoreCandidate(val, it.display) }))
                .filter(({ s }) => s > 0.3)
                .sort((a, b) => b.s - a.s)
                .slice(0, MAX_SUGGESTIONS)
                .map(({ it }) => it);

            const cc = scored(creditEntries);
            const dc = scored(debitEntries);

            const lowerVal = val.toLowerCase();
            if (lowerVal.includes("dc") || lowerVal.includes("debit")) {
              setFilteredCards([
                ...(dc.length ? [{ type: "heading", label: "Debit Cards" }] : []),
                ...dc,
                ...(cc.length ? [{ type: "heading", label: "Credit Cards" }] : []),
                ...cc,
              ]);
            } else {
              setFilteredCards([
                ...(cc.length ? [{ type: "heading", label: "Credit Cards" }] : []),
                ...cc,
                ...(dc.length ? [{ type: "heading", label: "Debit Cards" }] : []),
                ...dc,
              ]);
            }
          }}
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

      {/* Offer sections */}
      {query.trim() && (
        selected ? (
          hasAny ? (
            <div className="offers-section">
              {!!dPermanent.length && (
                <div>
                  <h2>Permanent Offers</h2>
                  <div className="offer-grid">
                    {dPermanent.map((w, i) => (
                      <OfferCard key={i} wrapper={w} isPermanent />
                    ))}
                  </div>
                </div>
              )}
              {!!dAbhibus.length && (
                <div>
                  <h2>Offers on Abhibus</h2>
                  <div className="offer-grid">
                    {dAbhibus.map((w, i) => (
                      <OfferCard key={i} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}
              {!!dIxigo.length && (
                <div>
                  <h2>Offers on Ixigo</h2>
                  <div className="offer-grid">
                    {dIxigo.map((w, i) => (
                      <OfferCard key={i} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}
              {!!dCleartrip.length && (
                <div>
                  <h2>Offers on Cleartrip</h2>
                  <div className="offer-grid">
                    {dCleartrip.map((w, i) => (
                      <OfferCard key={i} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}
              {!!dGoibibo.length && (
                <div>
                  <h2>Offers on Goibibo</h2>
                  <div className="offer-grid">
                    {dGoibibo.map((w, i) => (
                      <OfferCard key={i} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}
              {!!dRedbus.length && (
                <div>
                  <h2>Offers on Redbus</h2>
                  <div className="offer-grid">
                    {dRedbus.map((w, i) => (
                      <OfferCard key={i} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}
              {!!dMakeMyTrip.length && (
                <div>
                  <h2>Offers on MakeMyTrip</h2>
                  <div className="offer-grid">
                    {dMakeMyTrip.map((w, i) => (
                      <OfferCard key={i} wrapper={w} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: "red", textAlign: "center", marginTop: "20px", fontSize: "18px" }}>
              No offers available for this card
            </p>
          )
        ) : (
          <p style={{ color: "red", textAlign: "center", marginTop: "20px", fontSize: "18px" }}>
            No such card found in our system
          </p>
        )
      )}

      <Disclaimer />
    </div>
  );
};

export default HotelOffers;
