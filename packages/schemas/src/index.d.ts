import AjvImport, { type ValidateFunction } from "ajv";
export declare const ajv: any;
export type CharacterLite = {
    client_ready: boolean;
    message?: string;
    identity: {
        char_name: string;
        char_slug: string;
        archetype?: string;
        vibe?: string;
    };
    personality: {
        desire: string;
        fear: string;
        flaw: string;
        traits: string[];
        quirk?: string;
        values?: string[];
    };
    physical: {
        species?: string;
        age_range: "child" | "teen" | "young_adult" | "adult" | "middle_aged" | "elder";
        gender?: "male" | "female" | "nonbinary" | "unspecified";
        height_category: "short" | "average" | "tall";
        build: "slim" | "average" | "muscular" | "heavy" | "lithe" | "stocky" | "other";
        skin_tone: string;
        hair_color: string;
        hair_style?: string;
        eye_color: string;
        distinctive_features?: string[];
        aesthetic_vibe?: string;
    };
};
export type AjvSummary = {
    message?: string;
    instancePath?: string;
    keyword?: string;
}[];
export declare const validateCharacterLite: ValidateFunction<CharacterLite>;
/**
 * Assistant payload validator:
 * - requires `message` to be a string
 * - validates the rest with the existing Character Lite schema
 */
export declare function validateAssistantChatPayload(input: unknown): {
    ok: true;
    message: string;
    draft: CharacterLite;
} | {
    ok: false;
    errors: AjvSummary;
};
declare const _default: {
    validateCharacterLite: AjvImport.ValidateFunction<CharacterLite>;
    validateAssistantChatPayload: typeof validateAssistantChatPayload;
};
export default _default;
export * as ulpc from "./ulpc/index.js";
