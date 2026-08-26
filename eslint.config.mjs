import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    rules: {
      // React Compiler-oriented rule (eslint-plugin-react-hooks v7). Flags the
      // pre-compiler setState-in-effect idiom (hydration "mounted" flags,
      // setLoading(true) before a fetch) used throughout this codebase — not
      // bugs today, so keep it a warning instead of failing the build.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
