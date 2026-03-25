const axios = require('axios');
class SentimentService {
  constructor({ lunarCrushKey, cryptoPanicKey }) { this.lunarCrushKey = lunarCrushKey; this.cryptoPanicKey = cryptoPanicKey; this.cache = new Map(); this.cacheTtl = 300000; }
  async getScore(coin) {
    const k = coin.toUpperCase(), c = this.cache.get(k);
    if (c && Date.now() - c.ts < this.cacheTtl) return c.score;
    const scores = [];
    if (this.lunarCrushKey) try { const v = await this.fetchLunarCrush(coin); if (v !== null) scores.push(v); } catch (_) {}
    if (this.cryptoPanicKey) try { const v = await this.fetchCryptoPanic(coin); if (v !== null) scores.push(v); } catch (_) {}
    const score = scores.length ? scores.reduce((a,b)=>a+b,0)/scores.length : 0;
    this.cache.set(k, { score, ts: Date.now() }); return score;
  }
  async fetchLunarCrush(symbol) {
    const r = await axios.get(`https://lunarcrush.com/api4/public/coins/${symbol.toLowerCase()}/v1`, { headers: { Authorization: `Bearer ${this.lunarCrushKey}` }, timeout: 5000 });
    const d = r.data?.data; if (!d) return null;
    return ((d.galaxy_score||50)-50)/50 * 0.5 + ((d.sentiment||3)-3)/2 * 0.5;
  }
  async fetchCryptoPanic(symbol) {
    const r = await axios.get(`https://cryptopanic.com/api/v1/posts/?auth_token=${this.cryptoPanicKey}&currencies=${symbol}&filter=hot&public=true`, { timeout: 5000 });
    const res = r.data?.results; if (!res?.length) return null;
    let b=0,bear=0; for (const p of res) { b+=p.votes?.positive||0; bear+=p.votes?.negative||0; }
    const t=b+bear; return t===0?0:(b-bear)/t;
  }
}
module.exports = SentimentService;
