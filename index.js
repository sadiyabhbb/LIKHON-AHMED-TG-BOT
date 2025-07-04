require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

// Configuration
const token = process.env.BOT_TOKEN;
const forceJoinChannel = process.env.CHANNEL_USERNAME;

const bot = new TelegramBot(token, {
  polling: true,
  fileDownloadOptions: {
    headers: {
      'User-Agent': 'Telegram Bot'
    }
  }
});

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

// Message Formatter (Updated)
function createCCMessage(bin, binInfo, cards) {
  const message =
    `💳 Generated CC (${bin})\n\n` +
    `📋 Tap any card below to copy:\n\n` +
    cards.map(card => `\`${card}\``).join('\n') + 
    `\n\n🏦 Bank: ${binInfo.bank}\n` +
    `🌎 Country: ${binInfo.country} ${binInfo.emoji}\n` +
    `🔖 Type: ${binInfo.type}`;

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
  const userId = msg.from.id;

  try {
    const member = await bot.getChatMember(`@${forceJoinChannel}`, userId);
    if (["left", "kicked"].includes(member.status)) {
      return bot.sendMessage(chatId, `🚫 Please join our channel first: https://t.me/${forceJoinChannel}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Join Channel", url: `https://t.me/${forceJoinChannel}` }],
            [{ text: "🔄 Check Join Status", callback_data: "check_join" }]
          ]
        }
      });
    }
    bot.sendMessage(chatId, `🎉 Bot is ready to use!\n\n💳 Generate CCs with:\n/gen 515462`);
  } catch (error) {
    console.error('Error in /start command:', error.message);
    bot.sendMessage(chatId, '❌ Server error, please try again later');
  }
});

// /gen Command
bot.onText(/\/gen (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const bin = match[1].trim().replace(/\D/g, '');

  try {
    const member = await bot.getChatMember(`@${forceJoinChannel}`, userId);
    if (["left", "kicked"].includes(member.status)) {
      return bot.sendMessage(chatId, `🚫 Please join our channel first: @${forceJoinChannel}`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Join Channel", url: `https://t.me/${forceJoinChannel}` }],
            [{ text: "🔄 Check Join Status", callback_data: "check_join" }]
          ]
        }
      });
    }
  } catch (error) {
    return bot.sendMessage(chatId, '❌ Server error, please try again later');
  }

  if (!/^\d{6,}$/.test(bin)) {
    return bot.sendMessage(chatId, "⚠️ Please enter a valid BIN (6+ digits)\nExample: /gen 515462");
  }

  const cards = Array.from({ length: 10 }, () => generateValidCard(bin));
  const binInfo = await getBinInfo(bin.substring(0, 8));
  const message = createCCMessage(bin, binInfo, cards);

  await bot.sendMessage(chatId, message.text, message.options);
});

// BIN Information Lookup
async function getBinInfo(bin) {
  try {
    const response = await axios.get(`https://lookup.binlist.net/${bin}`);
    return {
      bank: response.data.bank?.name || "UNKNOWN BANK",
      country: response.data.country?.name || "UNKNOWN",
      emoji: response.data.country?.emoji || "",
      scheme: response.data.scheme?.toUpperCase() || "UNKNOWN",
      type: response.data.type?.toUpperCase() || "UNKNOWN"
    };
  } catch (error) {
    console.error('Error fetching BIN info:', error.message);
    return {
      bank: "UNKNOWN BANK",
      country: "UNKNOWN",
      emoji: "",
      scheme: "UNKNOWN",
      type: "UNKNOWN"
    };
  }
}

// Check Join Button Callback
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const userId = callbackQuery.from.id;
  const messageId = callbackQuery.message.message_id;

  try {
    const member = await bot.getChatMember(`@${forceJoinChannel}`, userId);
    
    if (["left", "kicked"].includes(member.status)) {
      await bot.editMessageText(
        `🚫 You still haven't joined our channel. Please join first: https://t.me/${forceJoinChannel}`,
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Join Channel", url: `https://t.me/${forceJoinChannel}` }],
              [{ text: "🔄 Check Join Status", callback_data: "check_join" }]
            ]
          }
        }
      );
    } else {
      await bot.editMessageText(
        "🎉 Thank you! You've joined the channel. You can now use the bot.\n\n💳 Generate CCs with:\n/gen 515462",
        {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] }
        }
      );
    }
  } catch (error) {
    console.error('Error checking join status:', error.message);
    await bot.editMessageText(
      "❌ Server error, please try again later",
      {
        chat_id: chatId,
        message_id: messageId
      }
    );
  }
  
  bot.answerCallbackQuery(callbackQuery.id);
});

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
