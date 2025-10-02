import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export type LlmSettings = {
  provider?: "openai"; // future: "anthropic", etc.
  chatModel?: string;
  chatAssistantId?: string;
  intermediaryAssistantId?: string;
  apiKey?: string; // optional per-project key
};

export function LlmProviderSelector({ value, onChange }: { value: LlmSettings; onChange: (next: LlmSettings) => void }) {
  const llm = value ?? {};
  return (
    <div className="grid gap-3">
      <div className="grid sm:grid-cols-3 gap-2 items-center">
        <Label>Provider</Label>
        <select
          className="border rounded p-2 text-sm sm:col-span-2"
          value={llm.provider ?? "openai"}
          onChange={(e) => onChange({ ...llm, provider: e.target.value as any })}
        >
          <option value="openai">OpenAI</option>
        </select>
      </div>
      <div>
        <Label>OpenAI API Key (project)</Label>
        <Input
          type="password"
          value={llm.apiKey ?? ""}
          onChange={(e) => onChange({ ...llm, apiKey: e.target.value })}
          placeholder="sk-... (optional; otherwise uses server env)"
        />
      </div>
      <div>
        <Label>Chat Model (fallback)</Label>
        <Input value={llm.chatModel ?? "gpt-4o-mini"} onChange={(e) => onChange({ ...llm, chatModel: e.target.value })} placeholder="gpt-4o-mini" />
      </div>
      <div>
        <Label>Chat Assistant ID</Label>
        <Input value={llm.chatAssistantId ?? ""} onChange={(e) => onChange({ ...llm, chatAssistantId: e.target.value })} placeholder="asst_..." />
      </div>
      <div>
        <Label>Intermediary Assistant ID</Label>
        <Input value={llm.intermediaryAssistantId ?? ""} onChange={(e) => onChange({ ...llm, intermediaryAssistantId: e.target.value })} placeholder="asst_..." />
      </div>
    </div>
  );
}
