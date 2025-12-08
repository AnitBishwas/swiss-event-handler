import ejs from "ejs";
import csv from "csv-parser";
import { Readable } from "stream";
import path from "path";
import AWS from "aws-sdk";
import clientProvider from "../../../../utils/clientProvider.js";

const handleShiprocketRtoReport = async (data) => {
  console.log(`👀 Initiated rto auto refund at ${new Date()}`);
  console.log(data);
  try {
    if (!data.report_file) {
      throw new Error("Report file url missing");
    }
    let shop = (process.env.NODE_ENV = "dev"
      ? "swiss-local-dev.myshopify.com"
      : "swiss-beauty-dev.myshopify.com");
    const reportUrl = data.report_file;
    const rtoOrders = [];

    const response = await fetch(reportUrl);
    const nodeStream = Readable.fromWeb(response.body);

    await new Promise((resolve, reject) => {
      nodeStream
        .pipe(csv())
        .on("data", (row) => {
          let order = row;
          const checkIfOrderIsRto = order["Status"]
            ?.toLowerCase()
            .includes("rto");
          if (checkIfOrderIsRto) {
            rtoOrders.push(order);
          }
        })
        .on("end", async () => {
          console.log(`✅ Parsed rows`);
          resolve(true);
        })
        .on("error", reject);
    });
    let reportOrders = rtoOrders.map((el) => el["Order ID"]);
    const uniqueOrders = [...new Set(reportOrders)];
    const rtoOrdersList = [];
    console.log("started processing shopify orders");
    for (let i = 0; i < uniqueOrders.length; i++) {
      try {
        let item = uniqueOrders[i];
        const { order, extensions } = await getOrderInfoFromShopify(item, shop);
        let checkRefundEligibility =
          Number(order.refund_amount) > 0 && !order.partiallyPaid && !order.cod
            ? true
            : false;
        checkRefundEligibility ? rtoOrdersList.push(order) : "";
        if (extensions.cost.throttleStatus.currentlyAvailable < 400) {
          await new Promise((res, rej) => {
            setTimeout(() => {
              res(true);
            }, 1000);
          });
        }
      } catch (err) {
        console.log(
          "Failed to get shopify info for order reason -->" + err.message
        );
      }
    }
    console.log("✅ ended processing shopify orders");
    const refundedOrders = [];
    for (let i = 0; i < rtoOrdersList.length; i++) {
      let order = rtoOrdersList[i];
      try {
        const { extensions } = await markOrderRefundOnShopify(order, shop);
        refundedOrders.push(order);
        console.log("markded order", order);
        if (extensions.cost.throttleStatus.currentlyAvailable < 400) {
          await new Promise((res, rej) => {
            setTimeout(() => {
              res(true);
            }, 600);
          });
        }
      } catch (err) {
        console.log(
          "Failed to mark order refund on shopify order id -->" +
            order.id +
            "reason" +
            err.message
        );
      }
    }
    const emailContent = await parseOrdersIntoHtml(refundedOrders);
    await sendEmail(emailContent);
    console.log(`✅ Finished rto auto refund at ${new Date()}`);
  } catch (err) {
    console.log("❌ Failed rto auto refund process -->" + err.message);
  }
};

const sendEmail = async (content) => {
  const sesConfig = {
    accessKeyId: process.env.aws_access_key_id,
    secretAccessKey: process.env.aws_secret_access_key,
    region: process.env.aws_ses_region,
  };

  const AWS_SES = new AWS.SES(sesConfig);
  if (!content) {
    throw new Error("Content can not be blank for email");
  }
  try {
    let params = {
      Source: "anit.biswas@swissbeauty.in",
      Destination: {
        ToAddresses: ["anit.biswas@swissbeauty.in"],
        CcAddresses: [
          "anit.biswas@swissbeauty.in",
          //   "samridhi@swissbeauty.in",
          //   "divyani.singh@swissbeauty.in",
          //   "amit.yadav@swissbeauty.in",
          //   "aman.nigam@swissbeauty.in",
          //   "abheet.jamwal@swissbeauty.in",
        ],
      },
      ReplyToAddresses: [],
      Message: {
        Body: {
          Html: {
            Charset: "UTF-8",
            Data: content,
          },
        },
        Subject: {
          Charset: "UTF-8",
          Data: `List of orders where refunds are initiated`,
        },
      },
    };
    return AWS_SES.sendEmail(params).promise();
  } catch (err) {
    console.log("Failed to send email reason -->", err);
  }
};

/**
 *
 * @param {string} orderName - shopify order name
 * @param {string} shop - shopify store handle Ex - swiss-local-dev.myshopify.com
 */
const getOrderInfoFromShopify = async (orderName, shop) => {
  try {
    if (!orderName) {
      throw new Error("Order name is required");
    }
    orderName = orderName.includes("#") ? orderName : `#${orderName}`;
    const query = `query{
      orders(first: 1,query: "name:${orderName}"){
        edges{
          node{
            id
            name
            netPaymentSet{
              presentmentMoney{
                amount
              }
            }
            tags
            lineItems(first: 50){
              edges{
                node{
                  id
                  refundableQuantity
                }
              }
            }
            transactions(first:50){
              amountSet{
                presentmentMoney{
                  amount
                }
              }
              gateway
              id
              kind
            }
            shippingLine{
                originalPriceSet{
                  presentmentMoney{
                    amount
                  }
                }
            }
            customer{
              id
              displayName
              defaultPhoneNumber{
                phoneNumber
              }
            }

          }
        }
      }
    }`;
    const { client } = await clientProvider.offline.graphqlClient({ shop });
    const { data, errors, extensions } = await client.request(query);
    if (errors || errors.length > 0) {
      throw new Error(
        `Failed to get order detial from shopify reason ${orderName}`
      );
    }
    let orders = data.orders.edges.map(({ node: el }) => ({
      id: el.id.replace("gid://shopify/Order/", ""),
      refund_amount: el.netPaymentSet.presentmentMoney.amount,
      name: el.name,
      customer: {
        id: el?.customer?.id || null,
        name: el?.customer?.displayName || null,
        phone: el.customer?.defaultPhoneNumber?.phoneNumber || null,
      },
      lineItems: el.lineItems.edges.map(({ node: el }) => ({
        id: el.id,
        quantity: el.refundableQuantity,
      })),
      transactions: el.transactions.map((tr) => ({
        amount: tr.amountSet.presentmentMoney.amount,
        gateway: tr.gateway,
        kind: tr.kind,
        orderId: el.id,
        parentId: tr.id || null,
      })),
      partiallyPaid: el.tags
        .map((el) => el.toLowerCase())
        .find((el) => el == "ppcod-upi"),
      cod: el.tags.map((el) => el.toLowerCase()).find((el) => el == "COD"),
    }));
    return {
      order: orders[0],
      extensions: extensions,
    };
  } catch (err) {
    throw new Error(
      "Failed to get order info from shopify reason -->" + err.message
    );
  }
};

const parseOrdersIntoHtml = async (refundOrders) => {
  const templatePath = path.join(
    process.cwd(),
    "server",
    "modules",
    "rtoAutoRefund",
    "templates",
    "refundEmail.ejs"
  );
  const totalRefund = refundOrders.reduce(
    (sum, c) => sum + parseFloat(c.refund_amount || 0),
    0
  );
  const htmlContent = await ejs.renderFile(templatePath, {
    customers: refundOrders,
    totalRefund: totalRefund.toFixed(2),
  });
  return htmlContent;
};

/**
 * Mark order refund on shopify
 * @typedef {object} payload - order payload
 * @property {string} id - shopify order id
 * @property {array} refundLineItems -  line items array
 * @property {string} id -  line item id
 * @property {integer} quantity - line item quantity
 */
const markOrderRefundOnShopify = async (payload, shop) => {
  try {
    const { client } = await clientProvider.offline.graphqlClient({ shop });
    const refund = await createRefund(payload, client);
    return refund;
  } catch (err) {
    throw new Error(
      "Failed to mark refund for order on shopify for order" + payload.id
    );
  }
};

/**
 * Mark order refund on shopify
 * @typedef {object} payload - order payload
 * @property {string} id - shopify order id
 * @property {array} refundLineItems -  line items array
 * @property {string} id -  line item id
 * @property {integer} quantity - line item quantity
 */
const createRefund = async (payload, client) => {
  try {
    const query = `mutation RefundLineItem($input: RefundInput!){
      refundCreate(input: $input){
        refund{
          id
        }
        userErrors{
          field
          message
        }
      }
    }`;
    const input = {
      input: {
        orderId: payload.id.includes("gid://shopify/Order/")
          ? payload.id
          : "gid://shopify/Order/" + payload.id,
        notify: true,
        note: "Refund initiated by custom app for Auto RTO Refund",
        refundLineItems: payload.lineItems.map((el) => ({
          lineItemId: el.id,
          quantity: el.quantity,
        })),
        transactions: payload.transactions.map((el) => ({
          ...el,
          kind: "REFUND",
        })),
      },
    };
    const { data, extensions, errors } = await client.request(query, {
      variables: input,
    });
    if (errors && errors.length > 0) {
      throw new Error("Failed to mark refund ");
    }
    return {
      data,
      extensions,
    };
  } catch (err) {
    console.log(err, "herrerere");
    throw new Error(`Failed to create refund` + err.message);
  }
};

export { handleShiprocketRtoReport };
