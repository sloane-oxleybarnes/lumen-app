import { NextRequest, NextResponse } from "next/server";
import {
  normalizeSafetyResourceRegion,
  safetyResourceRegions,
} from "@/lib/safety-resources";
import { createSupabaseServerClient } from "@/lib/supabase-server";

async function authedProfile() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await authedProfile();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data, error } = await supabase
    .from("profiles")
    .select("safety_resource_region")
    .eq("id", user.id)
    .single();
  if (error) return NextResponse.json({ error: "Could not load your resource region." }, { status: 500 });

  return NextResponse.json({
    region: normalizeSafetyResourceRegion(data?.safety_resource_region),
    selected: data?.safety_resource_region || null,
    options: safetyResourceRegions,
  });
}

export async function PUT(request: NextRequest) {
  const { supabase, user } = await authedProfile();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => null) as { region?: unknown } | null;
  if (!body || !safetyResourceRegions.some((option) => option.value === body.region)) {
    return NextResponse.json({ error: "Choose a supported country or region." }, { status: 400 });
  }

  const region = normalizeSafetyResourceRegion(body.region);
  const { data, error } = await supabase
    .from("profiles")
    .update({ safety_resource_region: region, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select("safety_resource_region")
    .single();
  if (error) return NextResponse.json({ error: "Could not save your resource region." }, { status: 500 });

  return NextResponse.json({ region: normalizeSafetyResourceRegion(data.safety_resource_region) });
}
