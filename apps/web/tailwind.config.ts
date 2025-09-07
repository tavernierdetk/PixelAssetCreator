import type { Config } from "tailwindcss";


export default {
content: [
"./index.html",
"./src/**/*.{ts,tsx}",
],
theme: {
extend: {
borderRadius: {
xl2: "1.25rem",
}
},
},
plugins: [],
} satisfies Config;