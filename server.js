require('dotenv').config();
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const BinanceExchange = require('./modules/exchange/binance');
const MexcExchange = require('./modules/exchange/mexc');
const Strategy = require('./modules/bot/strategy');
const RiskManager = require('./modules/bot/riskManager');
const SupabaseService = require('./modules/services/supabase');
const TelegramService = require('./modules/services/telegram');
const SentimentService = require('./modules/services/sentiment');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors()); app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const botState = {
  running: false, exchange: process.env.ACTIVE_EXCHANGE||'binance',
  symbol: process.env.DEFAULT_SYMBOL||'BTC/USDT:USDT',
  timeframe: process.env.DEFAULT_TIMEFRAME||'15m',
  leverage: parseInt(process.env.DEFAULT_LEVERAGE)||10,
  riskPercent: parseFloat(process.env.DEFAULT_RISK_PERCENT)||1.0,
  trades: [], lastSignal: null, lastPrice: null, startedAt: null,
  stats: { totalTrades:0, winners:0, losers:0, totalPnl:0 },
};

let binance, mexc, strategy, riskManager, supabase, telegram, sentiment, botInterval=null;

async function initServices() {
  try {
    binance = new BinanceExchange({ apiKey: process.env.BINANCE_API_KEY, apiSecret: process.env.BINANCE_API_SECRET, testnet: process.env.BINANCE_TESTNET==='true' });
    mexc = new MexcExchange({ apiKey: process.env.MEXC_API_KEY, apiSecret: process.env.MEXC_API_SECRET });
    supabase = new SupabaseService({ url: process.env.SUPABASE_URL, serviceKey: process.env.SUPABASE_SERVICE_KEY, anonKey: process.env.SUPABASE_ANON_KEY });
    telegram = new TelegramService({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID });
    sentiment = new SentimentService({ lunarCrushKey: process.env.LUNARCRUSH_API_KEY, cryptoPanicKey: process.env.CRYPTOPANIC_API_KEY });
    strategy = new Strategy(); riskManager = new RiskManager();
    console.log('[INIT] All services initialized');
    await telegram.sendMessage('🤖 *Ballad QUANTUM* iniciado.');
  } catch (err) { console.error('[INIT ERROR]', err.message); }
}

const getExchange = () => botState.exchange==='mexc' ? mexc : binance;
const broadcast = (data) => { const m=JSON.stringify(data); wss.clients.forEach(c=>{ if(c.readyState===1) c.send(m); }); };
const getSafeState = () => ({ ...botState, trades: botState.trades.slice(-50) });

wss.on('connection', (ws) => { ws.send(JSON.stringify({ type:'state', data:getSafeState() })); });

async function botTick() {
  if (!botState.running) return;
  try {
    const ex = getExchange();
    const ohlcv = await ex.fetchOHLCV(botState.symbol, botState.timeframe, 200);
    if (!ohlcv || ohlcv.length < 50) return;
    botState.lastPrice = ohlcv[ohlcv.length-1][4];
    const sentScore = await sentiment.getScore(botState.symbol.split('/')[0]);
    const signal = strategy.analyze(ohlcv, sentScore);
    botState.lastSignal = signal;
    broadcast({ type:'tick', data:{ price:botState.lastPrice, signal, ts:Date.now() } });
    if (signal.action==='none') return;
    const balance = await ex.fetchBalance();
    const usdt = balance?.USDT?.free||0;
    const sizing = riskManager.calculateSize({ balance:usdt, riskPercent:botState.riskPercent, price:botState.lastPrice, leverage:botState.leverage, stopLossPct:signal.stopLossPct });
    if (!sizing.valid) { console.warn('[BOT] Invalid sizing:', sizing.reason); return; }
    const positions = await ex.fetchPositions(botState.symbol);
    const openPos = positions.find(p=>Math.abs(p.contracts)>0);
    if (openPos) { if ((openPos.side==='long'?'buy':'sell')!==signal.side) await ex.closePosition(botState.symbol, openPos); else return; }
    await ex.setLeverage(botState.symbol, botState.leverage);
    const order = await ex.placeOrder({ symbol:botState.symbol, side:signal.side, amount:sizing.contracts, price:botState.lastPrice, stopLoss:sizing.stopLoss, takeProfit:sizing.takeProfit });
    const trade = { id:order.id, ts:Date.now(), exchange:botState.exchange, symbol:botState.symbol, side:signal.side, price:botState.lastPrice, contracts:sizing.contracts, stopLoss:sizing.stopLoss, takeProfit:sizing.takeProfit, signal:signal.reason, status:'open', pnl:0 };
    botState.trades.unshift(trade); botState.stats.totalTrades++;
    await supabase.saveTrade(trade); await telegram.sendTradeAlert(trade);
    broadcast({ type:'trade', data:trade });
  } catch (err) { console.error('[BOT TICK ERROR]', err.message); broadcast({ type:'error', data:err.message }); }
}

function auth(req,res,next) {
  const pwd=req.headers['x-dashboard-password']||req.query.password;
  if (process.env.DASHBOARD_PASSWORD && pwd!==process.env.DASHBOARD_PASSWORD) return res.status(401).json({ error:'Unauthorized' });
  next();
}

app.get('/health', (_,res) => res.json({ status:'ok', ts:Date.now(), bot:botState.running }));
app.get('/api/state', auth, (_,res) => res.json(getSafeState()));
app.post('/api/bot/start', auth, async (req,res) => {
  if (botState.running) return res.json({ ok:true, message:'Already running' });
  const { exchange,symbol,timeframe,leverage,riskPercent } = req.body;
  if (exchange) botState.exchange=exchange; if (symbol) botState.symbol=symbol;
  if (timeframe) botState.timeframe=timeframe; if (leverage) botState.leverage=parseInt(leverage);
  if (riskPercent) botState.riskPercent=parseFloat(riskPercent);
  botState.running=true; botState.startedAt=Date.now();
  botInterval=setInterval(botTick,60000); botTick();
  broadcast({ type:'state', data:getSafeState() });
  res.json({ ok:true, message:'Bot started' });
});
app.post('/api/bot/stop', auth, (_,res) => {
  botState.running=false; botState.startedAt=null;
  if (botInterval) { clearInterval(botInterval); botInterval=null; }
  broadcast({ type:'state', data:getSafeState() });
  telegram.sendMessage('🛑 Bot detenido.'); res.json({ ok:true });
});
app.get('/api/balance', auth, async (_,res) => { try { res.json(await getExchange().fetchBalance()); } catch(e){ res.status(500).json({ error:e.message }); } });
app.get('/api/positions', auth, async (_,res) => { try { res.json(await getExchange().fetchPositions(botState.symbol)); } catch(e){ res.status(500).json({ error:e.message }); } });
app.get('/api/trades', auth, async (_,res) => { try { res.json(await supabase.getTrades({ limit:100 })); } catch(_){ res.json(botState.trades.slice(0,100)); } });
app.post('/api/close-position', auth, async (_,res) => {
  try {
    const ex=getExchange(), positions=await ex.fetchPositions(botState.symbol);
    const p=positions.find(p=>Math.abs(p.contracts)>0);
    if (!p) return res.json({ ok:false, message:'No open position' });
    await ex.closePosition(botState.symbol, p); res.json({ ok:true, message:'Position closed' });
  } catch(e){ res.status(500).json({ error:e.message }); }
});

cron.schedule('*/5 * * * *', async () => { try { const t=await supabase.getTrades({ limit:50 }); if(t) broadcast({ type:'trades_sync', data:t }); } catch({}){} });

const PORT=process.env.PORT||3000;
server.listen(PORT, async () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║    BALLAD QUANTUM — v5.0.0           ║`);
  console.log(`║    Port: ${PORT}                        ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
  await initServices();
});
