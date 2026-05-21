import { useCallback, useEffect, useRef, useState } from "react";
import { globalSearch } from "../services/searchService";
import { logError } from "../services/logger";

const DEBOUNCE_MS = 180;

export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState({ donors: [], people: [], imports: [] });
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef(null);
  const activeQueryRef = useRef("");

  const open = useCallback(() => {
    setIsOpen(true);
    setQuery("");
    setResults({ donors: [], people: [], imports: [] });
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        if (!isOpen) {
          setQuery("");
          setResults({ donors: [], people: [], imports: [] });
        }
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;

    clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults({ donors: [], people: [], imports: [] });
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    activeQueryRef.current = query;

    debounceRef.current = setTimeout(async () => {
      const currentQuery = query;
      try {
        const data = await globalSearch(currentQuery);
        if (activeQueryRef.current === currentQuery) {
          setResults(data);
        }
      } catch (err) {
        logError("useCommandPalette.search", err);
      } finally {
        if (activeQueryRef.current === currentQuery) {
          setIsSearching(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(debounceRef.current);
  }, [query, isOpen]);

  return { isOpen, open, close, query, setQuery, results, isSearching };
}
