"use client";

import { useEffect, useState } from "react";
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Link,
} from "@heroui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { showSafeErrorToast } from "@/lib/ui/safe-error-toast";
import { useTRPC } from "@/app/providers/trpc-provider";
import { toast } from "sonner";

export default function BringIntegrationCard() {
  const t = useTranslations("settings.user.bring");
  const tCommon = useTranslations("common.actions");
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  // Query tokens to check existing config
  const listQueryOptions = trpc.siteAuthTokens.list.queryOptions();
  const { data: tokens = [], isLoading } = useQuery(listQueryOptions);

  // Mutations
  const createMutation = useMutation(trpc.siteAuthTokens.create.mutationOptions());
  const removeMutation = useMutation(trpc.siteAuthTokens.remove.mutationOptions());
  
  // Local state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [listUuid, setListUuid] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Sync local state when tokens are loaded
  useEffect(() => {
    if (tokens.length > 0) {
      const bringTokens = tokens.filter(t => t.domain === "getbring.com");
      const emailToken = bringTokens.find(t => t.name === "email");
      const listUuidToken = bringTokens.find(t => t.name === "list_uuid");
      
      if (emailToken) setEmail(emailToken.name === "email" ? "******" : ""); // Values are encrypted, can't show them easily if they aren't returned decrypted
      // Note: siteAuthTokens.list returns safe tokens (no values). 
      // We'll just show placeholders if they exist.
      if (emailToken) setEmail("account-linked@bring.com"); 
      if (listUuidToken) setListUuid("linked-list-uuid");
    }
  }, [tokens]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // 1. Remove existing Bring tokens
      const existingBringTokens = tokens.filter(t => t.domain === "getbring.com");
      for (const token of existingBringTokens) {
        await removeMutation.mutateAsync({ id: token.id });
      }

      // 2. Create new ones
      if (email) {
        await createMutation.mutateAsync({ domain: "getbring.com", name: "email", value: email, type: "header" });
      }
      if (password) {
        await createMutation.mutateAsync({ domain: "getbring.com", name: "password", value: password, type: "header" });
      }
      if (listUuid) {
        await createMutation.mutateAsync({ domain: "getbring.com", name: "list_uuid", value: listUuid, type: "header" });
      }

      await queryClient.invalidateQueries(listQueryOptions);
      toast.success("Bring! configuration saved");
    } catch (error) {
      showSafeErrorToast({
        title: "Failed to save Bring! config",
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
            Bring! Shopping List
          </h2>
          <p className="text-small text-default-500">
            Link your Bring! account to sync your Norish groceries automatically.
          </p>
        </div>
      </CardHeader>
      <CardBody className="gap-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Email"
            placeholder="your-bring-email@example.com"
            value={email === "account-linked@bring.com" ? "" : email}
            onValueChange={setEmail}
            description={email === "account-linked@bring.com" ? "Account is currently linked" : ""}
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onValueChange={setPassword}
          />
          <Input
            className="md:col-span-2"
            label="List UUID"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={listUuid === "linked-list-uuid" ? "" : listUuid}
            onValueChange={setListUuid}
            description={
              <span>
                You can find your List UUID in the Bring! web app URL or mobile app share settings.
              </span>
            }
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
