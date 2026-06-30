import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL ?? "";

type SubmitStatus = "idle" | "submitting" | "success" | "error";

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubmitStatus>("idle");

  const resetAndClose = () => {
    setIsOpen(false);
    setMessage("");
    setEmail("");
    setStatus("idle");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus("submitting");

    try {
      const response = await fetch(`${API_URL}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: message.trim(),
          email: email.trim() || undefined,
          page: window.location.pathname,
        }),
      });

      if (!response.ok) throw new Error("Request failed");

      setStatus("success");
      setTimeout(resetAndClose, 1500);
    } catch (err) {
      console.error("Feedback submission failed:", err);
      setStatus("error");
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-40 inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-300 shadow-lg transition hover:bg-gray-800 hover:text-white"
        aria-label="Send feedback"
      >
        <span className="text-lg font-bold">✉</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl shadow-black/60">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Send Feedback
              </h2>
              <button
                onClick={resetAndClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-gray-400 transition hover:bg-gray-700 hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {status === "success" ? (
              <p className="text-sm text-emerald-400">
                Thanks! Your feedback was sent.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email (optional)"
                  className="w-full rounded-md border border-gray-700 bg-gray-800 p-2 text-sm text-white placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={4}
                  required
                  className="w-full resize-none rounded-md border border-gray-700 bg-gray-800 p-2 text-sm text-white placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />

                {status === "error" && (
                  <p className="text-sm text-red-400">
                    Something went wrong. Please try again.
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="rounded-md px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {status === "submitting" ? "Sending..." : "Send"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}