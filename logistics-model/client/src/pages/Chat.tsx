import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Send, Trash2, Truck, User, Loader2 } from "lucide-react";

interface ChatMsg {
  id: number;
  role: string;
  content: string;
  timestamp: string;
  actionTaken?: string | null;
}

function formatMarkdown(text: string) {
  // Very basic markdown: bold, tables, lists, newlines
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n- /g, '<br/>• ')
    .replace(/\n/g, '<br/>');

  // Simple table support
  if (html.includes('|')) {
    const lines = text.split('\n');
    let inTable = false;
    let tableHtml = '<table class="text-xs w-full my-2 border-collapse">';
    const newLines: string[] = [];

    for (const line of lines) {
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        if (line.includes('---')) continue; // separator
        const cells = line.split('|').filter(c => c.trim());
        if (!inTable) {
          inTable = true;
          tableHtml += '<thead><tr>' + cells.map(c => `<th class="px-2 py-1 text-left border-b border-border font-medium">${c.trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</th>`).join('') + '</tr></thead><tbody>';
        } else {
          tableHtml += '<tr>' + cells.map(c => `<td class="px-2 py-1 border-b border-border/50">${c.trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</td>`).join('') + '</tr>';
        }
      } else {
        if (inTable) {
          tableHtml += '</tbody></table>';
          newLines.push(tableHtml);
          tableHtml = '<table class="text-xs w-full my-2 border-collapse">';
          inTable = false;
        }
        newLines.push(line);
      }
    }
    if (inTable) {
      tableHtml += '</tbody></table>';
      newLines.push(tableHtml);
    }

    html = newLines.join('\n')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n- /g, '<br/>• ')
      .replace(/\n/g, '<br/>');
  }

  return html;
}

const SUGGESTIONS = [
  "Show my expenses",
  "What's my profit?",
  "Add fixed expense Truck Wash $200",
  "What's the current gas price?",
  "Set revenue to $60,000",
  "Show scenarios",
  "Help",
];

export default function Chat() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [] } = useQuery<ChatMsg[]>({
    queryKey: ["/api/chat"],
    queryFn: () => apiRequest("GET", "/api/chat").then((r) => r.json()),
  });

  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      apiRequest("POST", "/api/chat", { message }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/chat"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chat"] });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="chat-page">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Financial Assistant</h1>
          <p className="text-xs text-muted-foreground">
            Manage expenses, settings, and run analysis through conversation
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => clearMutation.mutate()}
          className="text-muted-foreground"
          data-testid="button-clear-chat"
        >
          <Trash2 className="w-4 h-4 mr-1" />
          Clear
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Truck className="w-6 h-6 text-primary" />
            </div>
            <h2 className="font-semibold text-sm mb-1">Welcome to FleetFinance</h2>
            <p className="text-xs text-muted-foreground max-w-sm mb-4">
              I'm your financial assistant. Add expenses, check gas prices,
              run scenarios, and manage your logistics financials through chat.
            </p>
            <div className="flex flex-wrap gap-2 max-w-md justify-center">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="px-3 py-1.5 text-xs rounded-full border border-border hover:bg-accent transition-colors"
                  data-testid={`suggestion-${s.slice(0, 15)}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            data-testid={`chat-message-${msg.id}`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Truck className="w-3.5 h-3.5 text-primary" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-lg px-3.5 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-card-border"
              }`}
            >
              {msg.role === "assistant" ? (
                <div
                  className="leading-relaxed [&_strong]:font-semibold [&_table]:my-2"
                  dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                />
              ) : (
                <p className="leading-relaxed">{msg.content}</p>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {sendMutation.isPending && (
          <div className="flex gap-3 items-start">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Truck className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="bg-card border border-card-border rounded-lg px-3.5 py-2.5">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Try "Add fixed expense Truck Wash $200" or "Show my profit"...'
            className="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring min-h-[40px] max-h-[120px]"
            rows={1}
            data-testid="input-chat"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sendMutation.isPending}
            size="sm"
            className="h-[40px] px-3"
            data-testid="button-send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
