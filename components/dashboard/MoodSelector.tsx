"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";

const MOODS = ["😔", "😐", "🙂", "😊", "🤩"];

export default function MoodSelector() {
  const supabase = createClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadTodaysMood() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const today = new Date().toISOString().split("T")[0];
      const { data } = await supabase
        .from("daily_checkins")
        .select("mood")
        .eq("user_id", user.id)
        .eq("date", today)
        .maybeSingle();
      if (data?.mood) setSelected(data.mood);
    }
    loadTodaysMood();
  }, []);

  async function saveMood(mood: string) {
    if (saving) return;
    setSelected(mood);
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("daily_checkins").upsert(
      { user_id: user.id, mood, date: today },
      { onConflict: "user_id,date" }
    );
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      {MOODS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => saveMood(emoji)}
          className={`text-2xl rounded-full w-10 h-10 flex items-center justify-center transition-all ${
            selected === emoji
              ? "bg-primary-light ring-2 ring-primary scale-110"
              : "hover:bg-bg hover:scale-105"
          }`}
          aria-label={emoji}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
