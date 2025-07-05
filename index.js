require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');
const fs = require('fs');
const path = require('path');
const speakeasy = require('speakeasy');

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

// Admin Info
const ADMIN_USERNAME = 'rx_rihad';
const ADMIN_UID = 7933110913;

// User DB Paths
const DB_PATH = path.join(__dirname, 'users.json');
let userDB = { approved: [], pending: [], banned: [] };
if (fs.existsSync(DB_PATH)) {
  userDB = JSON.parse(fs.readFileSync(DB_PATH));
}
function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(userDB, null, 2));
}

// Admin Notification Function
function notifyAdmin(uid, username, isRepeat = false) {
  const status = isRepeat ? "⏳ Already Pending" : "📩 Pending Approval";
  const cleanUsername = username.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
  const message = 
    `👤 *New Access Request*\n\n` +
    `🆔 UID: \`${uid}\`\n` +
    `🔗 Username: @${cleanUsername}\n` +
    `📩 Status: ${status}\n\n` +
    `🛂 *Action Needed:*\n` +
    `✅ /approve \`${uid}\`\n` +
    `🗑️ /remove \`${uid}\`\n` +
    `🚫 /ban \`${uid}\``;

  bot.sendMessage(ADMIN_UID, message, { parse_mode: 'MarkdownV2' });
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
  }
};

// Luhn Check
function luhnCheck(num) {
  let arr = (num + '').split('').reverse().map(x => parseInt(x));
  let lastDigit = arr.shift();
  let sum = arr.reduce((acc, val, i) =>
    (i % 2 !== 0 ? acc + val : acc + ((val * 2) % 9) || 9), 0);
  return (sum + lastDigit) % 10 === 0;
}

// Generate Cards
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

// Format Message
function createCCMessage(bin, binInfo, cards) {
  const message =
    `💳 *Generated Credit Cards for BIN:* \`${bin}\`\n\n` +
    `📋 *Tap any card below to copy:*\n\n` +
    cards.map(card => `\`${card}\``).join('\n') + 
    `\n\n🏦 *Bank:* ${binInfo.bank}\n` +
    `🌎 *Country:* ${binInfo.country} ${binInfo.emoji}\n` +
    `🔖 *Card Scheme:* ${binInfo.scheme}\n` +
    `🔖 *Card Type:* ${binInfo.type}\n` +
    `💳 *Card Level:* ${binInfo.level}`;

  return {
    text: message,
    options: {
      parse_mode: 'Markdown'
    }
  };
}

// 2FA Command (Fixed for Facebook-style keys)
bot.onText(/\/2fa (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const rawKey = match[1].trim();
  const secretKey = rawKey.replace(/\s+/g, ''); // সব স্পেস বাদ

  try {
    const code = speakeasy.totp({
      secret: secretKey,
      encoding: 'base32',
      digits: 6,
      step: 30
    });

    bot.sendMessage(chatId, `🔐 *Your 2FA Code:*\n\`${code}\``, {
      parse_mode: 'Markdown',
      reply_to_message_id: msg.message_id
    });

  } catch (error) {
    bot.sendMessage(chatId, "❌ Invalid Secret Key (Base32 not detected)", {
      reply_to_message_id: msg.message_id
    });
  }
});

// /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || 'NoUsername';

  if (username === ADMIN_USERNAME || userId === ADMIN_UID) {
    return bot.sendMessage(chatId, `🎉 Welcome Admin!\nBot is ready to use!\n\n💳 Try /gen 515462`);
  }

  if (userDB.banned.includes(userId)) {
    return bot.sendMessage(chatId, '🚫 You are banned from using this bot.');
  }

  if (!userDB.approved.includes(userId)) {
    if (!userDB.pending.includes(userId)) {
      userDB.pending.push(userId);
      saveDB();
      bot.sendMessage(chatId, `⏳ Request sent. Please wait for admin approval.`);
      bot.sendMessage(chatId, `🧾 Your UID: \`${userId}\`\nSend this to the admin (@${ADMIN_USERNAME}) for approval.`, {
        parse_mode: "Markdown"
      });
      notifyAdmin(userId, username);
    } else {
      bot.sendMessage(chatId, `⏳ You are already in pending list.\n\n🧾 Your UID: \`${userId}\``, {
        parse_mode: "Markdown"
      });
      notifyAdmin(userId, username, true);
    }
    return;
  }

  bot.sendMessage(chatId, `🎉 Bot is ready to use!\n\n💳 Generate CCs with:\n/gen 515462`);
});

// /gen command
bot.onText(/\/gen (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId !== ADMIN_UID && !userDB.approved.includes(userId)) {
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

// /approve
bot.onText(/\/approve (\d+)/, (msg, match) => {
  if (msg.from.username !== ADMIN_USERNAME && msg.from.id !== ADMIN_UID) return;

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

// /ban
bot.onText(/\/ban (\d+)/, (msg, match) => {
  if (msg.from.username !== ADMIN_USERNAME && msg.from.id !== ADMIN_UID) return;

  const uid = parseInt(match[1]);
  userDB.banned.push(uid);
  userDB.approved = userDB.approved.filter(id => id !== uid);
  userDB.pending = userDB.pending.filter(id => id !== uid);
  saveDB();
  bot.sendMessage(uid, '🚫 You have been banned by admin.');
  bot.sendMessage(msg.chat.id, `🚫 Banned UID: \`${uid}\``, { parse_mode: 'Markdown' });
});

// /remove
bot.onText(/\/remove (\d+)/, (msg, match) => {
  if (msg.from.username !== ADMIN_USERNAME && msg.from.id !== ADMIN_UID) return;

  const uid = parseInt(match[1]);
  userDB.pending = userDB.pending.filter(id => id !== uid);
  userDB.approved = userDB.approved.filter(id => id !== uid);
  saveDB();
  bot.sendMessage(msg.chat.id, `🗑️ Removed UID: \`${uid}\``, { parse_mode: 'Markdown' });
});

// /users
bot.onText(/\/users/, (msg) => {
  if (msg.from.username !== ADMIN_USERNAME && msg.from.id !== ADMIN_UID) return;

  const format = (arr) => arr.length ? arr.map(id => `\`${id}\``).join(', ') : '_None_';
  const message = 
    `👥 *User  List:*\n\n` +
    `✅ *Approved:* ${format(userDB.approved)}\n` +
    `🕓 *Pending:* ${format(userDB.pending)}\n` +
    `🚫 *Banned:* ${format(userDB.banned)}`;

  bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
});

// .chk command
bot.onText(/\.chk (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || 'NoUsername';

  if (userId !== ADMIN_UID && !userDB.approved.includes(userId)) {
    return bot.sendMessage(chatId, `⛔ You are not approved to use this bot.\nAsk @${ADMIN_USERNAME} for access.`);
  }

  const card = match[1].trim();
  if (!/^\d{15,16}\|\d{2}\|\d{4}\|\d{3}$/.test(card)) {
    return bot.sendMessage(chatId, '⚠️ Invalid format.\nCorrect: `xxxx|mm|yyyy|cvv`', { parse_mode: 'Markdown' });
  }

  bot.sendMessage(chatId, `🔁 Checking your card via chkr.cc...`);

  try {
    const res = await axios.get(`https://chkr.cc/api/chk?cards=${card}`);
    const result = res.data?.result?.[0];

    const status = result?.status || 'unknown';
    const msgText = result?.msg || 'No message';

    let icon = '❓';
    if (status === 'live') icon = '✅🟢';
    else if (status === 'dead') icon = '❌🔴';
    else if (status === 'unknown') icon = '⚠️❓';

    const message = 
      `\`${card}\`\n` +
      `${icon} *${status.toUpperCase()}*\n` +
      `ℹ️ ${msgText}\n\n` +
      `👤 Checked by: @${username}`;

    bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
  } catch {
    bot.sendMessage(chatId, '❌ Error contacting chkr.cc API.');
  }
});

// .mass command
bot.onText(/\.mass/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const username = msg.from.username || 'NoUsername';

  if (userId !== ADMIN_UID && !userDB.approved.includes(userId)) {
    return bot.sendMessage(chatId, `⛔ You are not approved to use this bot.\nAsk @${ADMIN_USERNAME} for access.`);
  }

  const replyMsg = msg.reply_to_message?.text;
  if (!replyMsg) return bot.sendMessage(chatId, '❌ Reply to a message containing CCs to use `.mass`');

  const cards = replyMsg
    .split('\n')
    .map(l => l.trim())
    .filter(l => /^\d{15,16}\|\d{2}\|\d{4}\|\d{3}$/.test(l));

  if (!cards.length) return bot.sendMessage(chatId, '⚠️ No valid CCs found in replied message.');

  bot.sendMessage(chatId, `🔁 Checking ${cards.length} cards via chkr.cc...`);

  let responseText = `👤 ${username} - .mass\n\n`;

  for (const card of cards) {
    try {
      const res = await axios.get(`https://chkr.cc/api/chk?cards=${card}`);
      const result = res.data?.result?.[0];

      const status = result?.status || 'unknown';
      const msg = result?.msg || 'No message';

      let icon = '❓';
      if (status === 'live') icon = '✅🟢';
      else if (status === 'dead') icon = '❌🔴';
      else if (status === 'unknown') icon = '⚠️❓';

      responseText += `\`${card}\`\n${icon} *${status.toUpperCase()}* - ${msg}\n\n`;
    } catch {
      responseText += `\`${card}\`\n⚠️ API error\n\n`;
    }
  }

  bot.sendMessage(chatId, responseText.trim(), { parse_mode: 'Markdown' });
});

// BIN Lookup
async function getBinInfo(bin) {
  if (binDatabase[bin]) return binDatabase[bin];

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
  } catch {
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

// Check Email Functionality
const DOMAINS = [
  '@iicloud.com.vn',
  '@mail10s.top',
  '@hotmail999.com',
  '@mailshopee.io.vn',
  '@gmail.com'
];

async function checkEmail(username, chatId) {
  try {
    let found = false;

    for (const domain of DOMAINS) {
      const email = `${username}${domain}`;
      const apiUrl = `https://hotmail999.com/api/get_mail.php?email=${encodeURIComponent(email)}`;

      try {
        const { data } = await axios.get(apiUrl);

        if (data?.status && data?.data?.length > 0) {
          const mail = data.data[0];
          const msg = `
📭 *ইমেইল পাওয়া গেছে!*
✉️ *ঠিকানা:* \`${email}\`
🕒 *সময়:* ${mail.date || 'Unknown'}
📧 *প্রেরক:* ${mail.from_field || 'Unknown'}
📝 *বিষয়:* ${mail.subject || 'No Subject'}
🔢 *OTP কোড:* \`${mail.code || 'Not Found'}\`
          `;

          await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
          found = true;
          break;
        }
      } catch (error) {
        console.error(`Error checking ${email}:`, error.message);
      }
    }

    if (!found) {
      await bot.sendMessage(chatId, `❌ ${username} নামে কোনো ইমেইল পাওয়া যায়নি`);
    }

  } catch (error) {
    console.error('General error:', error);
    bot.sendMessage(chatId, '⚠️ সার্ভারে সমস্যা হচ্ছে, পরে চেষ্টা করুন');
  }
}

// /checkemail command
bot.onText(/\/checkemail (.+)/, (msg, match) => {
  const username = match[1].trim();
  checkEmail(username, msg.chat.id);
});

// Keep-alive
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<h2>✅ Telegram Bot Running</h2>`);
}).listen(process.env.PORT || 3000);

console.log('✅ Bot is running...');
