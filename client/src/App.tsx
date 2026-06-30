import { useState, useRef, useEffect } from "react";
import { FeedbackButton } from "./Feedback";

const API_URL = import.meta.env.VITE_API_URL || "https://pb9cf8akad.execute-api.us-east-1.amazonaws.com/prod";

interface Fighter {
  id: string;
  name: string;
}

interface ChainLink {
  winnerId: string;
  winnerName: string;
  loserId: string;
  loserName: string;
}

interface ChainResult {
  found: boolean;
  chain: ChainLink[];
  message?: string;
}

export default function App() {
  const [fighterA, setFighterA] = useState<Fighter | null>(null);
  const [fighterB, setFighterB] = useState<Fighter | null>(null);
  const [queryA, setQueryA] = useState("");
  const [queryB, setQueryB] = useState("");
  const [resultsA, setResultsA] = useState<Fighter[]>([]);
  const [resultsB, setResultsB] = useState<Fighter[]>([]);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [chain, setChain] = useState<ChainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const helpRef = useRef<HTMLDivElement | null>(null);
  // Per-input monotonic IDs to ignore out-of-order responses
  const lastSearchIdA = useRef(0);
  const lastSearchIdB = useRef(0);
  // AbortControllers to cancel previous requests
  const abortControllerA = useRef(new AbortController());
  const abortControllerB = useRef(new AbortController());

  async function searchFighters(query: string, which: "A" | "B") {
    if (query.length < 2) {
      which === "A" ? setResultsA([]) : setResultsB([]);
      which === "A" ? setLoadingA(false) : setLoadingB(false);
      return;
    }

    // Use per-input monotonic IDs to ignore out-of-order responses.
    // Increment the appropriate counter and capture the id for this request.
    if (which === "A") {
      // Abort previous request
      abortControllerA.current.abort();
      abortControllerA.current = new AbortController();
      
      lastSearchIdA.current += 1;
      const thisId = lastSearchIdA.current;
      setLoadingA(true);
      try {
        const res = await fetch(`${API_URL}/fighters/search?q=${encodeURIComponent(query)}`, {
          signal: abortControllerA.current.signal,
        });
        const data = await res.json();
        // Only apply results if this is the most recent request for this input
        if (thisId === lastSearchIdA.current) {
          setResultsA(data.results);
        }
      } catch (e) {
        // Ignore abort errors; log other errors
        if (e instanceof Error && e.name !== "AbortError") {
          console.error("searchFighters A error:", e);
        }
      } finally {
        // only stop loading if this is the latest request
        if (thisId === lastSearchIdA.current) setLoadingA(false);
      }
    } else {
      // Abort previous request
      abortControllerB.current.abort();
      abortControllerB.current = new AbortController();
      
      lastSearchIdB.current += 1;
      const thisId = lastSearchIdB.current;
      setLoadingB(true);
      try {
        const res = await fetch(`${API_URL}/fighters/search?q=${encodeURIComponent(query)}`, {
          signal: abortControllerB.current.signal,
        });
        const data = await res.json();
        if (thisId === lastSearchIdB.current) {
          setResultsB(data.results);
        }
      } catch (e) {
        // Ignore abort errors; log other errors
        if (e instanceof Error && e.name !== "AbortError") {
          console.error("searchFighters B error:", e);
        }
      } finally {
        if (thisId === lastSearchIdB.current) setLoadingB(false);
      }
    }
  }

  function selectFighter(fighter: Fighter, which: "A" | "B") {
    if (which === "A") {
      setFighterA(fighter);
      setQueryA(fighter.name);
      setResultsA([]);
      setLoadingA(false);
    } else {
      setFighterB(fighter);
      setQueryB(fighter.name);
      setResultsB([]);
      setLoadingB(false);
    }
  }

  function swapFighters() {
    setFighterA(fighterB);
    setFighterB(fighterA);
    setQueryA(fighterB?.name ?? "");
    setQueryB(fighterA?.name ?? "");
    setResultsA([]);
    setResultsB([]);
    setChain(null);
    setError(null);
  }

  async function findChain() {
    if (!fighterA || !fighterB) return;
    setLoading(true);
    setChain(null);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/chain?from=${fighterA.id}&to=${fighterB.id}`);
      const data = await res.json();
      setChain(data);
    } catch (e) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFighterA(null);
    setFighterB(null);
    setQueryA("");
    setQueryB("");
    setResultsA([]);
    setResultsB([]);
    setChain(null);
    setError(null);
  }

  useEffect(() => {
    if (!showHelp) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(event.target as Node)) {
        setShowHelp(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowHelp(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showHelp]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center px-4 py-12">
      
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center justify-center gap-3">
          <h1 className="text-5xl font-black tracking-tight text-white mb-2">
            TI-<span className="text-red-500">MM84</span>
          </h1>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-300 hover:bg-gray-800 hover:text-white transition"
            aria-label="Show help"
            aria-expanded={showHelp}
            onClick={() => setShowHelp(prev => !prev)}
          >
            <span className="text-lg font-bold">?</span>
          </button>
        </div>
        <p className="text-gray-400 text-sm">
          MMA Math Calculator - Does fighter A beat fighter B?
        </p>

        {showHelp && (
          <div
            ref={helpRef}
            className="fixed left-1/2 top-28 z-50 w-[min(360px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-gray-700 bg-gray-900 p-5 text-left text-sm shadow-2xl shadow-black/60"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-white mb-2">What is MMA math?</p>
                <p className="text-gray-300">
                  MMA math is the idea that if Fighter A beat Fighter B, and Fighter B beat Fighter C, then Fighter A should be able to beat Fighter C. 
                  Fans use it to predict fights all the time, yet time and time again, MMA math gets it completely wrong. 
                  <br/><br/>
                  TI-MM84 takes this concept to the extreme - using Sherdog's fight results, we have scraped every fighter's wins and losses 
                  to map out the entire web of MMA results. Enter any two fighters and we'll find the shortest chain of victories (if one exists)
                  that connects them.
                  <br/><br/>
                  Whether you're a fighter yourself looking for your path to victory against Jon Jones, or a fan looking to see if your 
                  favorite fighter can become the champ, TI-MM84 is here to help you find the answer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition"
                aria-label="Close help"
              >
                x
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Search inputs */}
      <div className="w-full max-w-xl space-y-4 mb-6">
        
        {/* Fighter A */}
        <div className="relative">
          <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Fighter A</label>
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition"
            placeholder="Search fighter..."
            value={queryA}
            onChange={e => {
              setQueryA(e.target.value);
              setFighterA(null);
              searchFighters(e.target.value, "A");
              setChain(null);
              setError(null);
            }}
          />
          {loadingA && (
            <div className="absolute right-3 top-9 text-xs text-gray-400">Loading...</div>
          )}
          {resultsA.length > 0 && (
            <ul className="absolute z-10 w-full bg-gray-900 border border-gray-700 rounded-lg mt-1 max-h-48 overflow-y-auto">
              {resultsA.map(f => (
                <li
                  key={f.id}
                  className="px-4 py-2 hover:bg-gray-800 cursor-pointer text-sm"
                  onClick={() => selectFighter(f, "A")}
                >
                  {f.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* swap button */}
        <div className="flex items-center justify-center">
          <button
            className="inline-flex items-center justify-center rounded-full border border-gray-700 bg-gray-900 px-4 py-2 text-xs uppercase tracking-[0.25em] text-gray-300 hover:border-gray-500 hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
            onClick={swapFighters}
            disabled={!fighterA && !fighterB && !queryA && !queryB}
          >
            Swap
          </button>
        </div>

        {/* Fighter B */}
        <div className="relative">
          <label className="block text-xs text-gray-400 uppercase tracking-widest mb-1">Fighter B</label>
          <input
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition"
            placeholder="Search fighter..."
            value={queryB}
            onChange={e => {
              setQueryB(e.target.value);
              setFighterB(null);
              searchFighters(e.target.value, "B");
              setChain(null);
              setError(null);
            }}
          />
          {loadingB && (
            <div className="absolute right-3 top-9 text-xs text-gray-400">Loading...</div>
          )}
          {resultsB.length > 0 && (
            <ul className="absolute z-10 w-full bg-gray-900 border border-gray-700 rounded-lg mt-1 max-h-48 overflow-y-auto">
              {resultsB.map(f => (
                <li
                  key={f.id}
                  className="px-4 py-2 hover:bg-gray-800 cursor-pointer text-sm"
                  onClick={() => selectFighter(f, "B")}
                >
                  {f.name}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Find Chain button */}
        <div className="flex items-center justify-center">
          <button
            className="w-1/3 items-center justify-center bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition rounded-lg py-3 font-bold tracking-wide"
            onClick={findChain}
            disabled={!fighterA || !fighterB || loading}
          >
            {loading ? "Calculating..." : "Calculate"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="w-full max-w-xl bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Chain result */}
      {chain && (
        <div id="results" className="w-full max-w-xl">
          {chain.found ? (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
              <p className="text-white uppercase tracking-widest mb-4">
                {fighterA?.name} <b>Beats</b> {fighterB?.name}:
              </p>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-4">
                Chain found — {chain.chain.length} step{chain.chain.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-2">
                {chain.chain.map((link, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-white font-semibold">{link.winnerName}</span>
                    <span className="text-red-500 text-xs">beat</span>
                    <span className="text-white font-semibold">{link.loserName}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 text-center text-gray-400">
              <p className="text-lg text-white uppercase tracking-widest mb-4">
                <b>Undefined</b>
              </p>              
              {chain.message || "No chain found between these fighters."}
            </div>
          )}

          {/* Reset button */}
          <div className="flex items-center justify-center">
            <button
              className="w-1/3 items-center justify-center mt-4 border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white transition rounded-lg py-3 text-sm"
              onClick={reset}
            >
              Reset
            </button>
          </div>
        </div>
      )}
      <FeedbackButton />
    </div>
  );
}