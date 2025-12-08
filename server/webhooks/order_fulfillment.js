import SessionModel from "../../utils/models/SessionModel.js";
import StoreModel from "../../utils/models/StoreModel.js";

/**
 * @typedef { import("../../_developer/types/2025-04/webhooks.js").APP_UNINSTALLED } webhookTopic
 */

const orderFulfillmentHandler = async (
  topic,
  shop,
  webhookRequestBody,
  webhookId,
  apiVersion
) => {
  /** @type {webhookTopic} */
  const webhookBody = JSON.parse(webhookRequestBody);
  console.log(webhookBody);
};

export default orderFulfillmentHandler;
