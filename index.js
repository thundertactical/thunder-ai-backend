// index.js
// Thunder Tactical AI backend + BigCommerce order lookup

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// ===== OpenAI SETUP =====
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===== BIGCOMMERCE SETUP =====
const BC_API_URL = process.env.BC_API_URL;          // e.g. https://api.bigcommerce.com/stores/n41kgeemsh/v3
const BC_ACCESS_TOKEN = process.env.BC_ACCESS_TOKEN;

// Helper: look up an order in BigCommerce
async function lookupOrder({ email, orderNumber }) {
  try {
    if (!BC_API_URL || !BC_ACCESS_TOKEN) {
      console.warn("BigCommerce env vars missing, skipping lookup");
      return null;
    }

    const params = new URLSearchParams();

    // Search by order ID
    if (orderNumber) {
      params.append("id", orderNumber);
    }

    // Search by customer email
    if (email) {
      params.append("email:like", email);
    }

    // If we have no filters, don't call BC
    if ([...params.keys()].length === 0) {
      return null;
    }

    const url = `${BC_API_URL}/orders?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Auth-Token": BC_ACCESS_TOKEN,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("BigCommerce error:", response.status, text);
      return null;
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      return null;
    }

    // Return the first matching order
    return data.data[0];
  } catch (err) {
    console.error("BigCommerce lookup error:", err);
    return null;
  }
}

// ===== MAIN CHAT ROUTE =====
app.post("/ai/chat", async (req, res) => {
  try {
    const userMessage = req.body.message || "";

    // --- Try to extract an email & order number from the user's message ---
    const emailMatch = userMessage.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const orderMatch = userMessage.match(/\b\d{5,}\b/); // any 5+ digit number

    const email = emailMatch ? emailMatch[0] : null;
    const orderNumber = orderMatch ? orderMatch[0] : null;

    let orderData = null;

    if (email || orderNumber) {
      orderData = await lookupOrder({ email, orderNumber });
    }

    // --- Build system prompt for the model ---
    let systemPrompt =
      "You are a helpful Thunder Tactical store assistant. Answer questions clearly and professionally.";

    if (orderData) {
      const status = orderData.status || orderData.status_id;
      const orderId = orderData.id;
      const dateCreated = orderData.date_created;
      const total = orderData.total_inc_tax;

      systemPrompt +=
        ` You have live order info for this conversation. ` +
        `Order details: ID ${orderId}, status ${status}, created ${dateCreated}, total ${total}. ` +
        `If the customer is asking 'where is my order' or similar, use this data to answer.`;
    } else if (email || orderNumber) {
      systemPrompt +=
        " An order lookup was attempted with the details the customer typed, " +
        "but no order was found. Politely explain that you couldn't locate an order " +
        "with those details and ask them to double-check their email and order number.";
    }

    // --- Ask OpenAI to generate the reply ---
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    });

    const reply = response.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error("AI Error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "AI request failed" });
  }
});

// Simple health check
app.get("/", (req, res) => {
  res.send("Thunder Tactical AI Backend is running!");
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
