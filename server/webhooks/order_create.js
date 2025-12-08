/**
 * @typedef { import("../../_developer/types/2025-04/webhooks.js").APP_UNINSTALLED } webhookTopic
 */

import { createCustomPurchaseEventInBiqQuery } from "../modules/s2sEvents/controllers/bigQuery.js";

const orderCreateHandler = async (
  topic,
  shop,
  webhookRequestBody,
  webhookId,
  apiVersion
) => {
  /** @type {webhookTopic} */
  const webhookBody = JSON.parse(webhookRequestBody);

  // big query event insertion
  createCustomPurchaseEventInBiqQuery(shop, JSON.parse(webhookRequestBody));
};

export default orderCreateHandler;
