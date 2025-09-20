// apps/web/src/components/character/CharacterForm.tsx

// apps/web/src/components/character/CharacterForm.tsx
import { ReactNode, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  CharacterDefinitionLite,
  AgeRange,
  HeightCategory,
  Build,
  Gender,
  CharacterStats,
} from "@/types";

// ────────────────────────────────────────────────────────────────────────────
// Local options + helpers
// ────────────────────────────────────────────────────────────────────────────
const AGE_OPTIONS: ReadonlyArray<AgeRange> = [
  "child",
  "teen",
  "young_adult",
  "adult",
  "middle_aged",
  "elder",
] as const;

const HEIGHT_OPTIONS: ReadonlyArray<HeightCategory> = [
  "short",
  "average",
  "tall",
] as const;

const BUILD_OPTIONS: ReadonlyArray<Build> = [
  "slim",
  "average",
  "muscular",
  "heavy",
  "lithe",
  "stocky",
  "other",
] as const;

const GENDER_OPTIONS: ReadonlyArray<Gender> = [
  "male",
  "female",
  "nonbinary",
  "unspecified",
] as const;

function parseIntSafe(v: string, fallback: number = 0): number {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// ────────────────────────────────────────────────────────────────────────────
// Small local UI helpers
// ────────────────────────────────────────────────────────────────────────────
function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  return (
    <div className="rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <span className="font-medium">{title}</span>
        <span className="text-xs text-slate-500">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="px-3 pb-3 pt-1 grid gap-4">{children}</div> : null}
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
  options: ReadonlyArray<T>;
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

// ────────────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────────────
export function CharacterForm({
  value,
  onChange,
  traitsText,
  onTraitsTextChange,
  valuesText,
  onValuesTextChange,
  featuresText,
  onFeaturesTextChange,
  actions,
  disabled = false,
}: {
  value: CharacterDefinitionLite;
  onChange: (next: CharacterDefinitionLite) => void;
  traitsText: string;
  onTraitsTextChange: (s: string) => void;
  valuesText: string;
  onValuesTextChange: (s: string) => void;
  featuresText: string;
  onFeaturesTextChange: (s: string) => void;
  actions?: ReactNode;
  disabled?: boolean;
}) {
  const set = (patch: Partial<CharacterDefinitionLite>) =>
    onChange({ ...value, ...patch });

  const stats: CharacterStats = value.stats ?? {
    creature_affinity: 10,
    chaos_mastery: 10,
    kinesthetic: 10,
    lucidity: 10,
    terrain_control: 10,
  };

  return (
    <div className="grid gap-4">
      {/* Top-line status and message */}
      <fieldset className="grid sm:grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
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
        <div>
          <Label htmlFor="message">Message (notes / prompt)</Label>
          <Input
            id="message"
            value={s(value.message)}
            onChange={(e) => set({ message: e.target.value })}
            placeholder="Optional message to guide assistant"
            disabled={disabled}
          />
        </div>
      </fieldset>

      {/* Identity */}
      <CollapsibleSection title="Identity">
        <fieldset className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="char_name">Character Name</Label>
            <Input
              id="char_name"
              value={value.identity.char_name}
              onChange={(e) =>
                set({
                  identity: { ...value.identity, char_name: e.target.value },
                })
              }
              placeholder="e.g., Aria"
              disabled={disabled}
              required
            />
          </div>
          <div>
            <Label htmlFor="archetype">Archetype</Label>
            <Input
              id="archetype"
              value={s(value.identity.archetype)}
              onChange={(e) =>
                set({
                  identity: { ...value.identity, archetype: e.target.value },
                })
              }
              placeholder="e.g., Trickster, Mentor"
              disabled={disabled}
            />
          </div>
        </fieldset>

        <fieldset className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="vibe">Identity Vibe</Label>
            <Input
              id="vibe"
              value={s(value.identity.vibe)}
              onChange={(e) =>
                set({ identity: { ...value.identity, vibe: e.target.value } })
              }
              placeholder="e.g., Cozy gothic, Solar punk"
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="char_slug">Slug (readonly)</Label>
            <Input id="char_slug" value={value.identity.char_slug} disabled />
          </div>
        </fieldset>
      </CollapsibleSection>

      {/* Personality */}
      <CollapsibleSection title="Personality">
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

        <fieldset className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="quirk">Quirk</Label>
            <Input
              id="quirk"
              value={s(value.personality.quirk)}
              onChange={(e) =>
                set({
                  personality: { ...value.personality, quirk: e.target.value },
                })
              }
              placeholder="odd habit, catchphrase..."
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="values">Values (comma-separated, max 5)</Label>
            <Textarea
              id="values"
              value={valuesText}
              onChange={(e) => onValuesTextChange(e.target.value)}
              disabled={disabled}
              placeholder="honesty, curiosity…"
            />
          </div>
        </fieldset>

        <div>
          <Label htmlFor="traits">Traits (comma-separated, min 2 / max 6)</Label>
          <Textarea
            id="traits"
            value={traitsText}
            onChange={(e) => onTraitsTextChange(e.target.value)}
            disabled={disabled}
            placeholder="brave, witty, loyal"
          />
        </div>
      </CollapsibleSection>

      {/* Physical */}
      <CollapsibleSection title="Physical">
        <fieldset className="grid sm:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="species">Species</Label>
            <Input
              id="species"
              value={s(value.physical.species)}
              onChange={(e) =>
                set({ physical: { ...value.physical, species: e.target.value } })
              }
              placeholder="human, elf, android…"
              disabled={disabled}
            />
          </div>
          <SelectField<Gender>
            id="gender"
            label="Gender"
            value={value.physical.gender}
            options={GENDER_OPTIONS}
            set={(v: Gender) =>
              set({ physical: { ...value.physical, gender: v } })
            }
            disabled={disabled}
          />
          <SelectField<AgeRange>
            id="age"
            label="Age Range"
            value={value.physical.age_range}
            options={AGE_OPTIONS}
            set={(v: AgeRange) =>
              set({ physical: { ...value.physical, age_range: v } })
            }
            disabled={disabled}
          />
        </fieldset>

        <fieldset className="grid sm:grid-cols-3 gap-4">
          <SelectField<HeightCategory>
            id="height"
            label="Height"
            value={value.physical.height_category}
            options={HEIGHT_OPTIONS}
            set={(v: HeightCategory) =>
              set({ physical: { ...value.physical, height_category: v } })
            }
            disabled={disabled}
          />
          <SelectField<Build>
            id="build"
            label="Build"
            value={value.physical.build}
            options={BUILD_OPTIONS}
            set={(v: Build) =>
              set({ physical: { ...value.physical, build: v } })
            }
            disabled={disabled}
          />
          <div>
            <Label htmlFor="hair_style">Hair Style</Label>
            <Input
              id="hair_style"
              value={s(value.physical.hair_style)}
              onChange={(e) =>
                set({
                  physical: { ...value.physical, hair_style: e.target.value },
                })
              }
              placeholder="bob cut, mohawk…"
              disabled={disabled}
            />
          </div>
        </fieldset>

        <fieldset className="grid sm:grid-cols-3 gap-4">
          <ColorField
            id="skin_tone"
            label="Skin Tone"
            value={value.physical.skin_tone}
            set={(v: string) =>
              set({ physical: { ...value.physical, skin_tone: v } })
            }
            disabled={disabled}
            fallback="#a36c3f"
          />
          <ColorField
            id="hair_color"
            label="Hair Color"
            value={value.physical.hair_color}
            set={(v: string) =>
              set({ physical: { ...value.physical, hair_color: v } })
            }
            disabled={disabled}
            fallback="#5b3b1a"
          />
          <ColorField
            id="eye_color"
            label="Eye Color"
            value={value.physical.eye_color}
            set={(v: string) =>
              set({ physical: { ...value.physical, eye_color: v } })
            }
            disabled={disabled}
            fallback="#2e7f4f"
          />
        </fieldset>

        <fieldset className="grid sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="distinctive_features">
              Distinctive Features (comma-separated, max 6)
            </Label>
            <Textarea
              id="distinctive_features"
              value={featuresText}
              onChange={(e) => onFeaturesTextChange(e.target.value)}
              disabled={disabled}
              placeholder="scar over eyebrow, heterochromia…"
            />
          </div>
          <div>
            <Label htmlFor="aesthetic_vibe">Physical Aesthetic Vibe</Label>
            <Input
              id="aesthetic_vibe"
              value={s(value.physical.aesthetic_vibe)}
              onChange={(e) =>
                set({
                  physical: {
                    ...value.physical,
                    aesthetic_vibe: e.target.value,
                  },
                })
              }
              placeholder="noir, baroque, neon synth…"
              disabled={disabled}
            />
          </div>
        </fieldset>
      </CollapsibleSection>

      {/* Stats */}
      <CollapsibleSection title="Stats">
        <fieldset className="grid sm:grid-cols-3 gap-4">
          <NumberField
            id="creature_affinity"
            label="Creature Affinity"
            value={stats.creature_affinity}
            set={(n: number) =>
              set({ stats: { ...stats, creature_affinity: n } })
            }
            disabled={disabled}
          />
          <NumberField
            id="chaos_mastery"
            label="Chaos Mastery"
            value={stats.chaos_mastery}
            set={(n: number) => set({ stats: { ...stats, chaos_mastery: n } })}
            disabled={disabled}
          />
          <NumberField
            id="kinesthetic"
            label="Kinesthetic"
            value={stats.kinesthetic}
            set={(n: number) => set({ stats: { ...stats, kinesthetic: n } })}
            disabled={disabled}
          />
        </fieldset>
        <fieldset className="grid sm:grid-cols-2 gap-4">
          <NumberField
            id="lucidity"
            label="Lucidity"
            value={stats.lucidity}
            set={(n: number) => set({ stats: { ...stats, lucidity: n } })}
            disabled={disabled}
          />
          <NumberField
            id="terrain_control"
            label="Terrain Control"
            value={stats.terrain_control}
            set={(n: number) =>
              set({ stats: { ...stats, terrain_control: n } })
            }
            disabled={disabled}
          />
        </fieldset>
      </CollapsibleSection>

      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// Small number field with tight typing
function NumberField({
  id,
  label,
  value,
  set,
  disabled,
}: {
  id: string;
  label: string;
  value: number;
  set: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        value={String(value)}
        onChange={(e) => set(parseIntSafe(e.target.value, 0))}
        disabled={disabled}
      />
    </div>
  );
}
