import { useState } from "react";

export function useModalState(initial = null) {
  const [value, setValue] = useState(initial);
  return {
    value,
    isOpen: value !== null && value !== false,
    open: (nextValue = true) => setValue(nextValue),
    close: () => setValue(initial),
  };
}
