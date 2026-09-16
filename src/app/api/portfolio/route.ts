import { errorResponse, jsonResponse } from "@/server/api/response";
import { requireAuthenticatedContext } from "@/server/auth/context";
import * as portfolioService from "@/server/services/portfolio.service";

export const dynamic = "force-dynamic";

/** GET — every project in the caller's organization, with real open counts. Owner or executive only. */
export async function GET() {
  try {
    const context = await requireAuthenticatedContext();
    const portfolio = await portfolioService.getPortfolio(context);
    return jsonResponse({ portfolio });
  } catch (error) {
    return errorResponse(error);
  }
}
