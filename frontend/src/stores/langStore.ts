import { create } from 'zustand'

export type Lang = 'zh' | 'en'

interface LangState {
  lang: Lang
  toggle: () => void
  setLang: (lang: Lang) => void
}

export const useLangStore = create<LangState>((set) => ({
  lang: 'en',
  toggle: () => set((s) => ({ lang: s.lang === 'en' ? 'zh' : 'en' })),
  setLang: (lang) => set({ lang }),
}))
