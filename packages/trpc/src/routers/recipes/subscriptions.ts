import { createEnvelopeAwareSubscription } from "../../helpers";
import { router } from "../../trpc";

import { recipeEmitter } from "@norish/queue";

const onCreated = createEnvelopeAwareSubscription(recipeEmitter, "created", "recipe created");
const onImportStarted = createEnvelopeAwareSubscription(
  recipeEmitter,
  "importStarted",
  "recipe import started"
);
const onImported = createEnvelopeAwareSubscription(recipeEmitter, "imported", "recipe imported");
const onUpdated = createEnvelopeAwareSubscription(recipeEmitter, "updated", "recipe updated");
const onDeleted = createEnvelopeAwareSubscription(recipeEmitter, "deleted", "recipe deleted");
const onConverted = createEnvelopeAwareSubscription(recipeEmitter, "converted", "recipe converted");
const onFailed = createEnvelopeAwareSubscription(recipeEmitter, "failed", "recipe failed");
const onNutritionStarted = createEnvelopeAwareSubscription(
  recipeEmitter,
  "nutritionStarted",
  "nutrition estimation started"
);
const onAutoTaggingStarted = createEnvelopeAwareSubscription(
  recipeEmitter,
  "autoTaggingStarted",
  "auto-tagging started"
);
const onAutoTaggingCompleted = createEnvelopeAwareSubscription(
  recipeEmitter,
  "autoTaggingCompleted",
  "auto-tagging completed"
);
const onAutoCategorizationStarted = createEnvelopeAwareSubscription(
  recipeEmitter,
  "autoCategorizationStarted",
  "auto-categorization started"
);
const onAutoCategorizationCompleted = createEnvelopeAwareSubscription(
  recipeEmitter,
  "autoCategorizationCompleted",
  "auto-categorization completed"
);
const onAllergyDetectionStarted = createEnvelopeAwareSubscription(
  recipeEmitter,
  "allergyDetectionStarted",
  "allergy detection started"
);
const onAllergyDetectionCompleted = createEnvelopeAwareSubscription(
  recipeEmitter,
  "allergyDetectionCompleted",
  "allergy detection completed"
);
const onProcessingToast = createEnvelopeAwareSubscription(
  recipeEmitter,
  "processingToast",
  "processing toast"
);
const onRecipeBatchCreated = createEnvelopeAwareSubscription(
  recipeEmitter,
  "recipeBatchCreated",
  "recipe batch created"
);

const onHellofreshSyncProgress = createEnvelopeAwareSubscription(
  recipeEmitter,
  "hellofreshSyncProgress",
  "hellofresh sync progress"
);

const onHellofreshSyncCompleted = createEnvelopeAwareSubscription(
  recipeEmitter,
  "hellofreshSyncCompleted",
  "hellofresh sync completed"
);

export const recipesSubscriptions = router({
  onCreated,
  onImportStarted,
  onImported,
  onUpdated,
  onDeleted,
  onConverted,
  onFailed,
  onNutritionStarted,
  onAutoTaggingStarted,
  onAutoTaggingCompleted,
  onAutoCategorizationStarted,
  onAutoCategorizationCompleted,
  onAllergyDetectionStarted,
  onAllergyDetectionCompleted,
  onProcessingToast,
  onRecipeBatchCreated,
  onHellofreshSyncProgress,
  onHellofreshSyncCompleted,
});
