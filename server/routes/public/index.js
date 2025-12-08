import { Router } from "express";
import eventPublicRoutes from "../../modules/s2sEvents/routes/publicRoutes.js";
import clientProvider from "../../../utils/clientProvider.js";
import { handleShiprocketRtoReport } from "../../modules/rtoAutoRefund/controllers/index.js";

const publicRoutes = Router();

publicRoutes.use("/events", eventPublicRoutes);

publicRoutes.use("/shiprocket", (req, res) => {
  try {
    const payload = req.body;
    handleShiprocketRtoReport(payload);
    res.status(200).send({
      ok: true,
    });
  } catch (err) {
    console.log(
      "Failed to handle shiprocket webhook call reason -->" + err.message
    );
    res.status(200).send({
      ok: true,
    });
  }
});
publicRoutes.use("/test", async (req, res) => {
  try {
    let storeName =
      process.env.NODE_ENV == "dev"
        ? "swiss-local-dev.myshopify.com"
        : "swiss-beauty-dev.myshopify.com";
    const { client } = await clientProvider.offline.graphqlClient({
      shop: storeName,
    });
    const query = `mutation filfillmentEventCreate($fulfillmentEvent: FulfillmentEventInput!){
      fulfillmentEventCreate(fulfillmentEvent : $fulfillmentEvent){
        fulfillmentEvent{
          id
          status
          message
        }
        userErrors{
          field
          message
        }
      }
    }`;
    const variables = {
      fulfillmentEvent: {
        fulfillmentId: "gid://shopify/Fulfillment/6471215972721",
        status: "DELIVERED",
      },
    };
    const { data, extensions, errors } = await client.request(query, {
      variables,
    });
    // console.log(errors);
    res.send({ ok: true }).status(200);
  } catch (err) {
    throw new Error("Failed to handle test reason -->" + err.message);
  }
});
export default publicRoutes;
