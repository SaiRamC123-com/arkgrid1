const Groq = require("groq-sdk");

if (!process.env.GROQ_API_KEY) console.warn("GROQ_API_KEY missing: AI features are disabled");

module.exports = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;