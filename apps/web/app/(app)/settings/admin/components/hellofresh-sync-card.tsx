"use client";

import { useState } from "react";
import { ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Progress,
  addToast,
} from "@heroui/react";
import { useTranslations } from "next-intl";

import { useTRPC } from "@/app/providers/trpc-provider";
import { showSafeErrorToast } from "@/lib/ui/safe-error-toast";

export default function HellofreshSyncCard() {
  const t = useTranslations("settings.admin.hellofreshSync");
  const trpc = useTRPC();

  const [countryCode, setCountryCode] = useState("ES");
  const [locale, setLocale] = useState("es-ES");
  const [syncStatus, setSyncStatus] = useState<{
    status: "idle" | "fetching" | "processing" | "skipped" | "completed" | "failed";
    current: number;
    total: number;
    page: number;
    reason?: string;
  }>({
    status: "idle",
    current: 0,
    total: 0,
    page: 0,
  });

  // tRPC Mutations using the OFFICIAL Admin namespace
  const syncMutation = trpc.admin.hellofreshSync.useMutation();
  const cleanupMutation = trpc.admin.hellofreshCleanup.useMutation();

  // Subscription for progress (keeping them in recipes as they are recipe-related events)
  trpc.recipes.onHellofreshSyncProgress.useSubscription(undefined, {
    onData(data) {
      setSyncStatus({
        status: data.status,
        current: data.current,
        total: data.total,
        page: data.page,
      });
    },
  });

  // Subscription for completion
  trpc.recipes.onHellofreshSyncCompleted.useSubscription(undefined, {
    onData(data) {
      setSyncStatus((prev) => ({
        ...prev,
        status: data.status === "success" ? "completed" : "failed",
        current: data.totalImported,
        reason: data.reason,
      }));

      if (data.status === "success") {
        addToast({
          title: t("status.completed", { count: data.totalImported }),
          color: "success",
        });
      }
    },
  });

  const handleSync = async () => {
    try {
      setSyncStatus({ status: "fetching", current: 0, total: 0, page: 1 });
      await syncMutation.mutateAsync({ countryCode, locale });
      addToast({ title: t("syncStarted"), color: "primary" });
    } catch (error) {
      setSyncStatus((prev) => ({ ...prev, status: "failed" }));
      showSafeErrorToast({
        title: "Sync failed",
        error,
        context: "admin:hellofresh-sync",
      });
    }
  };

  const handleCleanup = async () => {
    if (!confirm(t("cleanupConfirm"))) return;

    try {
      const result = await cleanupMutation.mutateAsync();
      addToast({
        title: t("cleanupSuccess", { count: result.count }),
        color: "success",
      });
    } catch (error) {
      showSafeErrorToast({
        title: "Cleanup failed",
        error,
        context: "admin:hellofresh-cleanup",
      });
    }
  };

  const isSyncing = ["fetching", "processing"].includes(syncStatus.status);
  const progressValue = syncStatus.total > 0 ? (syncStatus.current / syncStatus.total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ArrowPathIcon className="h-5 w-5" />
          <h2 className="text-lg font-semibold">{t("title")}</h2>
        </div>
      </CardHeader>
      <CardBody className="gap-4">
        <p className="text-default-500 text-base">{t("description")}</p>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label={t("countryLabel")}
            placeholder={t("countryPlaceholder")}
            value={countryCode}
            onValueChange={setCountryCode}
            disabled={isSyncing}
          />
          <Input
            label={t("localeLabel")}
            placeholder={t("localePlaceholder")}
            value={locale}
            onValueChange={setLocale}
            disabled={isSyncing}
          />
        </div>

        {isSyncing && (
          <div className="flex flex-col gap-2 mt-2">
            <Progress
              aria-label="Sync progress"
              color="primary"
              showValueLabel={true}
              size="md"
              value={progressValue}
            />
            <p className="text-small text-default-500 text-center">
              {syncStatus.status === "fetching"
                ? t("status.fetching", { page: syncStatus.page })
                : t("status.processing", { current: syncStatus.current, total: syncStatus.total })}
            </p>
          </div>
        )}

        {!isSyncing && syncStatus.status !== "idle" && (
          <div className="p-3 bg-default-100 rounded-lg text-center">
             <p className="text-small font-medium">
               {syncStatus.status === "completed" && t("status.completed", { count: syncStatus.current })}
               {syncStatus.status === "skipped" && t("status.skipped", { total: syncStatus.total })}
               {syncStatus.status === "failed" && t("status.failed", { reason: syncStatus.reason || "Unknown" })}
             </p>
          </div>
        )}

        <div className="flex gap-2 justify-end mt-2">
          <Button
            color="danger"
            variant="flat"
            startContent={<TrashIcon className="h-4 w-4" />}
            onPress={handleCleanup}
            disabled={isSyncing}
          >
            {t("cleanupButton")}
          </Button>
          <Button
            color="primary"
            isLoading={isSyncing}
            startContent={!isSyncing && <ArrowPathIcon className="h-4 w-4" />}
            onPress={handleSync}
          >
            {t("syncButton")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
