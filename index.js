require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// Configuration
const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, {
  polling: true,
  fileDownloadOptions: {
    headers: {
      'User -Agent': 'Telegram Bot'
    }
  }
});

// Local BIN Database
const binDatabase = {
  "515462": {
    "bank": "Example Bank",
    "country": "United States",
    "emoji": "🇺🇸",
    "scheme": "Visa",
    "type": "Credit",
    "phone": "+1 800-123-4567",
    "level": "Standard",
    "address": "123 Example St, City, State, ZIP",
    "customer_service_hours": "Mon-Fri: 9 AM - 5 PM"
  },
  "401288": {
    "bank": "Another Bank",
    "country": "United Kingdom",
    "emoji": "🇬🇧",
    "scheme": "Visa",
    "type": "Debit",
    "phone": "+44 20 1234 5678",
    "level": "Gold",
    "address": "456 Another Rd, London, UK",
    "customer_service_hours": "Mon-Fri: 8 AM - 6 PM"
  },
  "510510": {
    "bank": "Sample Bank",
    "country": "Canada",
    "emoji": "🇨🇦",
    "scheme": "MasterCard",
    "type": "Credit",
    "phone": "+1 888-123-4567",
    "level": "Platinum",
    "address": "789 Sample Ave, Toronto, ON, Canada",
    "customer_service_hours": "Mon-Sun: 10 AM - 8 PM"
  },
  // Add more BINs with additional info as needed
};

// Luhn Algorithm Check
function luhnCheck(num) {
  let arr = (num + '').split('').reverse().map(x => parseInt(x));
  let lastDigit = arr.shift();
  let sum = arr.reduce((acc, val, i) =>
    (i % 2 !== 0 ? acc + val : acc + ((val * 2) % 9) || 9), 0);
  return (sum + lastDigit) % 10 === 0;
}

// Generate Valid Credit Cards
function generateValidCard(bin) {
  let cardNumber;
  do {
    cardNumber = bin + Math.floor(Math.random() * 1e10).toString().padStart(10, '0');
    cardNumber = cardNumber.substring(0, 16);
  } while (!luhnCheck(cardNumber));

  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const year = String(new Date().getFullYear() + Math.floor(Math.random() * 5)).slice(-2);
  const cvv = String(Math.floor(100 + Math.random() * 900));

  return `${cardNumber}|${month}|20${year}|${cvv}`;
}

// Message Formatter
function createCCMessage(bin, binInfo, cards) {
  const message =
    `💳 **Generated Credit Cards for BIN: ${bin}**\n\n` +
    `📋 **Tap any card below to copy:**\n\n` +
    cards.map(card => `\`${card}\``).join('\n') + 
    `\n\n🏦 **Bank:** ${binInfo.bank}\n` +
    `🌎 **Country:** ${binInfo.country} ${binInfo.emoji}\n` +
    `🔖 **Card Scheme:** ${binInfo.scheme}\n` +
    `🔖 **Card Type:** ${binInfo.type}\n` +
    `📞 **Customer Service Phone:** ${binInfo.phone}\n` +
    `🏢 **Bank Address:** ${binInfo.address}\n` +
    `🕒 **Customer Service Hours:** ${binInfo.customer_service_hours}\n` +
    `💳 **Card Level:** ${binInfo.level}`;

  return {
    text: message,
    options: {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    }
  };
}

// /start Command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  bot.sendMessage(chatId, `🎉 Bot is ready to use!\n\n💳 Generate CCs with:\n/gen 515462`);
});

// /gen Command
bot.onText(/\/gen (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const bin = match[1].trim().replace(/\D/g, '');

  if (!/^\d{6,}$/.test(bin)) {
    return bot.sendMessage(chatId, "⚠️ Please enter a valid BIN (6+ digits)\nExample: /gen 515462");
  }

  // Generate 20 valid credit cards
  const cards = Array.from({ length: 20 }, () => generateValidCard(bin));
  const binInfo = await getBinInfo(bin.substring(0, 8));
  const message = createCCMessage(bin, binInfo, cards);

  await bot.sendMessage(chatId, message.text, message.options);
});

// BIN Information Lookup
async function getBinInfo(bin) {
  // Check local BIN database first
  if (binDatabase[bin]) {
    return binDatabase[bin];
  }

  // If not found, make an API call
  try {
    const response = await axios.get(`https://lookup.binlist.net/${bin}`);
    return {
      bank: response.data.bank?.name || "UNKNOWN BANK",
      country: response.data.country?.name || "UNKNOWN",
      emoji: response.data.country?.emoji || "",
      scheme: response.data.scheme?.toUpperCase() || "UNKNOWN",
      type: response.data.type?.toUpperCase() || "UNKNOWN",
      phone: "N/A",
      level: "N/A",
      address: "N/A",
      customer_service_hours: "N/A"
    };
  } catch (error) {
    console.error('Error fetching BIN info:', error.message);
    return {
      bank: "UNKNOWN BANK",
      country: "UNKNOWN",
      emoji: "",
      scheme: "UNKNOWN",
      type: "UNKNOWN",
      phone: "N/A",
      level: "N/A",
      address: "N/A",
      customer_service_hours: "N/A"
    };
  }
}

// Keep-alive HTTP Server
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html>
      <head><title>Telegram CC Generator</title></head>
      <body style="font-family: Arial; text-align: center; margin-top: 50px;">
        <h2>Telegram CC Generator Bot</h2>
        <p>✅ Bot is Running Successfully</p>
      </body>
    </html>
  `);
}).listen(process.env.PORT || 3000);

console.log('✅ Bot is running...');
