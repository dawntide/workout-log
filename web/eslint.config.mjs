import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Phase S 완료 후 legacy `components/ui/{card,primary-button,button}` 파일은 삭제됨.
// 이 규칙은 향후 누군가 동일한 이름의 모듈을 다시 만들 경우를 대비한 가드.
const LEGACY_UI_IMPORT_RULE = [
  "error",
  {
    patterns: [
      {
        group: [
          "@/components/ui/card",
          "@/components/ui/primary-button",
          "@/components/ui/button",
        ],
        message:
          'Use V2 primitives from "@/components/v2/primitives" instead. ' +
          "See web/src/components/v2/primitives/README.md.",
      },
    ],
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/set-state-in-effect": "off",
      "no-restricted-imports": LEGACY_UI_IMPORT_RULE,
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
