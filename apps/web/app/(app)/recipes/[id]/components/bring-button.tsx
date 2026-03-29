"use client";

import React from "react";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/16/solid";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { BRING_BRAND_COLOR, generateBringDeeplink } from "@norish/shared";

import { useRecipeContextRequired } from "../context";

export default function BringButton() {
  const { recipe, currentServings } = useRecipeContextRequired();
  const t = useTranslations("common.actions");

  // If we don't have a URL, we can't generate a Bring! deeplink because
  // Bring! needs to crawl the page for schema.org markup.
  // In a real app, we might want to generate a canonical URL for our own page
  // if it's publicly accessible.
  const recipeUrl = recipe.url || (typeof window !== "undefined" ? window.location.href : "");

  if (!recipeUrl) {
    return null;
  }

  const handleSendToBring = () => {
    const url = generateBringDeeplink(
      recipeUrl,
      recipe.servings || currentServings,
      currentServings
    );
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
