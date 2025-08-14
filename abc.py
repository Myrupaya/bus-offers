import pandas as pd
import re

# Load your CSV
df = pd.read_csv("Abhibus 13 Aug Offers.csv", encoding="ISO-8859-1")

# Function to split card names properly
def split_credit_cards(row):
    raw_text = str(row['Eligible Credit Cards'])

    # Normalize all line breaks to commas
    normalized = re.sub(r'[\r\n]+', ',', raw_text)

    # Replace " and " with comma (as a delimiter)
    normalized = re.sub(r'\s+and\s+', ',', normalized, flags=re.IGNORECASE)

    # Now split on commas, but not commas inside parentheses
    cards = re.split(r',(?![^(]*\))', normalized)

    # Trim and clean
    return [card.strip() for card in cards if card.strip()]

# Expand rows
expanded_rows = []

for _, row in df.iterrows():
    cards = split_credit_cards(row)
    for card in cards:
        new_row = row.copy()
        new_row['Eligible Credit Cards'] = card
        expanded_rows.append(new_row)

# Create new DataFrame
new_df = pd.DataFrame(expanded_rows)

# Save to cleaned CSV
new_df.to_csv("Abhibus.csv", index=False)
print("✅ File saved as Bookmyshow.csv")