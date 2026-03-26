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
  private static cache: BringTokenData | null = null;
  private readonly baseUrl = "https://api.getbring.com/rest/v2";

  constructor(private email?: string, private password?: string) {}

  async login(): Promise<BringTokenData> {
    if (!this.email || !this.password) {
      throw new Error("Bring! credentials missing.");
    }

    const now = Math.floor(Date.now() / 1000);
    if (BringClient.cache && BringClient.cache.expiresAt > now + 300) {
      return BringClient.cache;
    }

    log.info("Logging into Bring! API...");
    
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
      throw new Error(`Bring! login failed: ${response.statusText}`);
    }

    const data = await response.json();
    
    BringClient.cache = {
      token: data.access_token,
      uuid: data.uuid,
      expiresAt: now + data.expires_in,
    };

    return BringClient.cache;
  }

  async loadLists(): Promise<BringList[]> {
    const auth = await this.login();
    const response = await fetch(`${this.baseUrl}/users/${auth.uuid}/lists`, {
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    });

    if (!response.ok) throw new Error("Failed to load Bring! lists");
    
    const data = await response.json();
    return data.lists;
  }

  async getItems(listUuid: string): Promise<{ purchase: BringListItem[], recently: BringListItem[] }> {
    const auth = await this.login();
    const response = await fetch(`${this.baseUrl}/bringlists/${listUuid}`, {
      headers: {
        Authorization: `Bearer ${auth.token}`,
      },
    });

    if (!response.ok) throw new Error("Failed to load Bring! items");
    
    return await response.json();
  }

  async saveItem(listUuid: string, name: string, specification: string = ""): Promise<void> {
    const auth = await this.login();
    const response = await fetch(`${this.baseUrl}/bringlists/${listUuid}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${auth.token}`,
      },
      body: new URLSearchParams({
        uuid: listUuid,
        purchase: name,
        specification: specification,
      }),
    });

    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to add item to Bring!: ${response.statusText}`);
    }
  }

  async completeItem(listUuid: string, name: string): Promise<void> {
    const auth = await this.login();
    const response = await fetch(`${this.baseUrl}/bringlists/${listUuid}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${auth.token}`,
      },
      body: new URLSearchParams({
        uuid: listUuid,
        recently: name,
      }),
    });

    if (!response.ok && response.status !== 204) {
      throw new Error(`Failed to complete item in Bring!: ${response.statusText}`);
    }
  }
}
