import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as service from "@/lib/alpha/service";

export const dynamic = "force-dynamic";

/** Session-scoped CRUD over alpha_settings — thin wrapper around
 *  src/lib/alpha/service.ts (the one place the business logic lives). GET
 *  reads, PATCH edits leagues/baseCurrency, POST is the dedicated
 *  kill-switch action (deliberately separate from PATCH so a client can't
 *  accidentally flip the kill switch as a side effect of an unrelated
 *  settings edit). */

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const settings = await service.getSettings(supabase, user.id);
  return NextResponse.json(settings);
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { leagues?: unknown; baseCurrency?: unknown } | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid body" }, { status: 400 });
  if (body.leagues != null && !(Array.isArray(body.leagues) && body.leagues.every((l) => typeof l === "string"))) {
    return NextResponse.json({ error: "leagues must be a string[]" }, { status: 400 });
  }
  if (body.baseCurrency != null && typeof body.baseCurrency !== "string") {
    return NextResponse.json({ error: "baseCurrency must be a string" }, { status: 400 });
  }

  await service.setSettings(supabase, user.id, {
    leagues: body.leagues as string[] | undefined,
    baseCurrency: body.baseCurrency as string | undefined,
  });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { killSwitch?: unknown; reason?: unknown } | null;
  if (!body || typeof body.killSwitch !== "boolean") {
    return NextResponse.json({ error: "killSwitch (boolean) is required" }, { status: 400 });
  }
  if (body.reason != null && typeof body.reason !== "string") {
    return NextResponse.json({ error: "reason must be a string" }, { status: 400 });
  }

  await service.setKillSwitch(supabase, user.id, body.killSwitch, body.reason as string | undefined);
  return NextResponse.json({ ok: true });
}
