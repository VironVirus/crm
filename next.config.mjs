import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD,
  PHASE_PRODUCTION_SERVER,
} from "next/constants.js";

const REQUIRED_PRODUCTION_ENVIRONMENT_VARIABLES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function validateProductionEnvironment(phase) {
  if (
    phase !== PHASE_PRODUCTION_BUILD &&
    phase !== PHASE_PRODUCTION_SERVER
  ) {
    return;
  }

  const missingVariables = REQUIRED_PRODUCTION_ENVIRONMENT_VARIABLES.filter(
    (name) => !process.env[name]?.trim(),
  );

  if (missingVariables.length > 0) {
    throw new Error(
      `Missing required production environment variable${
        missingVariables.length === 1 ? "" : "s"
      }: ${missingVariables.join(", ")}`,
    );
  }
}

/**
 * Keep development output separate from production builds so stale chunks and
 * styles do not get mixed together across `next dev` and `next build`.
 *
 * @param {string} phase
 * @returns {import("next").NextConfig}
 */
const nextConfig = (phase) => {
  validateProductionEnvironment(phase);

  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  };
};

export default nextConfig;
