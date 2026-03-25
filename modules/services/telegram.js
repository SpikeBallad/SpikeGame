const TelegramBot = require('node-telegram-bot-api');
class TelegramService {
  constructor({ token, chatId }) {
    if (!token || !chatId) { console.warn('[Telegram] Disabled'); this.bot = null; return; }
    this.bot = new TelegramBot(token, { polling: false }); this.chatId = chatId;
  }
  async sendMessage(text) {
    if (!this.bot) return;
    try { await this.bot.sendMessage(this.chatId, text, { parse_mode: 'Markdown' }); }
    catch (err) { console.error('[Telegram]', err.message); }
  }
  async sendTradeAlert(t) {
    const e = t.side === 'buy' ? '📈 LONG' : '📉 SHORT';
    await this.sendMessage([`🤖 *Ballad QUANTUM*`,`${e} \`${t.symbol}\``,`💲 \`$${t.price.toLocaleString()}\``,`🛑 SL: \`$${t.stopLoss}\` ✅ TP: \`$${t.takeProfit}\``].join('\n'));
  }
  async sendError(msg) { await this.sendMessage(`⚠️ *Error*\n\`${msg}\``); }
}
module.exports = TelegramService;
