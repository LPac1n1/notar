export const DEFAULT_DEMAND_COLOR = "#FFD24D";

export const DEMAND_COLOR_PALETTE = [
  { value: "#FFD24D", label: "Amarelo" },
  { value: "#1AE680", label: "Verde" },
  { value: "#39C6F4", label: "Azul claro" },
  { value: "#7C8CFF", label: "Azul" },
  { value: "#B982FF", label: "Violeta" },
  { value: "#FF7AB6", label: "Rosa" },
  { value: "#FF8A4D", label: "Laranja" },
  { value: "#FF5B5B", label: "Vermelho" },
];

export function normalizeDemandColor(value) {
  const trimmedValue = String(value ?? "").trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmedValue)) {
    return trimmedValue.toUpperCase();
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmedValue)) {
    return `#${trimmedValue
      .slice(1)
      .split("")
      .map((item) => item + item)
      .join("")}`.toUpperCase();
  }

  return DEFAULT_DEMAND_COLOR;
}

export function hexToRgb(hexColor) {
  const normalizedColor = normalizeDemandColor(hexColor).slice(1);

  return {
    r: Number.parseInt(normalizedColor.slice(0, 2), 16),
    g: Number.parseInt(normalizedColor.slice(2, 4), 16),
    b: Number.parseInt(normalizedColor.slice(4, 6), 16),
  };
}

export function getContrastTextColor(hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  return luminance > 0.62 ? "#12151C" : "#FFFFFF";
}

export function getDemandColorOption(color) {
  const normalizedColor = normalizeDemandColor(color);
  return (
    DEMAND_COLOR_PALETTE.find((option) => option.value === normalizedColor) ?? {
      value: normalizedColor,
      label: "Personalizada",
    }
  );
}
