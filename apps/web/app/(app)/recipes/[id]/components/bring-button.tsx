"use client";

import { Button } from "@heroui/react";
import { generateBringWebUrl, BRING_BRAND_COLOR, type BringItem } from "@norish/shared";
import { useTranslations } from "next-intl";

import { useRecipeContext } from "../context";
import { useUnitFormatter } from "@/hooks/use-unit-formatter";

export default function BringButton() {
  const t = useTranslations("common.actions");
  const { recipe, adjustedIngredients } = useRecipeContext();
  const { formatUnitOnly } = useUnitFormatter();

  if (!recipe) return null;

  const handleSendToBring = () => {
    if (typeof window === "undefined") return;

    const ingredients =
      adjustedIngredients && adjustedIngredients.length > 0
        ? adjustedIngredients
        : recipe.recipeIngredients ?? [];

    if (ingredients.length === 0) return;

    const items: BringItem[] = ingredients
      .filter(
        (it) =>
          it.systemUsed === recipe.systemUsed &&
          !it.ingredientName?.trim().startsWith("#")
      )
      .map((it) => {
        const rawUnit = it.unit ? formatUnitOnly(it.unit, it.amount) : "";

        // Strip localised pluralisation suffixes like "gramo(s)", "sobre(s)",
        // "unidad(es)", "cucharada(s)", etc. that Bring! won't recognise.
        const unit = rawUnit.replace(/\([^)]*\)/g, "").trim();

        const spec = [it.amount, unit].filter(Boolean).join(" ").trim();

        return {
          itemId: it.ingredientName?.replace(/^#+\s*/, "") || "Unknown",
          spec,
        };
      });

    if (items.length === 0) return;

    const url = generateBringWebUrl(items);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Button
      fullWidth
      style={{ backgroundColor: BRING_BRAND_COLOR }}
      className="text-white font-semibold"
      onPress={handleSendToBring}
    >
      {t("sendToBring")}
    </Button>
  );
}
