import { createContext, useContext, useState } from 'react'

const CurrencyContext = createContext(null)
const STORAGE_KEY = 'pos_hw_currency'

const LOCALE_MAP = {
  KES: 'en-KE', USD: 'en-US', EUR: 'de-DE',
  GBP: 'en-GB', ZAR: 'en-ZA', TZS: 'en-TZ', UGX: 'en-UG',
}

export function CurrencyProvider({ children }) {
  const [currency, setCurrencyState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || 'KES'
  )

  function setCurrency(c) {
    localStorage.setItem(STORAGE_KEY, c)
    setCurrencyState(c)
  }

  const locale = LOCALE_MAP[currency] || 'en-KE'
  const fmt = (n) =>
    `${currency} ${Number(n || 0).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, fmt }}>
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  return useContext(CurrencyContext)
}
