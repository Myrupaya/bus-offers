import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import "./App.css";

const CreditCardDropdown = () => {
  const [cards, setCards] = useState([]);
  const [search, setSearch] = useState("");
  const [filteredCards, setFilteredCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [offers, setOffers] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetch("/Buses_Offers_Processed.csv")
      .then((response) => response.text())
      .then((csvData) => {
        Papa.parse(csvData, {
          header: true,
          complete: (result) => {
            const data = result.data.filter((row) => row["Applicable cards"]);
            setOffers(data);
            let cardNames = [...new Set(data.map((row) => row["Applicable cards"]).filter(Boolean))];
            setCards(cardNames);
          },
        });
      });
  }, []);

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearch(value);
    setErrorMessage("");

    if (value === "") {
      setFilteredCards([]);
      setSelectedCard(null);
      return;
    }

    const filtered = cards.filter((card) =>
      card.toLowerCase().startsWith(value.toLowerCase())
    );
    setFilteredCards(filtered);

    if (value && !filtered.length) {
      setErrorMessage("No offers found for this credit card.");
    } else {
      setErrorMessage("");
    }
  };

  const handleSelectCard = (cardName) => {
    setSearch(cardName);
    setFilteredCards([]);

    const cardDetails = offers.find((offer) => offer["Applicable cards"] === cardName);

    if (cardDetails) {
      setSelectedCard(cardDetails);
      setErrorMessage("");
    } else {
      setSelectedCard(null);
      setErrorMessage("No offers found for this credit card.");
    }
  };

  return (
    <div className="main-container">

      {/* Title */}
      <div className="title-container">
        <h1 className="main-title">Hotel Offers</h1>
      </div>

      {/* Split Section */}
      <div className="split-section">
        <div className="text-section">
          <h2>Find the Best Hotel Offers</h2>
          <p>
            Discover exclusive discounts and cashback offers on hotel bookings when you use your credit or debit card. 
            Our platform aggregates the best hotel offers from multiple travel portals to help you save money on your 
            next stay. Simply search for your card to see available offers.
          </p>
        </div>
        <div className="image-section">
          <img 
            src="" 
            alt="Hotel offers" 
            className="responsive-image" 
          />
        </div>
      </div>

      {/* Search Section */}
      <div className="search-section">
        <input
          type="text"
          value={search}
          onChange={handleSearch}
          placeholder="Search Credit Card..."
          className="search-input"
        />
        
        {search && filteredCards.length > 0 && (
          <ul className="dropdown-list">
            {filteredCards.map((card, index) => (
              <li
                key={index}
                className="dropdown-item"
                onClick={() => handleSelectCard(card)}
              >
                {card}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Error Message */}
      {errorMessage && <p className="error-message">{errorMessage}</p>}

      {/* Offer Details */}
      {selectedCard && (
        <div className="offer-details">
          <h3>{selectedCard["Applicable cards"]}</h3>
          <p><strong>Website:</strong> {selectedCard["Website"]}</p>
          <p><strong>Offer:</strong> {selectedCard["Offers"]}</p>
          <a
            href={selectedCard["Offer link"]}
            target="_blank"
            rel="noopener noreferrer"
            className="btn"
          >
            View Offer
          </a>
        </div>
      )}
    </div>
  );
};

export default CreditCardDropdown;