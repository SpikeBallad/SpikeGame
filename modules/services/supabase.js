const { createClient } = require('@supabase/supabase-js');
class SupabaseService {
  constructor({ url, serviceKey, anonKey }) {
    if (!url || (!serviceKey && !anonKey)) { console.warn('[Supabase] Disabled'); this.client = null; return; }
    this.client = createClient(url, serviceKey || anonKey);
  }
  async saveTrade(t) {
    if (!this.client) return null;
    try { const { data, error } = await this.client.from('trades').insert([{ trade_id: t.id, exchange: t.exchange, symbol: t.symbol, side: t.side, price: t.price, contracts: t.contracts, stop_loss: t.stopLoss, take_profit: t.takeProfit, signal_reason: t.signal, status: t.status, pnl: t.pnl, created_at: new Date(t.ts).toISOString() }]); if (error) throw error; return data; }
    catch (err) { console.error('[Supabase] saveTrade:', err.message); return null; }
  }
  async getTrades({ limit = 100, symbol = null } = {}) {
    if (!this.client) return [];
    try { let q = this.client.from('trades').select('*').order('created_at', { ascending: false }).limit(limit); if (symbol) q = q.eq('symbol', symbol); const { data, error } = await q; if (error) throw error; return data || []; }
    catch (err) { console.error('[Supabase] getTrades:', err.message); return []; }
  }
}
module.exports = SupabaseService;
