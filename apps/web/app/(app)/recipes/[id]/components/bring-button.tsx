"use client";

import { Button } from "@heroui/react";
import { generateBringDeeplink, BRING_BRAND_COLOR } from "@norish/shared";
import { useTranslations } from "next-intl";

import { useRecipeContext } from "../context";

export default function BringButton() {
  const t = useTranslations("common.actions");
  const { recipe } = useRecipeContext();

  if (!recipe) return null;

  const handleSendToBring = () => {
    if (typeof window === "undefined") return;

    // Bring! fetches this URL and parses itemprop="ingredients" elements from it.
    // The recipe page must include schema.org/Recipe markup — see RecipeSchema below.
    const url = generateBringDeeplink(window.location.href);
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
