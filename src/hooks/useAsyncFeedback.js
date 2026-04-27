import { useEffect, useState } from "react";
import {
  getAsyncFeedbackSnapshot,
  subscribeAsyncFeedback,
} from "../services/asyncFeedback";

export function useAsyncFeedback() {
  const [operations, setOperations] = useState(() =>
    getAsyncFeedbackSnapshot(),
  );

  useEffect(() => subscribeAsyncFeedback(setOperations), []);

  return operations;
}
