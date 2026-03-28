"use client";

import { Button } from "@heroui/react";
import { generateBringWebUrl, BRING_BRAND_COLOR, type BringItem } from "@norish/shared";
import { useTranslations } from "next-intl";

import { useRecipeContextRequired } from "../context";
import { useUnitFormatter } from "@/hooks/use-unit-formatter";

export default function BringButton() {
  const t = useTranslations("common.actions");
  const { recipe, adjustedIngredients } = useRecipeContextRequired();
  const { formatUnitOnly } = useUnitFormatter();

  const handleSendToBring = () => {
    const ingredients = adjustedIngredients?.length > 0 ? adjustedIngredients : recipe.recipeIngredients;
    
    // Map Norish ingredients to BringItem format
    const items: BringItem[] = ingredients
      .filter((it) => it.systemUsed === recipe.systemUsed && !it.ingredientName.trim().startsWith("#"))
      .map((it) => {
        const unit = it.unit ? formatUnitOnly(it.unit, it.amount) : "";
        const spec = it.amount ? `${it.amount} ${unit}`.trim() : unit;
        
        return {
          itemId: it.ingredientName.replace(/^#+\s*/, ""), // Clean markdown headings just in case
          spec: spec,
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
