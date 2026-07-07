import { NextRequest, NextResponse } from "next/server";
import {
  normalizeContactIdentifier,
  slackUserIdentifier,
} from "@/lib/contact-identifiers";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type SlackUserInfo = {
  ok?: boolean;
  user?: {
    id?: string;
    name?: string;
    real_name?: string;
    profile?: {
      display_name?: string;
      real_name?: string;
    };
  };
};

function slackDisplayName(data: SlackUserInfo | null) {
  return (
    data?.user?.profile?.display_name ||
    data?.user?.profile?.real_name ||
    data?.user?.real_name ||
    data?.user?.name ||
    null
  );
}

async function fetchSlackUserInfo(accessToken: string, slackUserId: string) {
  const res = await fetch(`https://slack.com/api/users.info?${new URLSearchParams({ user: slackUserId })}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  if (!res?.ok) return null;
  return res.json().catch(() => null) as Promise<SlackUserInfo | null>;
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const userId = session?.user.id;
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    contactId?: string;
    slackTeamId?: string;
    slackUserId?: string;
    displayName?: string | null;
  };

  const contactId = body.contactId?.trim();
  const slackTeamId = body.slackTeamId?.trim();
  const slackUserId = body.slackUserId?.trim();
  const confirmedSlackIdentifier = slackUserIdentifier(slackTeamId, slackUserId);

  if (!contactId || !confirmedSlackIdentifier || !slackTeamId || !slackUserId) {
    return NextResponse.json(
      { error: "contactId, slackTeamId, and slackUserId are required" },
      { status: 400 }
    );
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, slack_handle")
    .eq("id", contactId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!contact) return NextResponse.json({ error: "contact not found" }, { status: 404 });

  const { data: integration } = await supabase
    .from("user_integrations")
    .select("access_token, external_team_id")
    .eq("user_id", userId)
    .eq("provider", "slack")
    .eq("external_team_id", slackTeamId)
    .maybeSingle();

  if (!integration?.access_token) {
    return NextResponse.json({ error: "slack_not_connected" }, { status: 400 });
  }

  const slackInfo = await fetchSlackUserInfo(integration.access_token, slackUserId);
  const displayName = slackDisplayName(slackInfo) || body.displayName?.trim() || slackUserId;
  const displayIdentifier = normalizeContactIdentifier({
    platform: "slack",
    identifier: displayName,
    label: "Slack display name",
    confirmed: false,
  });

  const identifiers = [
    {
      contact_id: contactId,
      user_id: userId,
      platform: confirmedSlackIdentifier.platform,
      identifier: confirmedSlackIdentifier.identifier,
      label: "Confirmed Slack user",
      confirmed: true,
    },
    displayIdentifier
      ? {
          contact_id: contactId,
          user_id: userId,
          platform: displayIdentifier.platform,
          identifier: displayIdentifier.identifier,
          label: displayIdentifier.label,
          confirmed: false,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const { error: upsertError } = await supabase
    .from("contact_identifiers")
    .upsert(identifiers, { onConflict: "user_id,platform,identifier" });

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  if (!contact.slack_handle && displayName) {
    await supabase
      .from("contacts")
      .update({ slack_handle: displayName })
      .eq("id", contactId)
      .eq("user_id", userId);
  }

  return NextResponse.json({
    ok: true,
    slackContact: {
      teamId: slackTeamId,
      userId: slackUserId,
      displayName,
      identifier: confirmedSlackIdentifier.identifier,
    },
  });
}
