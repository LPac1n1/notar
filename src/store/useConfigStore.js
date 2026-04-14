import { create } from "zustand";

export const useConfigStore = create((set, get) => ({
  rules: [],

  addRule: (rule) =>
    set((state) => ({
      rules: [...state.rules, rule],
    })),

  removeRule: (id) =>
    set((state) => ({
      rules: state.rules.filter((rule) => rule.id !== id),
    })),

  getValuePerNote: (date) => {
    const rules = [...get().rules].sort(
      (a, b) => new Date(b.startDate) - new Date(a.startDate),
    );

    return (
      rules.find((r) => new Date(r.startDate) <= new Date(date))
        ?.valuePerNote || 0
    );
  },
}));
