class RiskManager {
  constructor() { this.minUsdtBalance = 20; this.maxLeverage = 20; this.minContracts = 0.001; }
  calculateSize({ balance, riskPercent, price, leverage, stopLossPct }) {
    if (balance < this.minUsdtBalance) return { valid: false, reason: `Balance too low: $${balance.toFixed(2)}` };
    if (!price || price <= 0) return { valid: false, reason: 'Invalid price' };
    if (!stopLossPct || stopLossPct <= 0) return { valid: false, reason: 'Invalid stop loss %' };
    const lev = Math.min(leverage, this.maxLeverage);
    const risk = (balance * riskPercent) / 100;
    let contracts = Math.max(risk / (price * stopLossPct / 100), this.minContracts);
    if (contracts * price > balance * lev) contracts = (balance * lev) / price;
    contracts = parseFloat(contracts.toFixed(3));
    return {
      valid: true, contracts,
      notional: parseFloat((contracts * price).toFixed(2)),
      riskAmount: parseFloat(risk.toFixed(2)),
      stopLoss: parseFloat((price * (1 - stopLossPct / 100)).toFixed(4)),
      takeProfit: parseFloat((price * (1 + stopLossPct * 2 / 100)).toFixed(4)),
      stopLossPct, takeProfitPct: stopLossPct * 2, leverage: lev,
    };
  }
}
module.exports = RiskManager;
