import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { LlmProviderSelector, type LlmSettings } from "@/components/settings/LlmProviderSelector";

export function LlmSettingsPanel({ value, onChange, defaultOpen = true }: {
  value: LlmSettings;
  onChange: (next: LlmSettings) => void;
  defaultOpen?: boolean;
}) {
  return (
    <CollapsiblePanel title="LLM Settings" defaultOpen={defaultOpen}>
      <LlmProviderSelector value={value} onChange={onChange} />
    </CollapsiblePanel>
  );
}

