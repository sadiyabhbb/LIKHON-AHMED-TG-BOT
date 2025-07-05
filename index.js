require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, {
  polling: true,
  fileDownloadOptions: {
    headers: {
      'User-Agent': 'Telegram Bot'
    }
  }
});

// Admin Username (without @)
const ADMIN_USERNAME = 'rx_rihad';

// User DB Paths
const DB_PATH = path.join(__dirname, 'users.json');
let userDB = { approved: [], pending: [], banned: [] };
if (fs.existsSync(DB_PATH)) {
  userDB = JSON.parse(fs.readFileSync(DB_PATH));
}
function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(userDB, null, 2));
}

// Local BIN Database
const binDatabase = {
  "515462": {
    "bank": "Example Bank",
    "country": "United States",
    "emoji": "🇺🇸",
    "scheme": "Visa",
    "type": "Credit",
    "level": "Standard"
  },
  "401288": {
    "bank": "Another Bank",
    "country": "United Kingdom",
    "emoji": "🇬🇧",
    "scheme": "Visa",
    "type": "Debit",
    "level": "Gold"
  },
  "510510": {
    "bank": "Sample Bank",
    "country": "Canada",
    "emoji": "🇨🇦",
    "scheme": "MasterCard",
    "type": "Credit",
    "level": "Platinum"
  }
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
    `💳 **Card Level:** ${binInfo.level}`;

  return {
    text: message,
    options: {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    }
  };
}

// /start Command with UID system
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || 'NoUsername';

  if (userDB.banned.includes(userId)) {
    return bot.sendMessage(chatId, '🚫 You are banned from using this bot.');
  }

  if (!userDB.approved.includes(userId)) {
    if (!userDB.pending.includes(userId)) {
      userDB.pending.push(userId);
      saveDB();

      bot.sendMessage(chatId, `⏳ Request sent. Please wait for admin approval.`);
      bot.sendMessage(chatId, `🧾 Your UID: \`${userId}\`\n\nSend this to the admin (@${ADMIN_USERNAME}) for approval.`, {
        parse_mode: "Markdown"
      });

      bot.sendMessage(ADMIN_USERNAME, `👤 New User Request\n\n🆔 UID: \`${userId}\`\n👤 Username: @${username}`, {
        parse_mode: "Markdown"
      });
    } else {
      bot.sendMessage(chatId, `⏳ You are already in pending list.\nPlease wait for approval.`);
    }
    return;
  }

  bot.sendMessage(chatId, `🎉 Bot is ready to use!\n\n💳 Generate CCs with:\n/gen 515462`);
});

// /gen Command (restricted)
bot.onText(/\/gen (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!userDB.approved.includes(userId)) {
    return bot.sendMessage(chatId, `⛔ You are not approved to use this bot.\nAsk @${ADMIN_USERNAME} for access.`);
  }

  const bin = match[1].trim().replace(/\D/g, '');
  if (!/^\d{6,}$/.test(bin)) {
    return bot.sendMessage(chatId, "⚠️ Please enter a valid BIN (6+ digits)\nExample: /gen 515462");
  }

  const cards = Array.from({ length: 20 }, () => generateValidCard(bin));
  const binInfo = await getBinInfo(bin.substring(0, 8));
  const message = createCCMessage(bin, binInfo, cards);

  await bot.sendMessage(chatId, message.text, message.options);
});

// /approve UID (admin only)
bot.onText(/\/approve (\d+)/, (msg, match) => {
  if (msg.from.username !== ADMIN_USERNAME) return;

  const uid = parseInt(match[1]);
  if (!userDB.approved.includes(uid)) {
    userDB.approved.push(uid);
    userDB.pending = userDB.pending.filter(id => id !== uid);
    saveDB();
    bot.sendMessage(uid, '✅ Your access has been approved by admin!');
    bot.sendMessage(msg.chat.id, `✅ Approved UID: \`${uid}\``, { parse_mode: 'Markdown' });
  } else {
    bot.sendMessage(msg.chat.id, `⚠️ UID \`${uid}\` is already approved.`, { parse_mode: 'Markdown' });
  }
});

// /ban UID (admin only)
bot.onText(/\/ban (\d+)/, (msg, match) => {
  if (msg.from.username !== ADMIN_USERNAME) return;

  const uid = parseInt(match[1]);
  userDB.banned.push(uid);
  userDB.approved = userDB.approved.filter(id => id !== uid);
  userDB.pending = userDB.pending.filter(id => id !== uid);
  saveDB();
  bot.sendMessage(uid, '🚫 You have been banned by admin.');
  bot.sendMessage(msg.chat.id, `🚫 Banned UID: \`${uid}\``, { parse_mode: 'Markdown' });
});

// BIN Information Lookup
async function getBinInfo(bin) {
  if (binDatabase[bin]) {
    return binDatabase[bin];
  }

  try {
    const response = await axios.get(`https://lookup.binlist.net/${bin}`);
    return {
      bank: response.data.bank?.name || "UNKNOWN BANK",
      country: response.data.country?.name || "UNKNOWN",
      emoji: response.data.country?.emoji || "",
      scheme: response.data.scheme?.toUpperCase() || "UNKNOWN",
      type: response.data.type?.toUpperCase() || "UNKNOWN",
      level: "N/A"
    };
  } catch (error) {
    console.error('Error fetching BIN info:', error.message);
    return {
      bank: "UNKNOWN BANK",
      country: "UNKNOWN",
      emoji: "",
      scheme: "UNKNOWN",
      type: "UNKNOWN",
      level: "N/A"
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
