import { createContext, useContext, useEffect, useState } from 'react'

const LANGS = ['fr', 'en', 'es']
const KEY = 'gs_site_lang'
const LangContext = createContext({ lang: 'fr', setLang: () => {} })

function initialLang() {
  try {
    const saved = localStorage.getItem(KEY)
    if (LANGS.includes(saved)) return saved
  } catch { /* private mode */ }
  const nav = (navigator.language || 'fr').slice(0, 2).toLowerCase()
  return LANGS.includes(nav) ? nav : 'fr'
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(initialLang)
  const setLang = (l) => { setLangState(l); try { localStorage.setItem(KEY, l) } catch { /* private mode */ } }
  useEffect(() => { document.documentElement.lang = lang }, [lang])
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}

export function LangSwitch() {
  const { lang, setLang } = useLang()
  return (
    <div className="inline-flex rounded-full bg-white/90 p-0.5" role="group" aria-label="Langue / Language / Idioma">
      {LANGS.map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
          className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase ${lang === l ? 'bg-night-900 text-white' : 'text-night-900'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}
