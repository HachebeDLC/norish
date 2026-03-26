import * as cheerio from "cheerio";
import { serverLogger as log } from "@norish/shared-server/logger";

export interface HelloFreshTokenData {
  token: string;
  expiresAt: number;
}

export interface HelloFreshRecipeItem {
  id: string;
  name: string;
  headline: string;
  descriptionMarkdown: string;
  cardLink: string;
  difficulty: number;
  prepTime: string;
  totalTime: string;
  imagePath: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  canonical: string;
  isAddon: boolean;
  active: boolean;
  yields: any[];
  steps: any[];
  ingredients: any[];
  nutrition: any;
  tags: any[];
  allergens: any[];
  label: any;
  cuisines: any[];
  utensils: any[];
}

export interface HelloFreshRecipesResponse {
  items: HelloFreshRecipeItem[];
  total: number;
  take: number;
  skip: number;
}

export class HelloFreshClient {
  private static cache: HelloFreshTokenData | null = null;
  private readonly tokenSourceUrl = "https://www.hellofresh.es";

  /**
   * Get a valid API token, either from cache or by fetching it.
   */
  async getToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    
    if (HelloFreshClient.cache && HelloFreshClient.cache.expiresAt > now + 3600) {
      return HelloFreshClient.cache.token;
    }

    log.info("Fetching fresh HelloFresh API token...");
    const tokenData = await this.fetchToken();
    
    HelloFreshClient.cache = {
      token: tokenData.token,
      expiresAt: now + tokenData.expiresIn
    };

    return tokenData.token;
  }

  /**
   * Fetch token from the HelloFresh homepage.
   */
  private async fetchToken(): Promise<{ token: string; expiresIn: number }> {
    const response = await fetch(this.tokenSourceUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.5",
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch HelloFresh homepage: ${response.statusText}`);
    }

    const html = await response.text();
    return this.parseTokenFromHtml(html);
  }

  /**
   * Parse token from Next.js data script.
   */
  private parseTokenFromHtml(html: string): { token: string; expiresIn: number } {
    const $ = cheerio.load(html);
    const nextDataScript = $("#__NEXT_DATA__").html();

    if (!nextDataScript) {
      throw new Error("Could not find __NEXT_DATA__ script tag in HelloFresh HTML response");
    }

    const jsonData = JSON.parse(nextDataScript);
    let token: string | null = null;
    let expiresIn: number | null = null;

    // Try primary path
    const serverAuth = jsonData.props?.pageProps?.ssrPayload?.serverAuth;
    if (serverAuth && typeof serverAuth === "object") {
      token = serverAuth.access_token;
      expiresIn = serverAuth.expires_in;
    }

    // Fallback: Regex for any JWT in the whole script content
    if (!token || !token.startsWith("eyJ") || token.includes("|")) {
      const jwtPattern = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9\._-]+/g;
      const matches = nextDataScript.match(jwtPattern);
      if (matches && matches.length > 0) {
        token = matches[0];
        expiresIn = expiresIn || 2629743;
      }
    }

    if (!token || !expiresIn) {
      throw new Error("Could not find a valid JWT access_token in HelloFresh HTML response");
    }

    return { token, expiresIn: Number(expiresIn) };
  }

  /**
   * Fetch recipes from the HelloFresh API.
   */
  async getRecipes(
    countryCode: string,
    locale: string,
    page: number = 1,
    take: number = 50,
    domain: string = "https://www.hellofresh.es"
  ): Promise<HelloFreshRecipesResponse> {
    const token = await this.getToken();
    const skip = (page - 1) * take;
    const url = new URL(`${domain}/gw/recipes/recipes`);
    
    url.searchParams.append("skip", skip.toString());
    url.searchParams.append("take", take.toString());
    url.searchParams.append("locale", locale);
    url.searchParams.append("country", countryCode.toUpperCase());

    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-HelloFresh-Country": countryCode.toUpperCase(),
        "X-HelloFresh-Locale": locale,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      }
    });

    if (response.status === 401) {
      // Invalidate cache and retry once
      HelloFreshClient.cache = null;
      return this.getRecipes(countryCode, locale, page, take, domain);
    }

    if (!response.ok) {
      throw new Error(`HelloFresh API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as HelloFreshRecipesResponse;
  }

  /**
   * Fetch a single recipe by ID.
   */
  async getRecipe(
    countryCode: string,
    locale: string,
    recipeId: string,
    domain: string = "https://www.hellofresh.es"
  ): Promise<HelloFreshRecipeItem> {
    const token = await this.getToken();
    const url = new URL(`${domain}/gw/recipes/recipes/${recipeId}`);
    
    url.searchParams.append("locale", locale);
    url.searchParams.append("country", countryCode.toUpperCase());

    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Bearer ${token}`,
        "X-HelloFresh-Country": countryCode.toUpperCase(),
        "X-HelloFresh-Locale": locale,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      }
    });

    if (response.status === 401) {
      HelloFreshClient.cache = null;
      return this.getRecipe(countryCode, locale, recipeId, domain);
    }

    if (!response.ok) {
      throw new Error(`HelloFresh API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as HelloFreshRecipeItem;
  }
}
