import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { getChatInfo, sendChat } from "../../api/chat";
import { useAuth } from "../../context/AuthContext";
import { ChatIcon, CloseIcon, SendIcon } from "../Icons";
import ChatText from "./ChatText";

// The round "Ask Yarnie" button in the corner, and the chat panel it opens.
// The conversation is kept in sessionStorage, so it survives moving between
// pages (each page draws its own PageLayout) but is forgotten when the tab closes.

const STORAGE_KEY = "lacrochet-chat";
const SEND_LAST = 12; // the server only reads the last 12 messages anyway

const GREETING = {
  role: "model",
  text: "Hi! I'm Yarnie, La Crochet's helper. Ask me about our pieces, delivery, your order, or crochet tips. Pwede rin sa Tagalog!",
};

const STARTERS = [
  "What can I give as a gift?",
  "How much is delivery?",
  "Where is my order?",
  "Crochet tip for beginners",
];

function loadChat(ownerId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    // A different person logged in on this tab: start fresh, so nobody sees
    // someone else's order questions.
    if (saved && saved.ownerId === ownerId && Array.isArray(saved.messages)) return saved;
  } catch {
    // Nothing saved, or storage is blocked.
  }
  return { ownerId, messages: [GREETING], open: false };
}

function saveChat(chat) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chat));
  } catch {
    // Storage blocked (private mode): the chat just won't survive a page change.
  }
}

export default function ChatWidget() {
  const { token, user, isChecking } = useAuth();
  const ownerId = user?.user_id ?? "guest";

  const [chat, setChat] = useState(() => loadChat(ownerId));
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [enabled, setEnabled] = useState(true);

  const titleId = useId();
  const inputId = useId();
  const launcherRef = useRef(null);
  const inputRef = useRef(null);
  const logRef = useRef(null);
  const formRef = useRef(null);

  const { messages, open } = chat;
  const onlyGreeting = messages.length === 1;

  function update(changes) {
    setChat((current) => {
      const next = { ...current, ...changes };
      saveChat(next);
      return next;
    });
  }

  // Someone logged in or out: switch to that person's chat.
  useEffect(() => {
    if (isChecking) return;
    setChat((current) => (current.ownerId === ownerId ? current : loadChat(ownerId)));
    setError(null);
  }, [ownerId, isChecking]);

  // Is Yarnie switched on? (Shows a note in the panel if the key is missing.)
  useEffect(() => {
    if (!open) return;
    let ignore = false;
    getChatInfo(token)
      .then((info) => !ignore && setEnabled(info.enabled))
      .catch(() => {}); // server unreachable: sending will explain
    return () => {
      ignore = true;
    };
  }, [open, token]);

  // Keep the newest message in view.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, sending, error, open]);

  function openChat() {
    update({ open: true });
    // Wait for the panel to appear, then put the cursor in the message box.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closeChat() {
    update({ open: false });
    launcherRef.current?.focus();
  }

  function startOver() {
    update({ messages: [GREETING] });
    setError(null);
    inputRef.current?.focus();
  }

  async function ask(history) {
    setSending(true);
    setError(null);
    try {
      // The greeting is just for show; Gemini doesn't need it.
      const toSend = history.filter((m) => m !== GREETING).slice(-SEND_LAST);
      const { reply } = await sendChat(toSend, token);
      update({ messages: [...history, { role: "model", text: reply }] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  function send(text) {
    const clean = text.trim();
    if (!clean || sending) return;
    const history = [...messages, { role: "user", text: clean }];
    update({ messages: history });
    setDraft("");
    ask(history);
  }

  function handleSubmit(event) {
    event.preventDefault();
    send(draft);
  }

  // Enter sends, Shift+Enter makes a new line. Skip while the person is still
  // choosing characters with an input method (e.g. Japanese, Chinese keyboards).
  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      // (React hides isComposing, so read it from the browser's own event.)
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      formRef.current?.requestSubmit();
    }
  }

  // On small screens the panel covers the page, so close it when a link
  // inside the chat takes the customer somewhere.
  function handleNavigate() {
    if (window.matchMedia("(max-width: 639px)").matches) update({ open: false });
  }

  const lastFailed = error && messages.at(-1)?.role === "user";

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-labelledby={titleId}
          className="chat-panel"
          onKeyDown={(event) => event.key === "Escape" && closeChat()}
        >
          <header className="flex items-center gap-3 border-b border-line bg-berry px-4 py-3 text-on-berry">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-on-berry/15">
              <ChatIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="font-serif text-lg font-semibold leading-tight text-on-berry">
                Yarnie
              </h2>
              <p className="truncate text-xs text-on-berry/80">La Crochet shop helper</p>
            </div>
            {!onlyGreeting && (
              <button type="button" onClick={startOver} className="chat-header-btn">
                New chat
              </button>
            )}
            <button type="button" onClick={closeChat} className="chat-header-btn px-2" aria-label="Close chat">
              <CloseIcon className="h-5 w-5" />
            </button>
          </header>

          <div ref={logRef} role="log" aria-live="polite" aria-relevant="additions" className="chat-log">
            {messages.map((message, i) => (
              <div
                key={i}
                className={`chat-bubble ${message.role === "user" ? "chat-bubble-me" : "chat-bubble-bot"} ${
                  i === messages.length - 1 ? "chat-latest" : ""
                }`}
              >
                <span className="sr-only">{message.role === "user" ? "You said:" : "Yarnie said:"}</span>
                {message.role === "user" ? <p>{message.text}</p> : <ChatText text={message.text} onNavigate={handleNavigate} />}
              </div>
            ))}

            {onlyGreeting && (
              <div className="flex flex-wrap gap-2 pt-1" aria-label="Suggested questions">
                {STARTERS.map((starter) => (
                  <button key={starter} type="button" className="chip" onClick={() => send(starter)}>
                    {starter}
                  </button>
                ))}
              </div>
            )}

            {sending && (
              <div className="chat-bubble chat-bubble-bot" aria-label="Yarnie is typing">
                <span className="chat-typing" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-2xl border border-berry/30 bg-blush px-3 py-2 text-sm text-ink">
                <p>{error}</p>
                {lastFailed && (
                  <button type="button" className="link mt-1 text-sm" onClick={() => ask(messages)}>
                    Try again
                  </button>
                )}
              </div>
            )}

            {!enabled && (
              <p className="rounded-2xl bg-sand px-3 py-2 text-sm text-muted">
                Yarnie isn't switched on yet. The shop owner needs to add a Gemini key.
              </p>
            )}
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-line p-3">
            <label htmlFor={inputId} className="sr-only">
              Message Yarnie
            </label>
            <textarea
              id={inputId}
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={1000}
              placeholder="Ask Yarnie anything…"
              className="chat-input"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full bg-berry text-on-berry transition-colors hover:bg-berry-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              <SendIcon className="h-5 w-5" />
              <span className="sr-only">Send</span>
            </button>
          </form>
        </section>
      )}

      <button
        ref={launcherRef}
        type="button"
        onClick={open ? closeChat : openChat}
        aria-expanded={open}
        className="chat-launcher"
      >
        {open ? <CloseIcon className="h-6 w-6" /> : <ChatIcon className="h-6 w-6" />}
        <span className={open ? "sr-only" : "hidden sm:inline"}>{open ? "Close chat" : "Ask Yarnie"}</span>
        {!open && <span className="sr-only sm:hidden">Ask Yarnie</span>}
      </button>
    </>
  );
}
