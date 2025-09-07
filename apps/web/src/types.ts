export type AgeRange = "child" | "teen" | "adult" | "elder";
export type HeightCategory = "short" | "average" | "tall";
export type Build = "slim" | "average" | "heavy" | "muscular";


export interface CharacterDefinitionLite {
client_ready: boolean;
identity: { char_name: string; char_slug?: string };
personality: { desire: string; fear: string; flaw: string; traits: string[] };
physical: {
age_range: AgeRange;
height_category: HeightCategory;
build: Build;
skin_tone: string;
hair_color: string;
eye_color: string;
};
}


export interface JobInfo {
id: string;
name: string;
state: "waiting" | "active" | "completed" | "failed" | string;
progress?: number;
returnvalue?: any;
}