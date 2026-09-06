import globals from "globals";

export default [
  {
    ignores: [
      "adreplica.js",
      "dist/**",
      "node_modules/**",
      ".runtime/**",
      "qa/**",
    ],
  },
  {
    files: ["src/**/*.mjs", "tests/**/*.mjs", "scripts/*.{cjs,mjs}", "*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
        __accessToken: "readonly",
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": [
        "error",
        { args: "none", caughtErrors: "none", ignoreRestSiblings: true },
      ],
      "no-unreachable": "error",
      "no-dupe-args": "error",
      "no-dupe-keys": "error",
      "no-constant-binary-expression": "error",
      "constructor-super": "error",
      "valid-typeof": "error",
    },
  },
];
