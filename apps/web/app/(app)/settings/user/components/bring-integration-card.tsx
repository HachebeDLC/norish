"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon } from "@heroicons/react/20/solid";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Select,
  SelectItem,
  addToast,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { showSafeErrorToast } from "@/lib/ui/safe-error-toast";
import { useTRPC } from "@/app/providers/trpc-provider";

const BRING_DOMAIN = "getbring.com";

export default function BringIntegrationCard() {
  const t = useTranslations("settings.user.bring");
  const tCommon = useTranslations("common.actions");
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // ── Stored tokens ────────────────────────────────────────────────────────
  const listQueryOptions = trpc.siteAuthTokens.list.queryOptions();
  const { data: tokens = [] } = useQuery(listQueryOptions);

  const createMutation = useMutation(trpc.siteAuthTokens.create.mutationOptions());
  const removeMutation = useMutation(trpc.siteAuthTokens.remove.mutationOptions());

  const bringTokens = tokens.filter((t) => t.domain === BRING_DOMAIN);
  const emailToken = bringTokens.find((t) => t.name === "email");
  const passwordToken = bringTokens.find((t) => t.name === "password");
  const listUuidToken = bringTokens.find((t) => t.name === "list_uuid");

  const isConnected = !!emailToken && !!passwordToken;

  // ── Local state ──────────────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Lists fetched from Bring! after a successful test
  const [fetchedLists, setFetchedLists] = useState<{ listUuid: string; name: string }[]>([]);
  const [selectedListUuid, setSelectedListUuid] = useState<string>(listUuidToken?.value ?? "");

  // When tokens load, pre-fill email hint (we never get the real value back)
  useEffect(() => {
    if (listUuidToken?.value) setSelectedListUuid(listUuidToken.value);
  }, [listUuidToken?.value]);

  // ── Step 1: Test credentials and fetch lists ─────────────────────────────
  const getListsMutation = useMutation(trpc.bring.getLists.mutationOptions());

  const handleTestAndFetch = async () => {
    if (!email.trim() || !password.trim()) {
      addToast({ title: t("credentialsRequired"), color: "warning" });
      return;
    }

    try {
      const result = await getListsMutation.mutateAsync({ email, password });
      setFetchedLists(result.lists);

      // Pre-select the first list if none chosen yet
      if (!selectedListUuid && result.lists.length > 0) {
        setSelectedListUuid(result.lists[0].listUuid);
      }

      addToast({ title: t("connectionSuccess"), color: "success" });
    } catch (error) {
      showSafeErrorToast({
        title: t("connectionError"),
        error,
        context: "bring-integration:test",
      });
    }
  };

  // ── Step 2: Save credentials + selected list ─────────────────────────────
  const [isSaving, setIsSaving] = useState(false);

  async function upsertToken(
    existing: typeof bringTokens[number] | undefined,
    name: string,
    value: string
  ) {
    if (existing) await removeMutation.mutateAsync({ id: existing.id });
    try {
      await createMutation.mutateAsync({ domain: BRING_DOMAIN, name, value, type: "header" });
    } catch (err) {
      // Best-effort rollback
      if (existing) {
        try {
          await createMutation.mutateAsync({
            domain: BRING_DOMAIN,
            name: existing.name,
            value: existing.value ?? "",
            type: "header",
          });
        } catch {}
      }
      throw err;
    }
  }

  const handleSave = async () => {
    if (!selectedListUuid) {
      addToast({ title: t("noListSelected"), color: "warning" });
      return;
    }

    // Must have credentials — either freshly entered or already stored
    const hasNewCredentials = email.trim() && password.trim();
    if (!hasNewCredentials && !isConnected) {
      addToast({ title: t("credentialsRequired"), color: "warning" });
      return;
    }

    setIsSaving(true);
    try {
      if (hasNewCredentials) {
        await upsertToken(emailToken, "email", email.trim());
        await upsertToken(passwordToken, "password", password.trim());
      }

      // Always save the list UUID (user may just be changing the list)
      await upsertToken(listUuidToken, "list_uuid", selectedListUuid);

      await queryClient.invalidateQueries(listQueryOptions);
      setEmail("");
      setPassword("");
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

  // ── Disconnect ────────────────────────────────────────────────────────────
  const handleDisconnect = async () => {
    setIsSaving(true);
    try {
      await Promise.all(bringTokens.map((tok) => removeMutation.mutateAsync({ id: tok.id })));
      await queryClient.invalidateQueries(listQueryOptions);
      setEmail("");
      setPassword("");
      setFetchedLists([]);
      setSelectedListUuid("");
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

  // The list dropdown shows fetched lists (after test) or a placeholder for
  // the already-saved list so the user knows something is configured.
  const listOptions =
    fetchedLists.length > 0
      ? fetchedLists
      : listUuidToken
        ? [{ listUuid: listUuidToken.value ?? "", name: t("savedList") }]
        : [];

  const canSave = selectedListUuid && (email.trim() || isConnected);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{t("title")}</h2>
            {isConnected && (
              <CheckCircleIcon className="h-5 w-5 text-success" aria-label={t("connected")} />
            )}
          </div>
          <p className="text-small text-default-500">{t("description")}</p>
        </div>
      </CardHeader>

      <CardBody className="gap-5">
        {/* ── Step 1: Credentials ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label={t("emailLabel")}
            placeholder={isConnected ? t("emailLinked") : t("emailPlaceholder")}
            value={email}
            onValueChange={setEmail}
            autoComplete="email"
          />
          <Input
            label={t("passwordLabel")}
            type="password"
            placeholder={isConnected ? t("passwordLinked") : t("passwordPlaceholder")}
            value={password}
            onValueChange={setPassword}
            autoComplete="current-password"
          />
        </div>

        <Button
          variant="flat"
          color="primary"
          isLoading={getListsMutation.isPending}
          isDisabled={!email.trim() || !password.trim()}
          onPress={handleTestAndFetch}
          className="w-full md:w-auto"
        >
          {t("testAndFetchLists")}
        </Button>

        {/* ── Step 2: Pick a list (shown once lists are available) ── */}
        {listOptions.length > 0 && (
          <Select
            label={t("listLabel")}
            placeholder={t("listPlaceholder")}
            selectedKeys={selectedListUuid ? new Set([selectedListUuid]) : new Set()}
            onSelectionChange={(keys) => {
              const val = Array.from(keys)[0];
              if (val) setSelectedListUuid(String(val));
            }}
            description={fetchedLists.length === 0 ? t("listSavedHint") : undefined}
          >
            {listOptions.map((l) => (
              <SelectItem key={l.listUuid}>
                {l.name}
              </SelectItem>
            ))}
          </Select>
        )}

        {/* ── Actions ── */}
        <div className="flex justify-end gap-2">
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
            color="primary"
            isLoading={isSaving}
            isDisabled={!canSave}
            onPress={handleSave}
          >
            {tCommon("save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
