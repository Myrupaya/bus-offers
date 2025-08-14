import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import Papa from "papaparse";
import "./App.css";

// Helper function to normalize card names
const normalizeCardName = (name) => {
  if (!name) return '';
  return name.trim()
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+/g, ' ');
};

// Helper to extract base card name (remove network variant)
const getBaseCardName = (name) => {
  if (!name) return '';
  return name.replace(/\s*\([^)]*\)$/, '').trim();
};

// Fuzzy matching utility functions
const levenshteinDistance = (a, b) => {
  if (!a || !b) return 100;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
};

const getMatchScore = (query, card) => {
  if (!query || !card) return 0;
  const qWords = query.trim().toLowerCase().split(/\s+/);
  const cWords = card.trim().toLowerCase().split(/\s+/);

  if (card.toLowerCase().includes(query.toLowerCase())) return 100;

  const matchingWords = qWords.filter(qWord =>
    cWords.some(cWord => cWord.includes(qWord))
  ).length;

  const similarity = 1 - (levenshteinDistance(query.toLowerCase(), card.toLowerCase()) /
    Math.max(query.length, card.length));

  return (matchingWords / qWords.length) * 0.7 + similarity * 0.3;
};

const highlightMatch = (text, query) => {
  if (!query.trim()) return text;

  const regex = new RegExp(`(${query.trim().split(/\s+/).map(word =>
    word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');

  return text.split(regex).map((part, i) =>
    regex.test(part) ? <mark key={i}>{part}</mark> : part
  );
};

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text).then(() => {
    alert("Promo code copied: " + text);
  });
};

const CreditCardDropdown = () => {
  const [creditCards, setCreditCards] = useState([]);
  const [filteredCards, setFilteredCards] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState("");
  const [permanentOffers, setPermanentOffers] = useState([]);
  const [abhibusOffers, setAbhibusOffers] = useState([]);
  const [cleartripOffers, setCleartripOffers] = useState([]);
  const [confirmtktOffers, setConfirmtktOffers] = useState([]);
  const [ixigoOffers, setIxigoOffers] = useState([]);
  const [paytmOffers, setPaytmOffers] = useState([]);
  const [expandedOfferIndex, setExpandedOfferIndex] = useState({ 
    abhibus: null, 
    cleartrip: null,
    confirmtkt: null,
    ixigo: null,
    paytm: null
  });
  const [showNoCardMessage, setShowNoCardMessage] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Get offers for selected card
  const getOffersForCard = (offers, selectedCard) => {
    if (!selectedCard) return [];
    return offers.filter(offer => {
      const eligibleCards = offer["Eligible Credit Cards"] 
        ? offer["Eligible Credit Cards"].split(',').map(card => getBaseCardName(normalizeCardName(card)))
        : [];
      return eligibleCards.includes(selectedCard);
    });
  };

  const selectedPermanentOffers = getOffersForCard(permanentOffers, selectedCard);
  const selectedAbhibusOffers = getOffersForCard(abhibusOffers, selectedCard);
  const selectedCleartripOffers = getOffersForCard(cleartripOffers, selectedCard);
  const selectedConfirmtktOffers = getOffersForCard(confirmtktOffers, selectedCard);
  const selectedIxigoOffers = getOffersForCard(ixigoOffers, selectedCard);
  const selectedPaytmOffers = getOffersForCard(paytmOffers, selectedCard);

  const toggleOfferDetails = (type, index) => {
    setExpandedOfferIndex((prev) => ({
      ...prev,
      [type]: prev[type] === index ? null : index,
    }));
  };

  const hasAnyOffers = useCallback(() => {
    return (
      selectedPermanentOffers.length > 0 ||
      selectedAbhibusOffers.length > 0 ||
      selectedCleartripOffers.length > 0 ||
      selectedConfirmtktOffers.length > 0 ||
      selectedIxigoOffers.length > 0 ||
      selectedPaytmOffers.length > 0
    );
  }, [
    selectedPermanentOffers,
    selectedAbhibusOffers,
    selectedCleartripOffers,
    selectedConfirmtktOffers,
    selectedIxigoOffers,
    selectedPaytmOffers
  ]);

  const handleScrollDown = () => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth"
    });
  };

  useEffect(() => {
    const fetchCSVData = async () => {
      try {
        const [
          permanentResponse,
          abhibusResponse, 
          cleartripResponse, 
          confirmtktResponse, 
          ixigoResponse, 
          paytmResponse, 
          allCardsResponse
        ] = await Promise.all([
          axios.get("/Permanent Offers.csv"),
          axios.get("/Abhibus.csv"),
          axios.get("/Cleartrip.csv"),
          axios.get("/Confirmtkt.csv"),
          axios.get("/Ixigo.csv"),
          axios.get("/Paytm.csv"),
          axios.get("/All Cards.csv")
        ]);

        const parseOptions = { header: true };
        const permanentData = Papa.parse(permanentResponse.data, parseOptions);
        const abhibusData = Papa.parse(abhibusResponse.data, parseOptions);
        const cleartripData = Papa.parse(cleartripResponse.data, parseOptions);
        const confirmtktData = Papa.parse(confirmtktResponse.data, parseOptions);
        const ixigoData = Papa.parse(ixigoResponse.data, parseOptions);
        const paytmData = Papa.parse(paytmResponse.data, parseOptions);
        const allCardsParsed = Papa.parse(allCardsResponse.data, parseOptions);

        setPermanentOffers(permanentData.data);
        setAbhibusOffers(abhibusData.data);
        setCleartripOffers(cleartripData.data);
        setConfirmtktOffers(confirmtktData.data);
        setIxigoOffers(ixigoData.data);
        setPaytmOffers(paytmData.data);

        // Extract unique card names from all CSVs
        const baseCardSet = new Set();
        
        const extractCards = (data) => {
          data.forEach(row => {
            if (row["Eligible Credit Cards"]) {
              const cards = row["Eligible Credit Cards"].split(',').map(card => 
                getBaseCardName(normalizeCardName(card))
              );
              cards.forEach(card => baseCardSet.add(card));
            }
          });
        };

        extractCards(permanentData.data);
        extractCards(abhibusData.data);
        extractCards(cleartripData.data);
        extractCards(confirmtktData.data);
        extractCards(ixigoData.data);
        extractCards(paytmData.data);
        extractCards(allCardsParsed.data);

        setCreditCards(Array.from(baseCardSet).sort());
      } catch (error) {
        console.error("Error loading CSV data:", error);
      }
    };

    fetchCSVData();
  }, []);

  useEffect(() => {
    setShowScrollButton(selectedCard && hasAnyOffers());
  }, [selectedCard, hasAnyOffers]);

  const handleInputChange = (event) => {
    const value = event.target.value;
    setQuery(value);
    setShowNoCardMessage(false);

    if (typingTimeout) clearTimeout(typingTimeout);

    if (!value) {
      setSelectedCard("");
      setFilteredCards([]);
      return;
    }

    if (selectedCard && value !== selectedCard) {
      setSelectedCard("");
    }

    const scoredCards = creditCards.map(card => ({
      card,
      score: getMatchScore(value, card)
    }))
      .filter(item => item.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const combinedResults = [];
    if (scoredCards.length > 0) {
      combinedResults.push({ type: "heading", label: "Credit Cards" });
      combinedResults.push(...scoredCards.map(item => ({
        type: "credit",
        card: item.card,
        score: item.score
      })));
    }

    setFilteredCards(combinedResults);

    if (combinedResults.length === 0 && value.length > 2) {
      const timeout = setTimeout(() => {
        setShowNoCardMessage(true);
      }, 1000);
      setTypingTimeout(timeout);
    }
  };

  const handleCardSelection = (card) => {
    setSelectedCard(card);
    setQuery(card);
    setFilteredCards([]);
    setExpandedOfferIndex({ 
      abhibus: null, 
      cleartrip: null,
      confirmtkt: null,
      ixigo: null,
      paytm: null
    });
    setShowNoCardMessage(false);
    if (typingTimeout) clearTimeout(typingTimeout);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="App">
      <div className="content-container">
        <div className="creditCardDropdown" style={{ position: "relative", width: "600px", margin: "2px auto", marginTop:"2px" }}>
          <input
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Type a Credit Card..."
            style={{
              width: "90%",
              padding: "12px",
              fontSize: "16px",
              border: `1px solid ${showNoCardMessage ? 'red' : '#ccc'}`,
              borderRadius: "5px",
            }}
          />
          {filteredCards.length > 0 && (
            <ul
              style={{
                listStyleType: "none",
                padding: "10px",
                margin: 0,
                width: "90%",
                maxHeight: "200px",
                overflowY: "auto",
                border: "1px solid #ccc",
                borderRadius: "5px",
                backgroundColor: "#fff",
                position: "absolute",
                zIndex: 1000,
              }}
            >
              {filteredCards.map((item, index) =>
                item.type === "heading" ? (
                  <li key={index} className="dropdown-heading">
                    <strong>{item.label}</strong>
                  </li>
                ) : (
                  <li
                    key={index}
                    onClick={() => handleCardSelection(item.card)}
                    style={{
                      padding: "10px",
                      cursor: "pointer",
                      borderBottom: index !== filteredCards.length - 1 ? "1px solid #eee" : "none",
                      backgroundColor: item.score > 0.8 ? "#f8fff0" : 
                                      item.score > 0.6 ? "#fff8e1" : "#fff"
                    }}
                    onMouseOver={(e) => (e.target.style.backgroundColor = "#f0f0f0")}
                    onMouseOut={(e) => (e.target.style.backgroundColor = 
                      item.score > 0.8 ? "#f8fff0" : 
                      item.score > 0.6 ? "#fff8e1" : "#fff")}
                  >
                    {highlightMatch(item.card, query)}
                    {item.score < 0.8 && (
                      <span style={{ 
                        float: "right", 
                        color: "#999", 
                        fontSize: "0.8em"
                      }}>
                        Similar
                      </span>
                    )}
                  </li>
                )
              )}
            </ul>
          )}
        </div>

        {showScrollButton && (
          <button 
            onClick={handleScrollDown}
            style={{
              position: "fixed",
              bottom: "350px",
              right: "20px",
              padding: isMobile ? "12px" : "10px 15px",
              backgroundColor: "#1e7145",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: isMobile ? "40px" : "auto",
              height: isMobile ? "40px" : "auto"
            }}
            aria-label="Scroll down"
          >
            {isMobile ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6"/>
              </svg>
            ) : (
              <span>Scroll Down</span>
            )}
          </button>
        )}

        {showNoCardMessage && (
          <div style={{ textAlign: "center", margin: "40px 0", fontSize: "20px", color: "red", fontWeight: "bold" }}>
            No offers for this card
          </div>
        )}

        {selectedCard && !hasAnyOffers() && !showNoCardMessage && (
          <div style={{ textAlign: "center", margin: "40px 0", fontSize: "20px", color: "#666" }}>
            No offers found for {selectedCard}
          </div>
        )}

        {selectedCard && hasAnyOffers() && (
          <div className="offer-section">
            {/* Permanent Offers - Displayed First */}
            {selectedPermanentOffers.length > 0 && (
              <div className="offer-container">
                <h2>Permanent Offers</h2>
                <div className="offer-row">
                  {selectedPermanentOffers.map((offer, index) => (
                    <div 
                      key={`permanent-${index}`} 
                      className="offer-card permanent-offer"
                    >
                      {offer["Image"] && (
                        <img 
                          src={offer["Image"]} 
                          alt={"Permanent Offer"} 
                          className="offer-image" style={{height:"170px"}}
                        />
                      )}
                      <p><strong>Benefit:</strong> {offer["Bus Ticket Benefit"]}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Abhibus Offers */}
            {selectedAbhibusOffers.length > 0 && (
              <div className="offer-container">
                <h2>Offers on Abhibus</h2>
                <div className="offer-row">
                  {selectedAbhibusOffers.map((offer, index) => (
                    <div 
                      key={`abhibus-${index}`} 
                      className={`offer-card ${expandedOfferIndex.abhibus === index ? 'expanded' : ''}`}
                    >
                      <p><strong>Description:</strong> {offer["Offer Description"]}</p>
                      
                      {offer["Code"] && (
                        <div className="promo-code-container">
                          <strong>Promo Code: </strong>
                          <span className="promo-code">{offer["Code"]}</span>
                          <div 
                            onClick={() => copyToClipboard(offer["Code"])}
                            className="copy-button"
                            title="Copy to clipboard"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                          </div>
                        </div>
                      )}
                      
                      {offer["Discount Amount"] && <p><strong>Discount:</strong> {offer["Discount Amount"]}</p>}
                      
                      <button 
                        onClick={() => toggleOfferDetails("abhibus", index)}
                        className={`details-btn ${expandedOfferIndex.abhibus === index ? "active" : ""}`}
                      >
                        {expandedOfferIndex.abhibus === index ? "Hide Terms & Conditions" : "Show Terms & Conditions"}
                      </button>
                      
                      <div className={`terms-container ${expandedOfferIndex.abhibus === index ? 'visible' : ''}`}>
                        <div className="terms-content">
                          <p>{offer["View Details"]}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cleartrip Offers */}
            {selectedCleartripOffers.length > 0 && (
              <div className="offer-container">
                <h2>Offers on Cleartrip</h2>
                <div className="offer-row">
                  {selectedCleartripOffers.map((offer, index) => (
                    <div 
                      key={`cleartrip-${index}`} 
                      className="offer-card"
                    >
                      {offer["Image"] && (
                        <img 
                          src={offer["Image"]} 
                          alt={"Cleartrip Offer"} 
                          className="offer-image"
                        />
                      )}
                      
                      <p><strong>Description:</strong> {offer["Offer Description"]}</p>
                      {offer["Discount Amount"] && <p><strong>Discount:</strong> {offer["Discount Amount"]}</p>}
                      
                      {offer["Booking Link"] && (
                        <a 
                          href={offer["Booking Link"]} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="offer-link"
                        >
                          <button className="view-details-btn">
                            View Offer
                          </button>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Confirmtkt Offers */}
            {selectedConfirmtktOffers.length > 0 && (
              <div className="offer-container">
                <h2>Offers on Confirmtkt</h2>
                <div className="offer-row">
                  {selectedConfirmtktOffers.map((offer, index) => (
                    <div 
                      key={`confirmtkt-${index}`} 
                      className={`offer-card ${expandedOfferIndex.confirmtkt === index ? 'expanded' : ''}`}
                    >
                      <p><strong>Description:</strong> {offer["Offer Description"]}</p>
                      
                      {offer["Code"] && (
                        <div className="promo-code-container">
                          <strong>Promo Code: </strong>
                          <span className="promo-code">{offer["Code"]}</span>
                          <div 
                            onClick={() => copyToClipboard(offer["Code"])}
                            className="copy-button"
                            title="Copy to clipboard"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                          </div>
                        </div>
                      )}
                      
                      {offer["Discount Amount"] && <p><strong>Discount:</strong> {offer["Discount Amount"]}</p>}
                      
                      <button 
                        onClick={() => toggleOfferDetails("confirmtkt", index)}
                        className={`details-btn ${expandedOfferIndex.confirmtkt === index ? "active" : ""}`}
                      >
                        {expandedOfferIndex.confirmtkt === index ? "Hide Terms & Conditions" : "Show Terms & Conditions"}
                      </button>
                      
                      <div className={`terms-container ${expandedOfferIndex.confirmtkt === index ? 'visible' : ''}`}>
                        <div className="terms-content">
                          <p>{offer["View Details"]}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ixigo Offers */}
            {selectedIxigoOffers.length > 0 && (
              <div className="offer-container">
                <h2>Offers on Ixigo</h2>
                <div className="offer-row">
                  {selectedIxigoOffers.map((offer, index) => (
                    <div 
                      key={`ixigo-${index}`} 
                      className={`offer-card ${expandedOfferIndex.ixigo === index ? 'expanded' : ''}`}
                    >
                      {offer["Offer Title"] && <h3>{offer["Offer Title"]}</h3>}
                      
                      {offer["Offer Code"] && (
                        <div className="promo-code-container">
                          <strong>Promo Code: </strong>
                          <span className="promo-code">{offer["Offer Code"]}</span>
                          <div 
                            onClick={() => copyToClipboard(offer["Offer Code"])}
                            className="copy-button"
                            title="Copy to clipboard"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                          </div>
                        </div>
                      )}
                      
                      {offer["Discount Amount"] && <p><strong>Discount:</strong> {offer["Discount Amount"]}</p>}
                      
                      <button 
                        onClick={() => toggleOfferDetails("ixigo", index)}
                        className={`details-btn ${expandedOfferIndex.ixigo === index ? "active" : ""}`}
                      >
                        {expandedOfferIndex.ixigo === index ? "Hide Terms & Conditions" : "Show Terms & Conditions"}
                      </button>
                      
                      <div className={`terms-container ${expandedOfferIndex.ixigo === index ? 'visible' : ''}`}>
                        <div className="terms-content">
                          <p>{offer["Details"]}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Paytm Offers */}
            {selectedPaytmOffers.length > 0 && (
              <div className="offer-container">
                <h2>Offers on Paytm</h2>
                <div className="offer-row">
                  {selectedPaytmOffers.map((offer, index) => (
                    <div 
                      key={`paytm-${index}`} 
                      className={`offer-card ${expandedOfferIndex.paytm === index ? 'expanded' : ''}`}
                    >
                      <p><strong>Description:</strong> {offer["Offer Description"]}</p>
                      {offer["Discount Amount"] && <p><strong>Discount:</strong> {offer["Discount Amount"]}</p>}
                      
                      {offer["Code"] && (
                        <div className="promo-code-container">
                          <strong>Promo Code: </strong>
                          <span className="promo-code">{offer["Code"]}</span>
                          <div 
                            onClick={() => copyToClipboard(offer["Code"])}
                            className="copy-button"
                            title="Copy to clipboard"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                          </div>
                        </div>
                      )}
                      
                      <button 
                        onClick={() => toggleOfferDetails("paytm", index)}
                        className={`details-btn ${expandedOfferIndex.paytm === index ? "active" : ""}`}
                      >
                        {expandedOfferIndex.paytm === index ? "Hide Terms & Conditions" : "Show Terms & Conditions"}
                      </button>
                      
                      <div className={`terms-container ${expandedOfferIndex.paytm === index ? 'visible' : ''}`}>
                        <div className="terms-content">
                          <p>{offer["View Details"]}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {selectedCard && !hasAnyOffers() && !showNoCardMessage ? null : (
        <p className="bottom-disclaimer">
          <h3>Disclaimer</h3> 
          All offers, coupons, and discounts listed on our platform are provided for informational purposes only. 
          We do not guarantee the accuracy, availability, or validity of any offer. Users are advised to verify 
          the terms and conditions with the respective merchants before making any purchase. We are not responsible 
          for any discrepancies, expired offers, or losses arising from the use of these coupons.
        </p>
      )}
    </div>
  );
};

export default CreditCardDropdown;