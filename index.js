// index.js
// Thunder Tactical AI backend + BigCommerce order lookup (CommonJS version)

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// --- ENV VARS (set in Render) ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const BC_STORE_HASH = process.env.BC_STORE_HASH;       
const BC_ACCESS_TOKEN = process.env.BC_ACCESS_TOKEN;   
const BC_API_URL = (
  process.env.BC_API_URL ||
  `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3`
).replace(/\/$/, "");

// Log environment status (no secrets)
console.log("BigCommerce ENV at startup:", {
  BC_STORE_HASH,
  BC_API_URL,
  hasAccessToken: !!BC_ACCESS_TOKEN,
});

// Root route
app.get("/", (req, res) => {
  res.send("Thunder Tactical AI Backend is running!");
});

// ---- ORDER LOOKUP FUNCTION ----
async function lookupOrderInBigCommerce(orderNumber) {
  if (!BC_STORE_HASH || !BC_ACCESS_TOKEN) {
    console.warn("Missing BigCommerce credentials");
    return {
      ok: false,
      message: "Order lookup is not configured correctly.",
    };
  }

  const url = `${BC_API_URL}/orders/${orderNumber}`;
  console.log("BigCommerce request URL:", url);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Auth-Token": BC_ACCESS_TOKEN,   // Correct header for Store API token
        "Accept": "application/json",
      },
    });

    if (response.status === 404) {
      return {
        ok: false,
        message: `I couldn't find an order with the number ${orderNumber}.`,
      };
    }

    if (!response.ok) {
      const text = await response.text();
      console.error("BigCommerce error:", response.status, text);
      return {
        ok: false,
        message:
          "I had trouble reaching the order system. Please try again in a moment.",
      };
    }

    const data = await response.json();
    const order = data.data || data;

    const status = order.status || order.status_id || "unknown";
    const created =
      order.date_created ||
      order.date_created_utc ||
      order.date_modified ||
      null;

    let reply = `I found order #${orderNumber}. Current status: ${status}.`;

    if (created) {
      const date = new Date(created);
      if (!isNaN(date.getTime())) {
        reply += ` Created on: ${date.toLocaleDateString("en-US")}.`;
      }
    }

    reply += " Let me know if you want tracking or item details.";

    return { ok: true, message: reply };
  } catch (err) {
    console.error("BigCommerce lookup failed:", err);
    return {
      ok: false,
      message: "Something went wrong while checking that order.",
    };
  }
}

// ---- AI CHAT ROUTE ----
app.post("/ai/chat", async (req, res) => {
  try {
    const userMessage = (req.body.message || "").toString().trim();

    if (!userMessage) {
      return res.status(400).json({ reply: "No message provided." });
    }

    // Detect 5–8 digit order number
    const orderNumberMatch = userMessage.match(/\b\d{5,8}\b/);

    if (orderNumberMatch) {
      const orderNumber = orderNumberMatch[0];
      const result = await lookupOrderInBigCommerce(orderNumber);
      return res.json({ reply: result.message });
    }

    // Otherwise use AI assistant
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful Thunder Tactical / Thunder Guns assistant. If the user asks about an order, ask for the order number unless they already provided it.",
        },
        { role: "user", content: userMessage },
      ],
    });

    const reply =
      response.choices[0]?.message?.content ||
      "I'm not sure how to answer that.";

    res.json({ reply });
  } catch (err) {
    console.error("AI Error:", err);
    res.status(500).json({ reply: "Error processing request." });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
