import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { BringClient } from "@norish/shared-server/services/bring/client";
import { getUserBringConfig } from "@norish/shared-server/services/bring/config";
import { syncToBring } from "@norish/shared-server/services/bring/sync";
import { trpcLogger as log } from "@norish/shared-server/logger";

import { authedProcedure } from "../../middleware";
import { router } from "../../trpc";

/**
 * Test credentials and return the user's Bring! lists.
 * Credentials are passed directly — nothing is saved yet.
 */
const getLists = authedProcedure
  .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
  .mutation(async ({ ctx, input }) => {
    log.info({ userId: ctx.user.id }, "Testing Bring! credentials and fetching lists");

    const client = new BringClient(input.email, input.password);
    try {
      await client.login(true);
      const lists = await client.loadLists();
      return { success: true as const, lists };
    } catch (error: any) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error?.message ?? "Invalid Bring! credentials",
      });
    }
  });

/**
 * Sync recipe ingredients to the user's configured Bring! list.
 * Credentials must already be saved via the settings card.
 */
const syncRecipe = authedProcedure
  .input(
    z.object({
      items: z.array(
        z.object({
          name: z.string().min(1),
          amount: z.string().optional(),
          unit: z.string().optional(),
        })
      ),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const config = await getUserBringConfig(ctx.user.id);

    if (!config.enabled) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Bring! is not configured. Add your credentials in Settings → Bring! Integration.",
      });
    }

    if (!config.listUuid) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No Bring! list selected. Choose a list in Settings → Bring! Integration.",
      });
    }

    log.info({ userId: ctx.user.id, itemCount: input.items.length }, "Syncing to Bring!");

    await syncToBring(ctx.user.id, input.items);

    return { success: true, count: input.items.length };
  });

export const bringProcedures = router({ getLists, syncRecipe });
