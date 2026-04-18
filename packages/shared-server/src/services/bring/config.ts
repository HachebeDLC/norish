import { getTokensByUserAndDomain } from "@norish/db/repositories/site-auth-tokens";
import { serverLogger as log } from "@norish/shared-server/logger";

export interface UserBringConfig {
  email?: string;
  password?: string;
  listUuid?: string;
  enabled: boolean;
}

const BRING_DOMAIN = "getbring.com";

/**
 * Get Bring! configuration for a specific user.
 * Loads credentials from site_auth_tokens table.
 */
export async function getUserBringConfig(userId: string): Promise<UserBringConfig> {
  try {
    const tokens = await getTokensByUserAndDomain(userId, BRING_DOMAIN);
    
    if (tokens.length === 0) {
      return { enabled: false };
    }

    const config: UserBringConfig = { enabled: true };

    for (const token of tokens) {
      if (token.name === "email") config.email = token.value;
      if (token.name === "password") config.password = token.value;
      if (token.name === "list_uuid") config.listUuid = token.value;
    }

    // Basic validation: must have at least email and password to be considered "enabled"
    if (!config.email || !config.password) {
      return { ...config, enabled: false };
    }

    return config;
  } catch (error) {
    log.error({ err: error, userId }, "Failed to load user Bring! config");
    return { enabled: false };
  }
}
