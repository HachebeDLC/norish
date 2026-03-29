import { serverLogger as log } from "@norish/shared-server/logger";

export interface BringTokenData {
  token: string;
  uuid: string;
  expiresAt: number;
}

export interface BringListItem {
  name: string;
  specification: string;
}

export interface BringList {
  listUuid: string;
  name: string;
}

export class BringClient {
  // Map of email -> token data to support multiple users securely
  private static caches = new Map<string, BringTokenData>();
  private readonly baseUrl = "https://api.getbring.com/rest/v2";

  constructor(private email?: string, private password?: string) { }

  /**
   * Logs into Bring! and returns token data.
   * Handles caching per email.
   */
  async login(force: boolean = false): Promise<BringTokenData> {
    if (!this.email || !this.password) {
      throw new Error("Bring! credentials missing.");
    }

    const now = Math.floor(Date.now() / 1000);
    const cached = BringClient.caches.get(this.email);

    if (!force && cached && cached.expiresAt > now + 300) {
      return cached;
    }

    log.info({ email: this.email }, "Logging into Bring! API...");

    const response = await fetch(`${this.baseUrl}/bringauth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        email: this.email,
        password: this.password,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error({ status: response.status, errorText }, "Bring! login failed");
      throw new Error(`Bring! login failed: ${response.statusText}`);
    }

    const data = await response.json();

    const tokenData: BringTokenData = {
      token: data.access_token,
      uuid: data.uuid,
      expiresAt: now + data.expires_in,
    };

    BringClient.caches.set(this.email, tokenData);

    return tokenData;
  }

  /**
   * Internal helper to make authenticated requests.
   *
   * Bring! v2 requires the token as `X-Access-Token`, not `Authorization: Bearer`.
   * Automatically retries once on 401 by forcing a fresh login.
   */
  private async request(
    url: string,
    options: RequestInit = {},
    retry = true
  ): Promise<Response> {
    const auth = await this.login();

    const mergedOptions: RequestInit = {
      ...options,
      headers: {
        ...options.headers,
        // Bring! v2 API uses X-Access-Token, not Authorization: Bearer
        "X-Access-Token": auth.token,
      },
    };

    const response = await fetch(url, mergedOptions);

    // Force re-login and retry once on 401
    if (response.status === 401 && retry && this.email) {
      log.warn(
        { email: this.email },
        "Bring! token expired or invalid, retrying login..."
      );
      BringClient.caches.delete(this.email);
      return this.request(url, options, false);
    }

    return response;
  }

  async loadLists(): Promise<BringList[]> {
    const auth = await this.login();
    const response = await this.request(
      `${this.baseUrl}/users/${auth.uuid}/lists`
    );

    if (!response.ok)
      throw new Error(`Failed to load Bring! lists: ${response.statusText}`);

    const data = await response.json();
    return data.lists;
  }

  async getItems(
    listUuid: string
  ): Promise<{ purchase: BringListItem[]; recently: BringListItem[] }> {
    const response = await this.request(
      `${this.baseUrl}/bringlists/${listUuid}`
    );

    if (!response.ok)
      throw new Error(`Failed to load Bring! items: ${response.statusText}`);

    return response.json();
  }

  async saveItem(
    listUuid: string,
    name: string,
    specification: string = ""
  ): Promise<void> {
    const response = await this.request(
      `${this.baseUrl}/bringlists/${listUuid}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          uuid: listUuid,
          purchase: name,
          specification,
        }),
      }
    );

    if (!response.ok && response.status !== 204) {
      const errorText = await response.text();
      log.error(
        { status: response.status, errorText, name },
        "Failed to add item to Bring!"
      );
      throw new Error(`Failed to add item to Bring!: ${response.statusText}`);
    }
  }

  async completeItem(listUuid: string, name: string): Promise<void> {
    const response = await this.request(
      `${this.baseUrl}/bringlists/${listUuid}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          uuid: listUuid,
          recently: name,
        }),
      }
    );

    if (!response.ok && response.status !== 204) {
      const errorText = await response.text();
      log.error(
        { status: response.status, errorText, name },
        "Failed to complete item in Bring!"
      );
      throw new Error(
        `Failed to complete item in Bring!: ${response.statusText}`
      );
    }
  }
}
