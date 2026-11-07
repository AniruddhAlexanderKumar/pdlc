"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  X,
  Send,
  Bot,
  User,
  Compass,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractSituationContext, generateSituationalAnalysis, type SituationalContext } from "@/lib/ai/situation-context";

/** `timestamp` used to sit here too — set on every message, rendered by nothing. */
interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  contextBanner?: string;
  actions?: string[];
}

export function SituationAwareAI() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = React.useState(false);
  const [inputMessage, setInputMessage] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([]);

  // Compute live situation context client-side
  const situation: SituationalContext = React.useMemo(() => {
    return extractSituationContext(pathname ?? "/dashboard");
  }, [pathname]);

  /**
   * Opened from the Help menu, and nowhere else.
   *
   * A `pdlc:toggle-ai-assistant` listener sat here too, for the top-bar
   * sparkle button and the floating panel that both used to fire it.
   * Neither exists now, so the event had a listener and no sender —
   * removed rather than left as a hook for something that no longer calls.
   */
  React.useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("pdlc:open-ai-assistant", handleOpen);
    return () => window.removeEventListener("pdlc:open-ai-assistant", handleOpen);
  }, []);

  /**
   * The opening message is derived, not stored.
   *
   * It used to be written into `messages` from an effect, costing a second
   * render every time the panel opened and tripping the set-state-in-effect
   * rule. Nothing about it is state: it is a pure function of the current
   * route. Computed here, it also stays correct when the reader navigates,
   * instead of going stale behind whatever was seeded first.
   */
  const welcome = React.useMemo<Message>(() => {
    const analysis = generateSituationalAnalysis(situation);
    return {
      id: `welcome:${situation.pathname}`,
      sender: "ai",
      text: analysis.answer,
      contextBanner: analysis.contextBanner,
      actions: analysis.recommendedActions,
    };
  }, [situation]);

  const conversation = messages.length === 0 ? [welcome] : messages;

  async function handleSend(customText?: string) {
    const textToSend = customText ?? inputMessage;
    if (!textToSend.trim() || isLoading) return;

    if (textToSend.includes("Open Step-by-Step Software Guide") || textToSend.includes("Open Step-by-Step Guide")) {
      window.dispatchEvent(new Event("pdlc:open-step-by-step-guide"));
    } else if (textToSend.includes("Launch Onboarding Tour")) {
      window.dispatchEvent(new Event("pdlc:open-onboarding-tour"));
    }

    const userMsg: Message = {
      id: "user-" + Date.now(),
      sender: "user",
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputMessage("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/ai/situation-aware", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pathname,
          userMessage: textToSend,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const aiMsg: Message = {
          id: "ai-" + Date.now(),
          sender: "ai",
          text: data.analysis.answer,
          contextBanner: data.analysis.contextBanner,
          actions: data.analysis.recommendedActions,
        };
        setMessages((prev) => [...prev, aiMsg]);
      } else {
        // Fallback local situational analysis if API fails
        const localAnalysis = generateSituationalAnalysis(situation, textToSend);
        const aiMsg: Message = {
          id: "ai-" + Date.now(),
          sender: "ai",
          text: localAnalysis.answer,
          contextBanner: localAnalysis.contextBanner,
          actions: localAnalysis.recommendedActions,
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch {
      const localAnalysis = generateSituationalAnalysis(situation, textToSend);
      setMessages((prev) => [
        ...prev,
        {
          id: "ai-" + Date.now(),
          sender: "ai",
          text: localAnalysis.answer,
          contextBanner: localAnalysis.contextBanner,
          actions: localAnalysis.recommendedActions,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleAnalyzePage() {
    handleSend("Analyze current page context and give me situational insights.");
  }

  if (!isOpen) return null;

  return (
    <aside
      aria-label="Situation-Aware AI Assistant"
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-2xl transition-all sm:w-96"
    >
      {/* Panel Header */}
      <div className="flex h-14 items-center justify-between border-b border-border bg-muted/40 px-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-foreground">Situation-Aware AI</h2>
            <p className="text-[10px] text-muted-foreground">Answers from this page&apos;s context</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleAnalyzePage}
            title="Refresh situation context"
            className="size-8"
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsOpen(false)}
            title="Close Assistant"
            className="size-8"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Live Context Badge */}
      <div className="border-b border-border/60 bg-primary/5 px-4 py-2 text-xs font-mono text-primary flex items-center gap-2">
        <Compass className="size-3.5 shrink-0" />
        <span className="truncate">
          <strong>Context:</strong> {situation.moduleName} ({situation.moduleCategory})
        </span>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {conversation.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-1.5 ${
              msg.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {msg.sender === "user" ? (
                <>
                  <span>You</span>
                  <User className="size-3" />
                </>
              ) : (
                <>
                  <Bot className="size-3 text-primary" />
                  <span className="font-semibold text-primary">Situation AI</span>
                </>
              )}
            </div>

            <div
              className={`rounded-lg p-3 text-xs leading-relaxed max-w-[90%] ${
                msg.sender === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/70 text-foreground border border-border"
              }`}
            >
              {msg.contextBanner && (
                <div className="mb-2 rounded bg-background/80 px-2 py-1 text-[10px] font-mono text-muted-foreground border border-border/50">
                  {msg.contextBanner}
                </div>
              )}

              <div className="whitespace-pre-wrap">{msg.text}</div>

              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-3 flex flex-col gap-1 border-t border-border/40 pt-2">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    Suggested situational actions:
                  </span>
                  {msg.actions.map((action, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSend(action)}
                      className="flex items-center justify-between rounded border border-border/60 bg-background/50 px-2 py-1 text-left text-[11px] font-medium text-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      <span className="truncate">{action}</span>
                      <ChevronRight className="size-3 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="size-3.5 animate-spin text-primary" />
            <span>Analyzing engineering graph situation…</span>
          </div>
        )}
      </div>

      {/* Suggested Quick Pills */}
      <div className="px-4 py-2 border-t border-border bg-muted/20 flex flex-wrap gap-1.5">
        {situation.suggestedPrompts.map((prompt, index) => (
          <button
            key={index}
            type="button"
            onClick={() => handleSend(prompt)}
            className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Footer Input Bar */}
      <div className="border-t border-border p-3 bg-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder={`Ask about ${situation.moduleName}…`}
            disabled={isLoading}
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button type="submit" size="icon" disabled={isLoading || !inputMessage.trim()} className="size-8">
            <Send className="size-3.5" />
          </Button>
        </form>
      </div>
    </aside>
  );
}
