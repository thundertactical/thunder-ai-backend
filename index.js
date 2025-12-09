// index.js - Thunder Tactical AI Backend (Working Dec 2025)

const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// --- ENV VARS (set in Render dashboard) ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const BC_STORE_HASH = process.env.BC_STORE_HASH;          // e.g. ozdk0sl2gq
const BC_ACCESS_TOKEN = process.env.BC_ACCESS_TOKEN;      // Your BigCommerce "X-Auth-Token"
const BC_API_URL = `https://api.bigcommerce.com/stores/${BC_STORE_HASH}/v3`;

// Root route
app.get("/", (req, res) => {
  res.send("Thunder Tactical AI Backend is running! 🤠");
});

// Helper: Look up order in BigCommerce
async function lookupOrderInBigCommerce(orderNumber) {
  if (!BC_STORE_HASH || !BC_ACCESS_TOKEN) {
    console.warn("BigCommerce credentials missing in env");
    return { ok: false, message: "Order lookup not configured." };
  }

  try {
    const url = `${BC_API_URL}/orders/${orderNumber}`;
    console.log("Fetching order from:", url);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Auth-Token": BC_ACCESS_TOKEN,
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

    const json = await response.json();
    const order = json.data;

    const status = order.status;
    const dateCreated = new Date(order.date_created);

    let reply = `Order #${orderNumber} found! ✅\n`;
    reply += `Status: **${status}**\n`;
    reply += `Placed on: ${dateCreated.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })}\n`;
    reply += `\nNeed tracking number, items, or total? Just say the word!`;

    return { ok: true, message: reply };

  } catch (err) {
    console.error("lookupOrderInBigCommerce failed:", err);
    return {
      ok: false,
      message: "Something broke while checking that order — we'll fix it ASAP.",
    };
  }
}

// === MAIN AI CHAT ENDPOINT ===
app.post("/ai/chat", async (req, res) => {
  try {
    const userMessage = (req.body.message || "").toString().trim();
    if (!userMessage) {
      return res.status(400).json({ reply: "Empty message." });
    }

    // Look for 5–8 digit order number
    const orderMatch = userMessage.match(/\b\d{5,8}\b/);
    if (orderMatch) {
      const orderNumber = orderMatch[0];
      const result = await lookupOrderInBigCommerce(orderNumber);

      // If we got a real order OR a polite "not found", return it directly
      return res.json({ reply: result.message });
    }

    // === No order number → normal GPT response ===
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // ← CORRECT model name in 2025 (gpt-4.1-mini does NOT exist)
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `You are Thunder Tactical's friendly AI assistant.
          Store: Thunder Guns / Thunder Tactical (airsoft, gel blasters, tactical gear).
          Be helpful, casual, and a little fun. 
          If someone asks about an order but doesn't give a number → politely ask for the 5–8 digit order number.
          Never make up order info.`,
        },
        { role: "user", content: userMessage },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim() ||
                  "Hmm, not sure about that one!";

    res.json({ reply });

  } catch (err) {
    console.error("AI route error:", err.message || err);

    // Helpful error for common mistake
    if (err.message?.includes("invalid_api_key")) {
      return res.status(500).json({ reply: "OpenAI API key is missing or invalid." });
    }

    res.status(500).json({ reply: "Oops! Something went wrong on our end. Try again in a sec." });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Thunder Tactical AI backend LIVE on port ${PORT}`);
});
