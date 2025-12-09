const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// =============================
//  OPENAI CLIENT
// =============================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// =============================
//  BIGCOMMERCE ORDER LOOKUP
// =============================
async function lookupOrder(email, orderNumber) {
  const storeHash = process.env.BC_STORE_HASH;
  const accessToken = process.env.BC_ACCESS_TOKEN;
  const apiUrl = process.env.BC_API_URL;

  let url = `${apiUrl}/orders`;
  const params = new URLSearchParams();

  if (email) params.append("email", email);
  if (orderNumber) params.append("id:in", orderNumber);

  url += `?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Auth-Token": accessToken,
      "Content-Type": "application/json",
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    console.error("BigCommerce API ERROR:", await response.text());
    return null;
  }

  const data = await response.json();

  if (!data || !data.data || data.data.length === 0) return null;

  return data.data[0];
}

// =============================
//  AI CHAT ENDPOINT
// =============================
app.post("/ai/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;

    // Extract email
    const emailMatch = userMessage.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0] : null;

    // Extract order number (6–10 digits)
    const orderMatch = userMessage.match(/\b\d{6,10}\b/);
    const orderNumber = orderMatch ? orderMatch[0] : null;

    let orderData = null;

    if (email || orderNumber) {
      orderData = await lookupOrder(email, orderNumber);
    }

    let contextMessage = "";

    if (orderData) {
      const tracking = orderData.shipping_addresses?.[0]?.tracking_number || "No tracking yet";

      contextMessage = `
Order Lookup Result:
Order ID: ${orderData.id}
Status: ${orderData.status}
Payment Status: ${orderData.payment_status}
Shipping Status: ${orderData.shipping_status}
Tracking Number: ${tracking}
Order Date: ${orderData.date_created}
      `;
    } else if (email || orderNumber) {
      contextMessage = "No matching order was found.";
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Thunder Tactical customer support AI. If order lookup data is provided, summarize it clearly. If no order is found, politely request missing information."
        },
        { role: "user", content: userMessage },
        { role: "system", content: contextMessage }
      ]
    });

    const reply = response.choices[0].message.content;
    res.json({ reply });

  } catch (err) {
    console.error("AI ERROR:", err.response?.data || err.message || err);
    res.status(500).json({ error: "AI request failed" });
  }
});

// =============================
// ROOT ROUTE
// =============================
app.get("/", (req, res) => {
  res.send("Thunder Tactical AI Backend is running!");
});

// =============================
// START SERVER
// =============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
