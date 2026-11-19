// The ElevenLabs models offered in Listen mode's settings, and the check a
// stored choice goes through. The list is Fret Not's.

import type { TtsModel } from "../shared/wire.ts";

export const ELEVEN_MODELS: TtsModel[] = [
  { id: "eleven_v4", label: "Eleven v4", note: "best quality, the default" },
  { id: "eleven_flash_v2_5", label: "Flash v2.5", note: "fastest, about half the price" },
  { id: "eleven_multilingual_v2", label: "Multilingual v2", note: "previous generation" },
  { id: "eleven_v3", label: "Eleven v3", note: "previous generation, expressive" },
];

export const DEFAULT_ELEVEN_MODEL = "eleven_v4";

export function isElevenModel(id: unknown): id is string {
  return typeof id === "string" && ELEVEN_MODELS.some((m) => m.id === id);
}
