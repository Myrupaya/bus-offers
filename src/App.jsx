import React, { useState, useEffect } from "react";
import Papa from "papaparse";
import "./App.css";

const CreditCardDropdown = () => {
  const [cards, setCards] = useState([]); // Unique credit card names
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
            const data = result.data.filter((row) => row["Applicable cards"]); // Ensure valid data
            setOffers(data);

            let cardNames = [...new Set(data.map((row) => row["Applicable cards"]).filter(Boolean))];
            setCards(cardNames);
          },
        });
      });
  }, []);

  // Handle search input
  const handleSearch = (e) => {
    const value = e.target.value;
    setSearch(value);
    setErrorMessage(""); // Clear previous errors

    if (value === "") {
      setFilteredCards([]);
      setSelectedCard(null); // ✅ Remove previous offers when clearing input
      return;
    }

    const filtered = cards.filter((card) =>
      card.toLowerCase().startsWith(value.toLowerCase())
    );
    setFilteredCards(filtered);

    // Show error if user types a card that doesn't exist
    if (value && !filtered.length) {
      setErrorMessage("No offers found for this credit card.");
    } else {
      setErrorMessage("");
    }
  };

  // Handle card selection
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
    <div className="relative w-80 p-4">
      {/* Navbar */}
      <nav style={styles.navbar}>
        <div style={styles.logoContainer}>
          <a href="https://www.myrupaya.in/">
            <img
              src="https://static.wixstatic.com/media/f836e8_26da4bf726c3475eabd6578d7546c3b2~mv2.jpg/v1/crop/x_124,y_0,w_3152,h_1458/fill/w_909,h_420,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/dark_logo_white_background.jpg"
              alt="MyRupaya Logo"
              style={styles.logo}
            />
          </a>
          <div style={styles.linksContainer}>
            <a href="https://www.myrupaya.in/" style={styles.link}>
              Home
            </a>
          </div>
        </div>
      </nav>

      {/* Search Input */}
      <input
        type="text"
        value={search}
        onChange={handleSearch}
        placeholder="Search Credit Card..."
        className="w-full p-2 border rounded"
      />
  {search && filteredCards.length > 0 && (
    <ul>
      {filteredCards.map((card, index) => (
        <li
          key={index}
          className="hover:bg-gray-200 cursor-pointer"
          onClick={() => handleSelectCard(card)}
        >
          {card}
        </li>
      ))}
    </ul>
  )}

      {/* Show Error Message if No Offers Found */}
      {errorMessage && <p style={{ color: "red", fontWeight: "bold", marginTop: "10px" }}>{errorMessage}</p>}

      {/* Display Selected Card Details */}
{selectedCard && (
  <div className="mt-8 p-4 border rounded shadow-md" style={{ color: "white" ,  backgroundColor: "#39641D", marginTop:"20px", padding:"20px", borderRadius:"5px"}}>
    <h3 className="text-lg font-semibold">{selectedCard["Applicable cards"]}</h3>
    <p><strong>Website:</strong> {selectedCard["Website"]}</p>
    <p><strong>Offer:</strong> {selectedCard["Offers"]}</p>
    <a
      href={selectedCard["Offer link"]}
      target="_blank"
      rel="noopener noreferrer"
    >
      <button className="btn" style={{backgroundColor:"blue"}}>
        View Offer
      </button>
    </a>
  </div>
)}


    </div>
  );
};

// Styles
const styles = {
  navbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 20px",
    backgroundColor: "#CDD1C1",
  },
  logoContainer: {
    display: "flex",
    alignItems: "center",
  },
  logo: {
    width: "100px",
    height: "100px",
    marginRight: "20px",
  },
  linksContainer: {
    display: "flex",
    gap: "35px",
    flexWrap: "wrap",
    marginLeft: "40px",
  },
  link: {
    textDecoration: "none",
    color: "black",
    fontSize: "18px",
    fontFamily: "Arial, sans-serif",
    transition: "color 0.3s ease",
  },
  mobileMenuOpen: {
    display: "block",
  },
};

export default CreditCardDropdown;
