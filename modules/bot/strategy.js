class Strategy {
  constructor() {
    this.emaPeriodFast = 9; this.emaPeriodSlow = 21;
    this.rsiPeriod = 14; this.atrPeriod = 14;
    this.sentimentBullMin = -0.2; this.sentimentBearMax = 0.2;
  }
  ema(closes, period) {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let v = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) v = closes[i] * k + v * (1 - k);
    return v;
  }
  rsi(closes, period = 14) {
    if (closes.length < period + 1) return null;
    const ch = closes.slice(1).map((c, i) => c - closes[i]);
    let g = 0, l = 0;
    for (let i = 0; i < period; i++) { if (ch[i] > 0) g += ch[i]; else l += Math.abs(ch[i]); }
    let ag = g / period, al = l / period;
    for (let i = period; i < ch.length; i++) {
      ag = (ag * (period - 1) + Math.max(ch[i], 0)) / period;
      al = (al * (period - 1) + Math.max(-ch[i], 0)) / period;
    }
    if (al === 0) return 100;
    return 100 - 100 / (1 + ag / al);
  }
  atr(ohlcv, period = 14) {
    const trs = [];
    for (let i = 1; i < ohlcv.length; i++) {
      const [,, h, l] = ohlcv[i], pc = ohlcv[i-1][4];
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    if (trs.length < period) return null;
    return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
  }
  analyze(ohlcv, sentimentScore = 0) {
    const closes = ohlcv.map(c => c[4]);
    const price = closes[closes.length - 1];
    const ef = this.ema(closes, this.emaPeriodFast), es = this.ema(closes, this.emaPeriodSlow);
    const pef = this.ema(closes.slice(0,-1), this.emaPeriodFast), pes = this.ema(closes.slice(0,-1), this.emaPeriodSlow);
    const rsiVal = this.rsi(closes, this.rsiPeriod), atrVal = this.atr(ohlcv, this.atrPeriod);
    const none = { action: 'none', side: null, reason: 'No signal', stopLossPct: 0, takeProfitPct: 0 };
    if (!ef || !es || !pef || !pes || !rsiVal || !atrVal) return none;
    const slPct = Math.min((atrVal / price) * 150, 3.0), tpPct = slPct * 2;
    if (pef <= pes && ef > es && rsiVal < 45 && rsiVal > 25 && sentimentScore >= this.sentimentBullMin)
      return { action: 'open', side: 'buy', reason: `EMA cross bullish | RSI ${rsiVal.toFixed(1)}`, stopLossPct: slPct, takeProfitPct: tpPct };
    if (pef >= pes && ef < es && rsiVal > 55 && rsiVal < 75 && sentimentScore <= this.sentimentBearMax)
      return { action: 'open', side: 'sell', reason: `EMA cross bearish | RSI ${rsiVal.toFixed(1)}`, stopLossPct: slPct, takeProfitPct: tpPct };
    return none;
  }
}
module.exports = Strategy;
