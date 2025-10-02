import { CollapsiblePanel } from "@/components/CollapsiblePanel";
import { ImageProviderSelector, type ImageSettings } from "@/components/settings/ImageProviderSelector";

export function ImageSettingsPanel({ value, onChange, defaultOpen = true }: {
  value: ImageSettings;
  onChange: (next: ImageSettings) => void;
  defaultOpen?: boolean;
}) {
  return (
    <CollapsiblePanel title="Image Generation" defaultOpen={defaultOpen}>
      <ImageProviderSelector value={value} onChange={onChange} />
    </CollapsiblePanel>
  );
}

