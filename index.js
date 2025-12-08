const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// === AI CHAT ROUTE ===
app.post("/ai/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful Thunder Tactical store assistant. Answer questions clearly and professionally."
        },
        { role: "user", content: userMessage }
      ]
    });

    const reply = response.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error("AI Error:", err.response?.data || err.message || err);
    res.status(500).json({ error: "AI request failed" });
  }
});

// Simple root route
app.get("/", (req, res) => {
  res.send("Thunder Tactical AI Backend is running!");
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
