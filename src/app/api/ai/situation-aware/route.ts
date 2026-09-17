import { NextResponse } from "next/server";
import { getAuthenticatedContext } from "@/server/auth/context";
import { extractSituationContext, generateSituationalAnalysis } from "@/lib/ai/situation-context";

export async function POST(request: Request) {
  try {
    const authContext = await getAuthenticatedContext();
    if (!authContext) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const pathname = typeof body.pathname === "string" ? body.pathname : "/dashboard";
    const userMessage = typeof body.userMessage === "string" ? body.userMessage : undefined;

    const userRole = authContext.user.role;
    const situation = extractSituationContext(pathname, userRole);
    const analysis = generateSituationalAnalysis(situation, userMessage);

    return NextResponse.json({
      success: true,
      situation,
      analysis,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
