import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Square, Trash2, X, Sparkles } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { streamChat } from "../../services/chatService";
import BotAvatar from "./BotAvatar";
import MessageBubble from "./MessageBubble";

const PROMPTS = {
  citizen: [
    "The water is rising near me. What should I do?",
    "Where is the nearest open shelter?",
    "What should be in my emergency kit?",
    "Is it safe to drive through shallow floodwater?",
  ],
  staff: [
    "Summarize current operations",
    "Which facilities may need resupply?",
    "How should we prioritize rescues?",
    "What should responders check before entering flooded areas?",
  ],
};

const OFFLINE_TIPS = `You're offline, so I can't reach live data. Basic flood safety:
- **Move to higher ground** early. Don't wait for water to reach you.
- **Never walk or drive through floodwater.** Turn around, don't drown.
- **Stay away from powerlines** and switch off electricity if it's safe to do so.
- Keep your phone charged, carry ID, medicines and water.
- In danger, press **SOS**. It is stored on your phone and sent when signal returns. Call 112 if you can.`;

const readFix = (uid) => {
  try {
    const f = JSON.parse(localStorage.getItem(`ark_last_fix_${uid}`));
    return f && typeof f.lat === "number" ? { lat: f.lat, lng: f.lng } : null;
  } catch {
    return null;
  }
};

export default function ChatWindow({ open, onClose }) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef(null);
  const endRef = useRef(null);
  const prompts = profile.role === "citizen" ? PROMPTS.citizen : PROMPTS.staff;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  const send = async (text) => {
    const content = text.trim();
    if (!content || streaming) return;
    setInput("");

    if (!navigator.onLine) {
      setMessages((m) => [...m, { role: "user", content }, { role: "assistant", content: OFFLINE_TIPS }]);
      return;
    }

    const history = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setStreaming(true);
    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      await streamChat({
        messages: history.slice(-10).map(({ role, content: c }) => ({ role, content: c })),
        location: readFix(profile.uid),
        signal: ctl.signal,
        onToken: (t) =>
          setMessages((m) => {
            const c = [...m];
            const last = c[c.length - 1];
            c[c.length - 1] = { ...last, content: last.content + t };
            return c;
          }),
      });
    } catch (e) {
      if (e.name !== "AbortError") {
        setMessages((m) => {
          const c = [...m];
          const last = c[c.length - 1];
          if (last?.role === "assistant" && !last.content) {
            c[c.length - 1] = { ...last, content: e.message || "ArkBot could not answer right now.", error: true };
          }
          return c;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const typing = streaming && messages[messages.length - 1]?.content === "";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ type: "spring", damping: 24, stiffness: 260 }}
          className="fixed inset-0 z-[55] flex flex-col overflow-hidden border border-white/15 bg-navy-900/95 shadow-glow-indigo backdrop-blur-2xl sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[620px] sm:w-[410px] sm:rounded-3xl"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-white/10 bg-gradient-to-r from-ark-indigo/25 via-ark-cyan/10 to-ark-coral/15 px-4 py-3">
            <BotAvatar size={40} />
            <div className="flex-1">
              <p className="font-display text-lg font-bold leading-tight">ArkBot</p>
              <p className="flex items-center gap-1.5 text-xs text-ark-cyan">
                <span className="h-2 w-2 animate-pulse rounded-full bg-ark-cyan" /> Live flood-safety assistant
              </p>
            </div>
            {messages.length > 0 && (
              <button onClick={() => { abortRef.current?.abort(); setMessages([]); }} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" title="Clear chat">
                <Trash2 size={17} />
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={19} /></button>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="space-y-4">
                <div className="glass p-4 text-sm text-slate-300">
                  <p className="mb-1 flex items-center gap-2 font-display font-semibold text-white">
                    <Sparkles size={16} className="text-ark-cyan" /> Hi {profile.name.split(" ")[0]}, I'm ArkBot
                  </p>
                  I answer using live shelter, road, and hazard data from ArkGrid. In immediate danger? Press SOS and call 112.
                </div>
                <div className="flex flex-col gap-2">
                  {prompts.map((p) => (
                    <button key={p} onClick={() => send(p)}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-left text-sm text-slate-300 transition hover:border-ark-cyan/50 hover:bg-ark-cyan/10 hover:text-white">
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <MessageBubble key={i} m={m} typing={typing && i === messages.length - 1} />
              ))
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="border-t border-white/10 p-3">
            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
              <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={500}
                placeholder="Ask about flood safety…" className="input-glass flex-1" />
              {streaming ? (
                <button type="button" onClick={() => abortRef.current?.abort()}
                  className="rounded-xl bg-ark-coral/20 px-4 text-ark-coral hover:bg-ark-coral/30" title="Stop">
                  <Square size={18} />
                </button>
              ) : (
                <button type="submit" disabled={!input.trim()}
                  className="rounded-xl bg-gradient-to-r from-ark-indigo to-ark-cyan px-4 text-white shadow-glow-indigo disabled:opacity-50">
                  <Send size={18} />
                </button>
              )}
            </form>
            <p className="mt-2 text-center text-[11px] text-slate-500">ArkBot can make mistakes. Follow official guidance and local authorities.</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}