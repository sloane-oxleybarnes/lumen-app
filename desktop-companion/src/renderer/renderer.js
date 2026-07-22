const $ = (id) => document.getElementById(id);

$("paste").addEventListener("click", async () => {
  $("context").value = await window.beckettDesktop.readClipboard();
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", async () => {
    const action = button.dataset.action;
    const text = $("context").value.trim();
    const query = text ? `?desktop_action=${encodeURIComponent(action)}&text=${encodeURIComponent(text.slice(0, 4000))}` : "";
    await window.beckettDesktop.openWeb(`/dashboard/personal${query}`);
  });
});

$("start-meeting").addEventListener("click", async () => {
  const status = $("meeting-status");
  if (!$("consent").checked) { status.textContent = "Please read the consent reminder before starting support."; return; }
  const result = await window.beckettDesktop.startMeeting({ title: $("meeting-title").value, platform: "zoom" });
  status.textContent = result.ok ? `Meeting support is ready for ${result.session.title}. Open Beckett to save notes after the call.` : "Could not start meeting support.";
  if (result.ok) await window.beckettDesktop.openWeb("/dashboard/meetings");
});

$("open-settings").addEventListener("click", () => window.beckettDesktop.openWeb("/dashboard/companion"));
