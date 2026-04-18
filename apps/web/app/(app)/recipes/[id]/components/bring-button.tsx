"use client";

import { Button, addToast } from "@heroui/react";
import { BRING_BRAND_COLOR } from "@norish/shared";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { useRecipeContextRequired } from "../context";
import { useUnitFormatter } from "@/hooks/use-unit-formatter";
import { showSafeErrorToast } from "@/lib/ui/safe-error-toast";
import { useTRPC } from "@/app/providers/trpc-provider";

export default function BringButton() {
  const t = useTranslations("common.actions");
  const tBring = useTranslations("common.bring");
  const { recipe, adjustedIngredients } = useRecipeContextRequired();
  const { formatUnitOnly } = useUnitFormatter();
  const trpc = useTRPC();

  const syncMutation = useMutation(trpc.bring.syncRecipe.mutationOptions());

  const handleSendToBring = async () => {
    const ingredients =
      adjustedIngredients?.length > 0
        ? adjustedIngredients
        : recipe.recipeIngredients ?? [];

    const items = ingredients
      .filter(
        (it) =>
          it.systemUsed === recipe.systemUsed &&
          !it.ingredientName?.trim().startsWith("#")
      )
      .map((it) => {
        const rawUnit = it.unit ? formatUnitOnly(it.unit, it.amount) : "";
        const unit = rawUnit.replace(/\([^)]*\)/g, "").trim() || undefined;
        const amount = it.amount != null ? String(it.amount) : undefined;
        return {
          name: it.ingredientName?.replace(/^#+\s*/, "") || "Unknown",
          amount,
          unit,
        };
      });

    if (items.length === 0) return;

    try {
      const result = await syncMutation.mutateAsync({ items });
      addToast({
        title: tBring("syncSuccess", { count: result.count }),
        color: "success",
      });
    } catch (error: any) {
      if (error?.data?.code === "PRECONDITION_FAILED") {
        addToast({
          title: tBring("notConfigured"),
          description: tBring("notConfiguredHint"),
          color: "warning",
        });
      } else {
        showSafeErrorToast({
          title: tBring("syncError"),
          error,
          context: "bring-button:sync",
        });
      }
    }
  };

  return (
    <Button
      fullWidth
      style={{ backgroundColor: BRING_BRAND_COLOR }}
      className="text-white font-semibold"
      isLoading={syncMutation.isPending}
      onPress={handleSendToBring}
    >
      {t("sendToBring")}
    </Button>
  );
}
