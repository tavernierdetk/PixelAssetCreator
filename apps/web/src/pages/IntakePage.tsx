import { FormEvent, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";


import { commitLite, validateLite } from "@/lib/api";
import type { CharacterDefinitionLite, AgeRange, HeightCategory, Build } from "@/types";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";


const AGE_OPTIONS: AgeRange[] = ["child", "teen", "adult", "elder"];
const HEIGHT_OPTIONS: HeightCategory[] = ["short", "average", "tall"];
const BUILD_OPTIONS: Build[] = ["slim", "average", "heavy", "muscular"];


function toSlug(name: string) {
return name
.toLowerCase()
.trim()
.replace(/[^a-z0-9]+/g, "-")
.replace(/(^-|-$)/g, "");
}


export default function IntakePage(): JSX.Element {


const nav = useNavigate();


const [form, setForm] = useState<CharacterDefinitionLite>({
client_ready: true,
identity: { char_name: "" },
personality: { desire: "", fear: "", flaw: "", traits: [] },
physical: {
age_range: "adult",
height_category: "average",
build: "average",
skin_tone: "tan",
hair_color: "brown",
eye_color: "green",
},
});
const [traitsText, setTraitsText] = useState("");


const derivedSlug = useMemo(
() => toSlug(form.identity.char_name || form.identity.char_slug || ""),
[form.identity]
);


function shapeForSubmit(): CharacterDefinitionLite {
return {
...form,
identity: { char_name: form.identity.char_name, ...(form.identity.char_slug ? { char_slug: form.identity.char_slug } : {}) },
personality: {
...form.personality,
traits: traitsText.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8),
},
};
}


const validateM = useMutation<{ ok: boolean; errors?: unknown }, Error, void>({
mutationFn: async () => validateLite(shapeForSubmit()),
});

const commitM = useMutation<{ ok: boolean; slug: string; file: string }, Error, void>({
  mutationFn: async () => {
    const shaped = shapeForSubmit();
    const v = await validateLite(shaped);
    if (!v.ok) throw new Error("Validation failed");
    return commitLite(shaped);
  },
  onSuccess: (data) => nav(`/characters/${data.slug}`),
});

function onSubmit(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  commitM.mutate();
}

return (
  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <h1 className="text-2xl font-semibold mb-4">Character Intake</h1>

    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <p className="text-sm text-slate-600">
            Fill the lite definition and save. The API will write a JSON file under
            <code className="mx-1">ASSET_ROOT/&lt;slug&gt;/</code> and the UI will navigate to the detail page.
          </p>
          <div className="text-right text-xs text-slate-500">
            <div>
              <span className="font-medium">Derived slug:</span>{" "}
              <code>{derivedSlug || "(none)"}</code>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-5">
          <fieldset className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="char_name">Character Name</Label>
              <Input
                id="char_name"
                value={form.identity.char_name}
                onChange={(e) =>
                  setForm({ ...form, identity: { ...form.identity, char_name: e.target.value } })
                }
                placeholder="e.g., Stubby"
                required
              />
            </div>
            <div className="flex items-center gap-2 mt-6 sm:mt-0">
              <input
                id="client_ready"
                type="checkbox"
                className="h-4 w-4"
                checked={form.client_ready}
                onChange={(e) => setForm({ ...form, client_ready: e.target.checked })}
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
                value={form.personality.desire}
                onChange={(e) =>
                  setForm({ ...form, personality: { ...form.personality, desire: e.target.value } })
                }
              />
            </div>
            <div>
              <Label htmlFor="fear">Fear</Label>
              <Input
                id="fear"
                value={form.personality.fear}
                onChange={(e) =>
                  setForm({ ...form, personality: { ...form.personality, fear: e.target.value } })
                }
              />
            </div>
            <div>
              <Label htmlFor="flaw">Flaw</Label>
              <Input
                id="flaw"
                value={form.personality.flaw}
                onChange={(e) =>
                  setForm({ ...form, personality: { ...form.personality, flaw: e.target.value } })
                }
              />
            </div>
          </fieldset>

          <div>
            <Label htmlFor="traits">Traits (comma-separated, max 8)</Label>
            <Textarea
              id="traits"
              value={traitsText}
              onChange={(e) => setTraitsText(e.target.value)}
              placeholder="e.g., brave, witty, loyal"
            />
          </div>

          <fieldset className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="age_range">Age Range</Label>
              <select
                id="age_range"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                value={form.physical.age_range}
                onChange={(e) =>
                  setForm({
                    ...form,
                    physical: { ...form.physical, age_range: e.target.value as AgeRange },
                  })
                }
              >
                {AGE_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="height">Height</Label>
              <select
                id="height"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                value={form.physical.height_category}
                onChange={(e) =>
                  setForm({
                    ...form,
                    physical: {
                      ...form.physical,
                      height_category: e.target.value as HeightCategory,
                    },
                  })
                }
              >
                {HEIGHT_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="build">Build</Label>
              <select
                id="build"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                value={form.physical.build}
                onChange={(e) =>
                  setForm({
                    ...form,
                    physical: { ...form.physical, build: e.target.value as Build },
                  })
                }
              >
                {BUILD_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <fieldset className="grid sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="skin_tone">Skin Tone</Label>
              <div className="flex gap-2">
                <Input
                  id="skin_tone"
                  value={form.physical.skin_tone}
                  onChange={(e) =>
                    setForm({ ...form, physical: { ...form.physical, skin_tone: e.target.value } })
                  }
                />
                <input
                  type="color"
                  aria-label="skin tone color picker"
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(form.physical.skin_tone)
                      ? form.physical.skin_tone
                      : "#a36c3f"
                  }
                  onChange={(e) =>
                    setForm({ ...form, physical: { ...form.physical, skin_tone: e.target.value } })
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="hair_color">Hair Color</Label>
              <div className="flex gap-2">
                <Input
                  id="hair_color"
                  value={form.physical.hair_color}
                  onChange={(e) =>
                    setForm({ ...form, physical: { ...form.physical, hair_color: e.target.value } })
                  }
                />
                <input
                  type="color"
                  aria-label="hair color picker"
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(form.physical.hair_color)
                      ? form.physical.hair_color
                      : "#5b3b1a"
                  }
                  onChange={(e) =>
                    setForm({ ...form, physical: { ...form.physical, hair_color: e.target.value } })
                  }
                />
              </div>
            </div>
            <div>
              <Label htmlFor="eye_color">Eye Color</Label>
              <div className="flex gap-2">
                <Input
                  id="eye_color"
                  value={form.physical.eye_color}
                  onChange={(e) =>
                    setForm({ ...form, physical: { ...form.physical, eye_color: e.target.value } })
                  }
                />
                <input
                  type="color"
                  aria-label="eye color picker"
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(form.physical.eye_color)
                      ? form.physical.eye_color
                      : "#2e7f4f"
                  }
                  onChange={(e) =>
                    setForm({ ...form, physical: { ...form.physical, eye_color: e.target.value } })
                  }
                />
              </div>
            </div>
          </fieldset>

          <div className="flex gap-2">
            <Button type="button" onClick={() => validateM.mutate()} disabled={validateM.isPending}>
              {validateM.isPending ? "Validating…" : "Validate"}
            </Button>
            <Button type="submit" disabled={false /* wire commitM here if present */}>
              Save & Continue
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  </motion.div>
);

}