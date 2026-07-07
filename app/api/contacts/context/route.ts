import { NextRequest, NextResponse } from "next/server";
import { normalizeContactIdentifier } from "@/lib/contact-identifiers";
import { lookupRelationshipContextByIdentifier } from "@/lib/contact-relationship-context";
import { getExtensionUserId } from "@/lib/extension-auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";

async function getAuthedUserId(req: NextRequest): Promise<string | null> {
  const extUserId = await getExtensionUserId(req);
  if (extUserId) return extUserId;
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId(req);
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const platform = req.nextUrl.searchParams.get("platform");
  const identifier = req.nextUrl.searchParams.get("identifier");
  const normalized = normalizeContactIdentifier({ platform, identifier });

  if (!normalized) {
    return NextResponse.json({ error: "platform and identifier required" }, { status: 400 });
  }

  if (normalized.platform === "slack") {
    return NextResponse.json({
      contact: null,
      promptContext: null,
      match: { confidence: "suggested_identifier", platform: normalized.platform },
    });
  }

  const relationshipContext = await lookupRelationshipContextByIdentifier({
    userId,
    identifier: normalized,
    requireConfirmed: normalized.platform === "slack_user_id",
  });

  if (!relationshipContext) {
    return NextResponse.json({ contact: null, promptContext: null });
  }

  return NextResponse.json({
    contact: {
      id: relationshipContext.contact.id,
      name: relationshipContext.contact.name,
      trusted: relationshipContext.contact.trusted,
    },
    promptContext: relationshipContext.promptContext,
    match: {
      confidence: relationshipContext.identifierConfirmed ? "confirmed" : "identifier",
      platform: normalized.platform,
    },
  });
}
