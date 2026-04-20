// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { trpcLogger } from "@norish/shared-server/logger";

import {
  createStoreProcedure,
  listStoresProcedure,
  storesProcedures,
} from "../../src/routers/stores/stores";
import { router } from "../../src/trpc";
import {
  createMockAuthedContext,
  createMockHousehold,
  createMockUser,
} from "../calendar/test-utils";
import { assertHouseholdAccess } from "../mocks/permissions";

const storesRepository = vi.hoisted(() => ({
  checkStoreNameExistsInHousehold: vi.fn(),
  countGroceriesInStore: vi.fn(),
  createStore: vi.fn(),
  deleteStore: vi.fn(),
  getStoreOwnerId: vi.fn(),
  listStoresByUserIds: vi.fn(),
  reorderStores: vi.fn(),
  updateStore: vi.fn(),
}));

const storeEmitter = vi.hoisted(() => ({
  emitToHousehold: vi.fn(),
}));

const groceryEmitter = vi.hoisted(() => ({
  emitToHousehold: vi.fn(),
}));

vi.mock("@norish/db/repositories/stores", () => storesRepository);
vi.mock("@norish/auth/permissions", () => import("../mocks/permissions"));
vi.mock("@norish/queue", () => ({
  storeEmitter,
  groceryEmitter,
}));
vi.mock("@norish/shared-server/logger", () => ({
  trpcLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
  redisLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  serverLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  dbLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  authLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  wsLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  aiLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  schedulerLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  videoLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  parserLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const openApiStoresRouter = router({
  listStores: listStoresProcedure,
  createStore: createStoreProcedure,
});

describe("stores procedures", () => {
  const user = createMockUser();
  const household = createMockHousehold();
  const ctx = createMockAuthedContext(user, household);

  beforeEach(() => {
    vi.clearAllMocks();
    storesRepository.getStoreOwnerId.mockResolvedValue(ctx.user.id);
    assertHouseholdAccess.mockResolvedValue(undefined);
  });

  it("logs stale store updates as no-ops", async () => {
    const storeId = crypto.randomUUID();
    storesRepository.updateStore.mockResolvedValue(null);

    const caller = storesProcedures.createCaller({ ...ctx, multiplexer: null } as any);
    const result = await caller.update({
      id: storeId,
      version: 3,
      name: "Pantry",
    });

    expect(result).toEqual({ success: true, stale: true });
    expect(trpcLogger.info).toHaveBeenCalledWith(
      { userId: ctx.user.id, storeId, version: 3 },
      "Ignoring stale store update mutation"
    );
    expect(storeEmitter.emitToHousehold).not.toHaveBeenCalled();
  });

  it("logs stale store reorders as no-ops", async () => {
    const storeId = crypto.randomUUID();

    storesRepository.reorderStores.mockResolvedValue([]);

    const caller = storesProcedures.createCaller({ ...ctx, multiplexer: null } as any);
    const result = await caller.reorder({ stores: [{ id: storeId, version: 2 }] });

    expect(result).toEqual([]);
    expect(trpcLogger.info).toHaveBeenCalledWith(
      { userId: ctx.user.id, storeCount: 0 },
      "Stores reordered"
    );
    expect(storeEmitter.emitToHousehold).not.toHaveBeenCalled();
  });

  it("logs partial store reorders and emits only applied stores", async () => {
    const storeA = crypto.randomUUID();
    const storeB = crypto.randomUUID();
    const reorderedStore = {
      id: storeA,
      name: "Pantry",
      color: "primary",
      icon: "Cart",
      sortOrder: 0,
      version: 1,
    };

    storesRepository.reorderStores.mockResolvedValue([reorderedStore]);

    const caller = storesProcedures.createCaller({ ...ctx, multiplexer: null } as any);
    const result = await caller.reorder({
      stores: [
        { id: storeA, version: 1 },
        { id: storeB, version: 4 },
      ],
    });

    expect(result).toEqual([reorderedStore]);
    expect(trpcLogger.info).toHaveBeenCalledWith(
      { userId: ctx.user.id, storeCount: 1 },
      "Stores reordered"
    );
    expect(storeEmitter.emitToHousehold).toHaveBeenCalledWith(ctx.householdKey, "reordered", {
      stores: [reorderedStore],
    });
  });

  it("lists stores for the API endpoint", async () => {
    const stores = [
      {
        id: crypto.randomUUID(),
        userId: ctx.user.id,
        name: "Pantry",
        color: "primary",
        icon: "ShoppingBagIcon",
        sortOrder: 0,
        version: 1,
      },
    ];

    storesRepository.listStoresByUserIds.mockResolvedValue(stores);

    const caller = openApiStoresRouter.createCaller({ ...ctx, multiplexer: null } as any);
    const result = await caller.listStores();

    expect(result).toEqual(stores);
  });

  it("creates and returns a store for the API endpoint", async () => {
    storesRepository.checkStoreNameExistsInHousehold.mockResolvedValue(false);
    storesRepository.createStore.mockImplementation(
      async (id: string, data: Record<string, unknown>) => ({
        id,
        ...data,
        version: 1,
      })
    );

    const caller = openApiStoresRouter.createCaller({ ...ctx, multiplexer: null } as any);
    const result = await caller.createStore({
      name: "Market",
      color: "primary",
      icon: "ShoppingBagIcon",
    });

    expect(result).toEqual(
      expect.objectContaining({
        name: "Market",
        userId: ctx.user.id,
      })
    );
    expect(storeEmitter.emitToHousehold).toHaveBeenCalledWith(
      ctx.householdKey,
      "created",
      expect.objectContaining({
        store: expect.objectContaining({ name: "Market" }),
      })
    );
  });
});
