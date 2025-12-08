import { createMoengageOrderDeliveredEvent } from "../modules/s2sEvents/controllers/moe.js";

/**
 * @typedef { import("../../_developer/types/2025-04/webhooks.js").APP_UNINSTALLED } webhookTopic
 */
const fulFillmentUpdateHandler = async (
  topic,
  shop,
  webhookRequestBody,
  webhookId,
  apiVersion
) => {
  /** @type {webhookTopic} */
  const webhookBody = JSON.parse(webhookRequestBody);

  const isOrderDelivered =
    webhookBody.order_id && webhookBody.shipment_status == "delivered"
      ? true
      : false;

  // If fulfillment is created against order and order's shipping status is delivered
  if (isOrderDelivered) {
    createMoengageOrderDeliveredEvent(shop, webhookBody);
  }
};

export default fulFillmentUpdateHandler;
