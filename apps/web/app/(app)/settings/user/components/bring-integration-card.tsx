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

// Sentinel values used when credentials are already stored.
// We never surface the real encrypted values to the UI.
const LINKED_EMAIL = "account-linked@bring.com";
const LINKED_UUID = "linked-list-uuid";

type FieldState =
  | { linked: true }     // credential exists in DB, field shows hint
  | { linked: false; value: string }; // user is editing a new value

function useFieldState(isLinked: boolean): [FieldState, (v: string) => void] {
  const [state, setState] = useState<FieldState>(
    isLinked ? { linked: true } : { linked: false, value: "" }
  );

  useEffect(() => {
    setState(isLinked ? { linked: true } : { linked: false, value: "" });
  }, [isLinked]);

  const onChange = (v: string) => setState({ linked: false, value: v });

  return [state, onChange];
}

export default function BringIntegrationCard() {
  const t = useTranslations("settings.user.bring");
  const tCommon = useTranslations("common.actions");
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const listQueryOptions = trpc.siteAuthTokens.list.queryOptions();
  const { data: tokens = [] } = useQuery(listQueryOptions);

  const createMutation = useMutation(trpc.siteAuthTokens.create.mutationOptions());
  const removeMutation = useMutation(trpc.siteAuthTokens.remove.mutationOptions());

  const bringTokens = tokens.filter((t) => t.domain === "getbring.com");
  const emailToken = bringTokens.find((t) => t.name === "email");
  const passwordToken = bringTokens.find((t) => t.name === "password");
  const listUuidToken = bringTokens.find((t) => t.name === "list_uuid");

  const [emailState, setEmail] = useFieldState(!!emailToken);
  const [passwordState, setPassword] = useFieldState(!!passwordToken);
  const [listUuidState, setListUuid] = useFieldState(!!listUuidToken);

  const [isSaving, setIsSaving] = useState(false);

  /**
   * Atomically upserts a single Bring! credential token.
   *
   * Deletes the old token first (if it exists), then creates the new one.
   * If the create step fails we attempt to restore the deleted token so the
   * user doesn't end up with missing credentials — best-effort rollback.
   */
  async function upsertToken(
    existingToken: (typeof bringTokens)[number] | undefined,
    name: string,
    value: string
  ) {
    // Remove the old record if one exists
    if (existingToken) {
      await removeMutation.mutateAsync({ id: existingToken.id });
    }

    try {
      await createMutation.mutateAsync({
        domain: "getbring.com",
        name,
        value,
        type: "header",
      });
    } catch (createError) {
      // Best-effort rollback: try to restore the old token
      if (existingToken) {
        try {
          await createMutation.mutateAsync({
            domain: "getbring.com",
            name: existingToken.name,
            value: existingToken.value ?? "",
            type: "header",
          });
        } catch {
          // Rollback failed — surface the original error, not this one
        }
      }
      throw createError;
    }
  }

  const handleSave = async () => {
    // Validate: if none of the fields have new values, nothing to do
    const hasEmailChange = emailState.linked === false && emailState.value.trim();
    const hasPasswordChange = passwordState.linked === false && passwordState.value.trim();
    const hasUuidChange = listUuidState.linked === false && listUuidState.value.trim();

    if (!hasEmailChange && !hasPasswordChange && !hasUuidChange) {
      addToast({ title: t("noChanges"), color: "default" });
      return;
    }

    setIsSaving(true);

    try {
      // Run upserts sequentially so errors are attributable and rollbacks are clean
      if (hasEmailChange) {
        await upsertToken(emailToken, "email", (emailState as { linked: false; value: string }).value.trim());
      }

      if (hasPasswordChange) {
        await upsertToken(passwordToken, "password", (passwordState as { linked: false; value: string }).value.trim());
      }

      if (hasUuidChange) {
        await upsertToken(listUuidToken, "list_uuid", (listUuidState as { linked: false; value: string }).value.trim());
      }

      await queryClient.invalidateQueries(listQueryOptions);

      addToast({ title: t("saveSuccess"), color: "success" });
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

  const handleDisconnect = async () => {
    setIsSaving(true);
    try {
      await Promise.all(
        bringTokens.map((token) => removeMutation.mutateAsync({ id: token.id }))
      );
      await queryClient.invalidateQueries(listQueryOptions);
      addToast({ title: t("disconnectSuccess"), color: "success" });
    } catch (error) {
      showSafeErrorToast({
        title: t("disconnectError"),
        error,
        context: "bring-integration:disconnect",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isConnected = !!emailToken && !!passwordToken;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            {t("title")}
          </h2>
          <p className="text-small text-default-500">{t("description")}</p>
        </div>
      </CardHeader>
      <CardBody className="gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label={t("emailLabel")}
            placeholder={t("emailPlaceholder")}
            value={emailState.linked ? "" : emailState.value}
            onValueChange={setEmail}
            description={emailState.linked ? t("emailLinked") : ""}
          />
          <Input
            label={t("passwordLabel")}
            type="password"
            placeholder={
              passwordState.linked ? t("passwordLinkedPlaceholder") : t("passwordPlaceholder")
            }
            value={passwordState.linked ? "" : passwordState.value}
            onValueChange={setPassword}
            description={passwordState.linked ? t("passwordLinked") : ""}
          />
          <Input
            className="md:col-span-2"
            label={t("listUuidLabel")}
            placeholder={t("listUuidPlaceholder")}
            value={listUuidState.linked ? "" : listUuidState.value}
            onValueChange={setListUuid}
            description={
              listUuidState.linked
                ? t("listUuidLinked")
                : t("listUuidHint")
            }
          />
        </div>

        <div className="flex justify-end gap-2 mt-2">
          {isConnected && (
            <Button
              variant="flat"
              color="danger"
              isLoading={isSaving}
              onPress={handleDisconnect}
            >
              {t("disconnect")}
            </Button>
          )}
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
