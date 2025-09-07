import { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CharacterDefinitionLite, AgeRange, HeightCategory, Build } from "@/types";

const AGE_OPTIONS: AgeRange[] = ["child", "teen", "adult", "elder"];
const HEIGHT_OPTIONS: HeightCategory[] = ["short", "average", "tall"];
const BUILD_OPTIONS: Build[] = ["slim", "average", "heavy", "muscular"];

export function CharacterForm({
  value,
  onChange,
  traitsText,
  onTraitsTextChange,
  actions,
  disabled = false,
}: {
  value: CharacterDefinitionLite;
  onChange: (next: CharacterDefinitionLite) => void;
  traitsText: string;
  onTraitsTextChange: (s: string) => void;
  actions?: ReactNode;
  disabled?: boolean;
}) {
  const set = (patch: Partial<CharacterDefinitionLite>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="grid gap-4">
      <fieldset className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="char_name">Character Name</Label>
          <Input
            id="char_name"
            value={value.identity.char_name}
            onChange={(e) =>
              set({ identity: { ...value.identity, char_name: e.target.value } })
            }
            placeholder="e.g., Aria"
            disabled={disabled}
            required
          />
        </div>
        <div className="flex items-center gap-2 mt-6 sm:mt-0">
          <input
            id="client_ready"
            type="checkbox"
            className="h-4 w-4"
            checked={value.client_ready}
            onChange={(e) => set({ client_ready: e.target.checked })}
            disabled={disabled}
          />
          <Label htmlFor="client_ready" className="m-0">
            Client ready
          </Label>
        </div>
      </fieldset>

      <fieldset className="grid sm:grid-cols-3 gap-4">
        <div>
          <Label htmlFor="desire">Desire</Label>
          <Input
            id="desire"
            value={value.personality.desire}
            onChange={(e) =>
              set({
                personality: { ...value.personality, desire: e.target.value },
              })
            }
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor="fear">Fear</Label>
          <Input
            id="fear"
            value={value.personality.fear}
            onChange={(e) =>
              set({
                personality: { ...value.personality, fear: e.target.value },
              })
            }
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor="flaw">Flaw</Label>
          <Input
            id="flaw"
            value={value.personality.flaw}
            onChange={(e) =>
              set({
                personality: { ...value.personality, flaw: e.target.value },
              })
            }
            disabled={disabled}
          />
        </div>
      </fieldset>

      <div>
        <Label htmlFor="traits">Traits (comma-separated, max 8)</Label>
        <Textarea
          id="traits"
          value={traitsText}
          onChange={(e) => onTraitsTextChange(e.target.value)}
          disabled={disabled}
          placeholder="brave, witty, loyal"
        />
      </div>

      <fieldset className="grid sm:grid-cols-3 gap-4">
        <SelectField
          id="age"
          label="Age Range"
          value={value.physical.age_range}
          options={AGE_OPTIONS}
          set={(v) =>
            set({ physical: { ...value.physical, age_range: v as AgeRange } })
          }
          disabled={disabled}
        />
        <SelectField
          id="height"
          label="Height"
          value={value.physical.height_category}
          options={HEIGHT_OPTIONS}
          set={(v) =>
            set({
              physical: { ...value.physical, height_category: v as HeightCategory },
            })
          }
          disabled={disabled}
        />
        <SelectField
          id="build"
          label="Build"
          value={value.physical.build}
          options={BUILD_OPTIONS}
          set={(v) =>
            set({ physical: { ...value.physical, build: v as Build } })
          }
          disabled={disabled}
        />
      </fieldset>

      <fieldset className="grid sm:grid-cols-3 gap-4">
        <ColorField
          id="skin_tone"
          label="Skin Tone"
          value={value.physical.skin_tone}
          set={(v) =>
            set({ physical: { ...value.physical, skin_tone: v } })
          }
          disabled={disabled}
          fallback="#a36c3f"
        />
        <ColorField
          id="hair_color"
          label="Hair Color"
          value={value.physical.hair_color}
          set={(v) =>
            set({ physical: { ...value.physical, hair_color: v } })
          }
          disabled={disabled}
          fallback="#5b3b1a"
        />
        <ColorField
          id="eye_color"
          label="Eye Color"
          value={value.physical.eye_color}
          set={(v) =>
            set({ physical: { ...value.physical, eye_color: v } })
          }
          disabled={disabled}
          fallback="#2e7f4f"
        />
      </fieldset>

      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function SelectField<T extends string>({
  id,
  label,
  value,
  set,
  options,
  disabled,
}: {
  id: string;
  label: string;
  value: T;
  set: (v: T) => void;
  options: readonly T[];
  disabled?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        value={value}
        onChange={(e) => set(e.target.value as T)}
        disabled={disabled}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function ColorField({
  id,
  label,
  value,
  set,
  fallback,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  set: (v: string) => void;
  fallback: string;
  disabled?: boolean;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
        />
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={safe}
          onChange={(e) => set(e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
