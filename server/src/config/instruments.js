/**
 * @typedef {'INDEX'|'EQUITY'} InstrumentType
 * @typedef {{
 *   symbol: string;
 *   yahoo: string;
 *   name: string;
 *   type: InstrumentType;
 *   tradable: boolean;
 *   basePricePaise: number;
 * }} Instrument
 */

/** @type {Instrument[]} */
export const INSTRUMENTS = [
  {
    symbol: 'NIFTY50',
    yahoo: '^NSEI',
    name: 'NIFTY 50',
    type: 'INDEX',
    tradable: false,
    basePricePaise: 2_548_220,
  },
  {
    symbol: 'SENSEX',
    yahoo: '^BSESN',
    name: 'SENSEX',
    type: 'INDEX',
    tradable: false,
    basePricePaise: 9_176_940,
  },
  {
    symbol: 'BANKNIFTY',
    yahoo: '^NSEBANK',
    name: 'NIFTY Bank',
    type: 'INDEX',
    tradable: false,
    basePricePaise: 5_924_795,
  },
  {
    symbol: 'RELIANCE',
    yahoo: 'RELIANCE.NS',
    name: 'Reliance Industries',
    type: 'EQUITY',
    tradable: true,
    basePricePaise: 146_010,
  },
  {
    symbol: 'TCS',
    yahoo: 'TCS.NS',
    name: 'Tata Consultancy Services',
    type: 'EQUITY',
    tradable: true,
    basePricePaise: 395_225,
  },
  {
    symbol: 'HDFCBANK',
    yahoo: 'HDFCBANK.NS',
    name: 'HDFC Bank',
    type: 'EQUITY',
    tradable: true,
    basePricePaise: 95_080,
  },
  {
    symbol: 'INFY',
    yahoo: 'INFY.NS',
    name: 'Infosys',
    type: 'EQUITY',
    tradable: true,
    basePricePaise: 182_705,
  },
  {
    symbol: 'ICICIBANK',
    yahoo: 'ICICIBANK.NS',
    name: 'ICICI Bank',
    type: 'EQUITY',
    tradable: true,
    basePricePaise: 135_740,
  },
  {
    symbol: 'SBIN',
    yahoo: 'SBIN.NS',
    name: 'State Bank of India',
    type: 'EQUITY',
    tradable: true,
    basePricePaise: 88_380,
  },
  {
    symbol: 'ITC',
    yahoo: 'ITC.NS',
    name: 'ITC',
    type: 'EQUITY',
    tradable: true,
    basePricePaise: 46_875,
  },
  {
    symbol: 'BHARTIARTL',
    yahoo: 'BHARTIARTL.NS',
    name: 'Bharti Airtel',
    type: 'EQUITY',
    tradable: true,
    basePricePaise: 161_700,
  },
  {
    symbol: 'LT',
    yahoo: 'LT.NS',
    name: 'Larsen & Toubro',
    type: 'EQUITY',
    tradable: true,
    basePricePaise: 385_985,
  },
];

/** @type {Map<string, Instrument>} */
const bySymbol = new Map(INSTRUMENTS.map((i) => [i.symbol, i]));

/** @param {string} symbol */
export function getInstrument(symbol) {
  return bySymbol.get(symbol) ?? null;
}

export function getTradableInstruments() {
  return INSTRUMENTS.filter((i) => i.tradable);
}
