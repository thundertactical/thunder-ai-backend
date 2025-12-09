// index.js
// Thunder Tactical AI backend + BigCommerce order lookup

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

const BC_STORE_HASH = process.env.BC_STORE_HASH;      // e.g. n41kgeemsh
const BC_ACCESS_TOKEN = process.env.BC_ACCESS_TOKEN;  // "Access token" from BigCommerce
const BC_CLIENT_ID = process.env.BC_CLIENT_ID;        // "Client ID" from BigCommerce
const BC_API_URL = (process.env.BC_API_URL || `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3`).replace(/\/$/, "");

// Simple root route
app.get("/", (req, res) => {
  res.send("Thunder Tactical AI Backend is running!");
});

// ---- Helper: Try to look up an order in BigCommerce ----
async function lookupOrderInBigCommerce(orderNumber) {
  if (!BC_STORE_HASH || !BC_ACCESS_TOKEN || !BC_CLIENT_ID) {
    console.warn("BigCommerce env vars missing");
    return { ok: false, message: "Order lookup is not configured correctly." };
  }

  try {
    const url = `${BC_API_URL}/orders/${orderNumber}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Auth-Token": BC_ACCESS_TOKEN,
        "X-Auth-Client": BC_CLIENT_ID,
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    if (response.status === 404) {
      return {
        ok: false,
        message: `I couldn't find an order with the number ${orderNumber}. Please double-check the number.`,
      };
    }

    if (!response.ok) {
      const text = await response.text();
      console.error("BigCommerce error:", response.status, text);
      return {
        ok: false,
        message: "I had trouble reaching the order system. Please try again in a moment.",
      };
    }

    const data = await response.json();
    // v3 returns { data: {...}, meta: {...} }, v2 returns the object directly
    const order = data.data || data;

    const status = order.status || order.status_id || "unknown";
    const created =
      order.date_created ||
      order.date_created_utc ||
      order.date_modified ||
      null;

    let reply = `I found order #${orderNumber}. Current status: ${status}.`;

    if (created) {
      try {
        const date = new Date(created);
        if (!isNaN(date.getTime())) {
          reply += ` It was created on ${date.toLocaleDateString("en-US")}.`;
        }
      } catch {
        // ignore date parse errors
      }
    }

    reply += " If you need more details (items, totals, or tracking), please let me know.";

    return { ok: true, message: reply };
  } catch (err) {
    console.error("BigCommerce lookup failed:", err);
    return {
      ok: false,
      message: "Something went wrong while checking that order. Please try again shortly.",
    };
  }
}

// === AI CHAT ROUTE ===
app.post("/ai/chat", async (req, res) => {
  try {
    const userMessage = (req.body.message || "").toString().trim();
    if (!userMessage) {
      return res.status(400).json({ reply: "No message provided." });
    }

    // 1️⃣ Detect possible order-number questions
    const orderNumberMatch = userMessage.match(/\b\d{5,8}\b/); // e.g. 1312015
    const mentionsOrder =
      /order|tracking|shipment|shipping|status/i.test(userMessage);

    if (orderNumberMatch && mentionsOrder) {
      const orderNumber = orderNumberMatch[0];

      const result = await lookupOrderInBigCommerce(orderNumber);
      return res.json({ reply: result.message });
    }

    // 2️⃣ Fallback: normal AI assistant for general questions
    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful Thunder Tactical / Thunder Guns store assistant. Answer questions clearly about products, policies, shipping times, etc. If the customer asks about an order but does NOT include an order number, politely ask them to provide the order number so we can look it up.",
        },
        { role: "user", content: userMessage },
      ],
    });

    const reply = response.choices[0]?.message?.content || "I'm not sure how to answer that.";
    res.json({ reply });
  } catch (err) {
    console.error("AI Error:", err.response?.data || err.message || err);
    res.status(500).json({ reply: "Error processing request." });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
