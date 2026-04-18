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
  private static caches = new Map<string, BringTokenData>();
  private readonly baseUrl = "https://api.getbring.com/rest/v2";

  // Required by Bring!'s API on every authenticated request.
  // These mimic the web app client and are necessary for the lists
  // endpoint to return data rather than a blank error response.
  private readonly baseHeaders = {
    "X-BRING-API-KEY": "cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp",
    "X-BRING-CLIENT": "webApp",
    "X-BRING-CLIENT-INSTANCE-ID": "Norish-Integration",
    "X-BRING-COUNTRY": "DE",
    Accept: "application/json, text/plain, */*",
  };

  constructor(private email?: string, private password?: string) { }

  async login(force = false): Promise<BringTokenData> {
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
        ...this.baseHeaders,
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
      throw new Error(
        `Bring! login failed (${response.status}): ${errorText || response.statusText}`
      );
    }

    const data = await response.json();

    const tokenData: BringTokenData = {
      token: data.access_token,
      uuid: data.uuid,
      expiresAt: now + (data.expires_in ?? 3600),
    };

    BringClient.caches.set(this.email, tokenData);
    return tokenData;
  }

  private async request(
    url: string,
    options: RequestInit = {},
    retry = true
  ): Promise<Response> {
    const auth = await this.login();

    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.baseHeaders,
        ...options.headers,
        Authorization: `Bearer ${auth.token}`,
        "X-BRING-USER-UUID": auth.uuid,
      },
    });

    if (response.status === 401 && retry && this.email) {
      log.warn({ email: this.email }, "Bring! token expired, retrying...");
      BringClient.caches.delete(this.email);
      return this.request(url, options, false);
    }

    return response;
  }

  async loadLists(): Promise<BringList[]> {
    const auth = await this.login();
    const response = await this.request(
      `${this.baseUrl}/bringusers/${auth.uuid}/lists`
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to load Bring! lists (${response.status}): ${errorText || response.statusText}`
      );
    }

    const data = await response.json();
    return data.lists;
  }

  async getItems(
    listUuid: string
  ): Promise<{ purchase: BringListItem[]; recently: BringListItem[] }> {
    const response = await this.request(
      `${this.baseUrl}/bringlists/${listUuid}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to load Bring! items (${response.status}): ${errorText || response.statusText}`
      );
    }

    return response.json();
  }

  async saveItem(
    listUuid: string,
    name: string,
    specification = ""
  ): Promise<void> {
    const response = await this.request(
      `${this.baseUrl}/bringlists/${listUuid}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ uuid: listUuid, purchase: name, specification }),
      }
    );

    if (!response.ok && response.status !== 204) {
      const errorText = await response.text();
      log.error({ status: response.status, errorText, name }, "Failed to add item to Bring!");
      throw new Error(
        `Failed to add item to Bring! (${response.status}): ${errorText || response.statusText}`
      );
    }
  }

  async completeItem(listUuid: string, name: string): Promise<void> {
    const response = await this.request(
      `${this.baseUrl}/bringlists/${listUuid}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ uuid: listUuid, recently: name }),
      }
    );

    if (!response.ok && response.status !== 204) {
      const errorText = await response.text();
      log.error({ status: response.status, errorText, name }, "Failed to complete item in Bring!");
      throw new Error(
        `Failed to complete item in Bring! (${response.status}): ${errorText || response.statusText}`
      );
    }
  }
}
