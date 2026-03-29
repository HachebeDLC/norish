"use client";

import React from "react";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/16/solid";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { BRING_BRAND_COLOR, generateBringImportUrl, type BringItem } from "@norish/shared";

import { useRecipeContextRequired } from "../context";

export default function BringButton() {
  const { recipe, currentServings } = useRecipeContextRequired();
  const t = useTranslations("common.actions");

  const handleSendToBring = () => {
    // Map recipe ingredients to Bring! items
    // Using current servings to calculate amounts
    const servingsFactor = currentServings / (recipe.servings || 1);
    
    const items: BringItem[] = recipe.ingredients.map((ing) => {
      const amount = ing.amount ? (ing.amount * servingsFactor) : null;
      // Format: "150 g" or just "Milk"
      const spec = amount ? `${amount % 1 === 0 ? amount : amount.toFixed(1)} ${ing.unit || ""}`.trim() : "";
      
      return {
        itemId: ing.name,
        spec: spec,
      };
    });

    const url = generateBringImportUrl(items);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Button
      className="w-full text-white"
      style={{ backgroundColor: BRING_BRAND_COLOR }}
      startContent={<ArrowTopRightOnSquareIcon className="h-5 w-5" />}
      onPress={handleSendToBring}
    >
      {t("sendToBring")}
    </Button>
  );
}
