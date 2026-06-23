import { createHash } from "node:crypto";
import { getOfferingsData } from "../googleSheets";

export async function getCurrentOfferingsHash(): Promise<string> {
  const offeringsItems = await getOfferingsData();

  return createHash("md5").update(JSON.stringify(offeringsItems)).digest("hex");
}
