import { create } from "zustand";

export const useDonorStore = create((set) => ({
  donors: [],

  addDonor: (donor) =>
    set((state) => ({
      donors: [...state.donors, donor],
    })),

  removeDonor: (id) =>
    set((state) => ({
      donors: state.donors.filter((d) => d.id !== id),
    })),

  setDonors: (donors) => set({ donors }),
}));
