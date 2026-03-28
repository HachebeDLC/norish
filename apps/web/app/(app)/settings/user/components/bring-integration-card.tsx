"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  addToast,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { showSafeErrorToast } from "@/lib/ui/safe-error-toast";
import { useTRPC } from "@/app/providers/trpc-provider";

export default function BringIntegrationCard() {
  const t = useTranslations("settings.user.bring");
  const tCommon = useTranslations("common.actions");
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Query tokens to check existing config
  const listQueryOptions = trpc.siteAuthTokens.list.queryOptions();
  const { data: tokens = [] } = useQuery(listQueryOptions);

  // Mutations
  const createMutation = useMutation(trpc.siteAuthTokens.create.mutationOptions());
  const removeMutation = useMutation(trpc.siteAuthTokens.remove.mutationOptions());
  
  // Local state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [listUuid, setListUuid] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const LINKED_PLACEHOLDER_EMAIL = "account-linked@bring.com";
  const LINKED_PLACEHOLDER_UUID = "linked-list-uuid";

  // Sync local state when tokens are loaded
  useEffect(() => {
    if (tokens.length > 0) {
      const bringTokens = tokens.filter(t => t.domain === "getbring.com");
      const emailToken = bringTokens.find(t => t.name === "email");
      const listUuidToken = bringTokens.find(t => t.name === "list_uuid");
      
      if (emailToken) setEmail(LINKED_PLACEHOLDER_EMAIL); 
      if (listUuidToken) setListUuid(LINKED_PLACEHOLDER_UUID);
    }
  }, [tokens]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Get current bring tokens to preserve values if using placeholders
      const existingBringTokens = tokens.filter(t => t.domain === "getbring.com");
      
      // We need to fetch the actual values if we want to re-save them, 
      // but since they are encrypted and 'list' doesn't return them,
      // the safest approach is to ONLY delete and recreate what has actually changed.
      
      if (email && email !== LINKED_PLACEHOLDER_EMAIL) {
        const oldEmail = existingBringTokens.find(t => t.name === "email");
        if (oldEmail) await removeMutation.mutateAsync({ id: oldEmail.id });
        await createMutation.mutateAsync({ domain: "getbring.com", name: "email", value: email, type: "header" });
      }

      if (password) {
        const oldPass = existingBringTokens.find(t => t.name === "password");
        if (oldPass) await removeMutation.mutateAsync({ id: oldPass.id });
        await createMutation.mutateAsync({ domain: "getbring.com", name: "password", value: password, type: "header" });
      }

      if (listUuid && listUuid !== LINKED_PLACEHOLDER_UUID) {
        const oldUuid = existingBringTokens.find(t => t.name === "list_uuid");
        if (oldUuid) await removeMutation.mutateAsync({ id: oldUuid.id });
        await createMutation.mutateAsync({ domain: "getbring.com", name: "list_uuid", value: listUuid, type: "header" });
      }

      await queryClient.invalidateQueries(listQueryOptions);
      addToast({
        title: t("saveSuccess"),
        color: "success",
      });
    } catch (error) {
      showSafeErrorToast({
        title: t("saveError"),
        error,
        context: "bring-integration:save",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {t("title")}
          </h2>
          <p className="text-small text-default-500">
            {t("description")}
          </p>
        </div>
      </CardHeader>
      <CardBody className="gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label={t("emailLabel")}
            placeholder={t("emailPlaceholder")}
            value={email === LINKED_PLACEHOLDER_EMAIL ? "" : email}
            onValueChange={setEmail}
            description={email === LINKED_PLACEHOLDER_EMAIL ? t("emailLinked") : ""}
          />
          <Input
            label={t("passwordLabel")}
            type="password"
            placeholder={t("passwordPlaceholder")}
            value={password}
            onValueChange={setPassword}
          />
          <Input
            className="md:col-span-2"
            label={t("listUuidLabel")}
            placeholder={t("listUuidPlaceholder")}
            value={listUuid === LINKED_PLACEHOLDER_UUID ? "" : listUuid}
            onValueChange={setListUuid}
            description={t("listUuidHint")}
          />
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button
            variant="flat"
            color="primary"
            isLoading={isSaving}
            onPress={handleSave}
          >
            {tCommon("save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
