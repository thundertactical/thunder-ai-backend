// index.js - Thunder Tactical AI Backend (FULLY WORKING Dec 2025)

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// --- ENV VARS ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const BC_STORE_HASH = process.env.BC_STORE_HASH;
const BC_CLIENT_ID = process.env.BC_CLIENT_ID;           // ← needed!
const BC_ACCESS_TOKEN = process.env.BC_ACCESS_TOKEN;     // ← needed!
const BC_API_URL = `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3`;

// Root
app.get("/", (req, res) => {
  res.send("Thunder Tactical AI Backend is running!");
});

// BigCommerce order lookup
async function lookupOrderInBigCommerce(orderNumber) {
  try {
    const url = `${BC_API_URL}/orders/${orderNumber}`;
    console.log("Fetching order from:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Auth-Token": BC_ACCESS_TOKEN,
        "X-Auth-Client": BC_CLIENT_ID,          // ← THIS WAS THE MISSING PIECE
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    if (response.status === 404) {
      return {
        ok: false,
        message: `I couldn't find order #${orderNumber}. Please double-check the number and try again.`,
      };
    }

    if (!response.ok) {
      const text = await response.text();
      console.error("BC API Error:", response.status, text);
      return {
        ok: false,
        message: "Having trouble reaching BigCommerce right now — try again in a minute!",
      };
    }

    const { data: order } = await response.json();

    const dateCreated = new Date(order.date_created);

    let reply = `Order #${orderNumber} found!\n`;
    reply += `Status: **${order.status}**\n`;
    reply += `Placed on: ${dateCreated.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })}\n\n`;
    reply += `Want items, tracking number, or total? Just ask!`;

    return { ok: true, message: reply };

  } catch (err) {
    console.error("lookupOrderInBigCommerce failed:", err);
    return {
      ok: false,
      message: "Something broke while checking that order — we'll fix it ASAP.",
    };
  }
}

// AI Chat endpoint
app.post("/ai/chat", async (req, res) => {
  try {
    const userMessage = (req.body.message || "").toString().trim();
    if (!userMessage) return res.status(400).json({ reply: "Empty message." });

    // Detect 5–8 digit order number
    const orderMatch = userMessage.match(/\b\d{5,8}\b/);
    if (orderMatch) {
      const orderNumber = orderMatch[0];
      const result = await lookupOrderInBigCommerce(orderNumber);
      return res.json({ reply: result.message });
    }

    // Normal GPT response
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `You are Thunder Tactical's friendly AI assistant (airsoft, gel blasters, tactical gear).
          Be casual and fun. If someone asks about an order without giving a 5–8 digit number, politely ask for it.
          Never invent order details.`,
        },
        { role: "user", content: userMessage },
      ],
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ||
      "Hmm, not sure about that one!";

    res.json({ reply });
  } catch (err) {
    console.error("AI route error:", err);
    res
      .status(500)
      .json({ reply: "Oops! Something went wrong on our end. Try again in a sec." });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Thunder Tactical AI backend LIVE on port ${PORT}`);
});
