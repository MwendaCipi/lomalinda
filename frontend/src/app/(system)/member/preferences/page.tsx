"use client";

import { useEffect, useState } from "react";
import { MemberWorkspace } from "@/components/member-workspace";
import { useAccessibility } from "@/context/accessibility-context";
import { getPushState, PushSupport } from "@/lib/push";
import { showAlert } from "@/lib/alerts";
import { Bell, Monitor, Moon, RotateCcw, SlidersHorizontal, Sun, Type } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export default function MemberPreferencesPage() {
  const {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    highContrast,
    setHighContrast,
    dyslexicFont,
    setDyslexicFont,
    reducedMotion,
    setReducedMotion,
    highVisFocus,
    setHighVisFocus,
    resetDefaults,
  } = useAccessibility();

  const [token] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("access_token") : null));
  const [announcePrefs, setAnnouncePrefs] = useState<{ email: boolean; push: boolean } | null>(null);
  const [pushSupport, setPushSupport] = useState<PushSupport | null>(null);
  const [savingPref, setSavingPref] = useState(false);
  const [prefMessage, setPrefMessage] = useState("");

  useEffect(() => {
    getPushState().then(setPushSupport).catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetch(`${API_URL}/api/members/me/`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setAnnouncePrefs({
          email: !!data.announce_email,
          push: !!data.announce_push,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [token]);

  async function saveAnnouncePref(field: "email" | "push", value: boolean) {
    if (!announcePrefs) return;
    const previous = announcePrefs;
    setAnnouncePrefs({ ...announcePrefs, [field]: value });
    setPrefMessage("");
    setSavingPref(true);
    try {
      const response = await fetch(`${API_URL}/api/members/me/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(field === "email" ? { announce_email: value } : { announce_push: value }),
      });
      if (!response.ok) throw new Error();
      setPrefMessage("Notification preference saved.");
      showAlert("Saved", "Your notification preference has been updated.", "success");
    } catch {
      setAnnouncePrefs(previous);
      showAlert("Not saved", "Your preference could not be saved. Try again.", "error");
    } finally {
      setSavingPref(false);
    }
  }

  return (
    <MemberWorkspace>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-bark sm:text-3xl">Preferences</h1>
          <p className="mt-1 text-sm text-moss">
            Customize how the application looks, adapts to your device, and sends you updates.
          </p>
        </div>

        {/* ── SECTION: APPEARANCE (THEME) ── */}
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sand text-ember">
              {theme === "dark" ? <Moon className="h-5 w-5" /> : theme === "light" ? <Sun className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-bark">Appearance &amp; Theme</h2>
              <p className="text-xs text-moss">
                Choose light mode, dark mode, or allow the app to follow your device settings.
              </p>
            </div>
          </div>

          <p className="text-xs text-moss leading-relaxed">
            <strong>System</strong> follows your device and adapts whenever it switches between light and dark mode. Light and Dark keep the app fixed in that mode regardless of device settings.
          </p>

          <div className="grid grid-cols-3 gap-3 sm:max-w-md">
            {(
              [
                { id: "system", label: "System", icon: Monitor },
                { id: "light", label: "Light", icon: Sun },
                { id: "dark", label: "Dark", icon: Moon },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                aria-pressed={theme === id}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl py-3 px-2 text-xs font-semibold transition ${
                  theme === id
                    ? "bg-bark text-white shadow-sm ring-2 ring-bark"
                    : "border border-sand-line bg-sand-card text-moss hover:border-ember hover:text-bark"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* ── SECTION: ACCESSIBILITY & DISPLAY ── */}
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sand text-ember">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-bark">Display &amp; Accessibility</h2>
                <p className="text-xs text-moss">Adjust typography, motion, and contrast to suit your visual needs.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={resetDefaults}
              title="Reset all display adjustments to original defaults"
              className="inline-flex items-center gap-1.5 rounded-xl border border-sand-line bg-white px-3 py-1.5 text-xs font-semibold text-moss transition hover:border-ember hover:text-bark"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset defaults
            </button>
          </div>

          {/* Font Size */}
          <div className="space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-bark">
              <Type className="h-4 w-4 text-moss" />
              Font Size
            </label>
            <div className="grid grid-cols-3 gap-2 sm:max-w-md">
              {(
                [
                  { id: "normal", label: "Default" },
                  { id: "large", label: "Large" },
                  { id: "xlarge", label: "Extra Large" },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFontSize(id)}
                  aria-pressed={fontSize === id}
                  className={`rounded-xl py-2 px-3 text-xs font-semibold transition ${
                    fontSize === id
                      ? "bg-bark text-white shadow-sm"
                      : "border border-sand-line bg-white text-moss hover:border-ember hover:text-bark"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggle Switches */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-4 rounded-2xl bg-sand p-3.5 text-xs font-medium cursor-pointer">
              <span>
                <strong className="block text-bark">High Contrast Mode</strong>
                <span className="text-moss">Increases contrast borders and text readability.</span>
              </span>
              <input
                type="checkbox"
                checked={highContrast}
                onChange={(e) => setHighContrast(e.target.checked)}
                className="h-4 w-4 rounded accent-bark"
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl bg-sand p-3.5 text-xs font-medium cursor-pointer">
              <span>
                <strong className="block text-bark">Dyslexia-Friendly Font</strong>
                <span className="text-moss">Applies higher-legibility weighted typography.</span>
              </span>
              <input
                type="checkbox"
                checked={dyslexicFont}
                onChange={(e) => setDyslexicFont(e.target.checked)}
                className="h-4 w-4 rounded accent-bark"
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl bg-sand p-3.5 text-xs font-medium cursor-pointer">
              <span>
                <strong className="block text-bark">Reduced Motion</strong>
                <span className="text-moss">Disables transitions and sliding animations.</span>
              </span>
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
                className="h-4 w-4 rounded accent-bark"
              />
            </label>

            <label className="flex items-center justify-between gap-4 rounded-2xl bg-sand p-3.5 text-xs font-medium cursor-pointer">
              <span>
                <strong className="block text-bark">High-Visibility Focus</strong>
                <span className="text-moss">Displays bold outlines for keyboard navigation.</span>
              </span>
              <input
                type="checkbox"
                checked={highVisFocus}
                onChange={(e) => setHighVisFocus(e.target.checked)}
                className="h-4 w-4 rounded accent-bark"
              />
            </label>
          </div>
        </section>

        {/* ── SECTION: NOTIFICATIONS ── */}
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-sand-line space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sand text-ember">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-bark">Notification Channels</h2>
              <p className="text-xs text-moss">
                Choose how church announcements and letters reach you.
              </p>
            </div>
          </div>

          {announcePrefs ? (
            <div className="space-y-3">
              <label className="flex items-center justify-between gap-4 rounded-2xl bg-sand p-3.5 text-xs font-medium cursor-pointer">
                <span>
                  <strong className="block text-bark">Announcements by Email</strong>
                  <span className="text-moss">Receive weekly church broadcasts and department letters by email.</span>
                </span>
                <input
                  type="checkbox"
                  disabled={savingPref}
                  checked={announcePrefs.email}
                  onChange={(e) => saveAnnouncePref("email", e.target.checked)}
                  className="h-4 w-4 rounded accent-bark"
                />
              </label>

              {pushSupport?.supported ? (
                <label className="flex items-center justify-between gap-4 rounded-2xl bg-sand p-3.5 text-xs font-medium cursor-pointer">
                  <span>
                    <strong className="block text-bark">Announcements as Push Notifications</strong>
                    <span className="text-moss">Receive an alert on this device whenever an announcement is posted.</span>
                  </span>
                  <input
                    type="checkbox"
                    disabled={savingPref}
                    checked={announcePrefs.push}
                    onChange={(e) => saveAnnouncePref("push", e.target.checked)}
                    className="h-4 w-4 rounded accent-bark"
                  />
                </label>
              ) : (
                <div className="rounded-2xl bg-sand p-3.5 text-xs font-medium">
                  <strong className="block text-bark">Push Notifications</strong>
                  <span className="text-moss">
                    Not available on this browser or device. On iPhone or iPad, add the church app to your Home Screen to enable notifications.
                  </span>
                </div>
              )}

              {pushSupport?.supported && !pushSupport.enabled && announcePrefs.push && (
                <p className="text-xs text-moss">
                  To receive notifications on <em>this</em> device, also ensure browser permission is granted in the notification bell at the top of the page.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-moss">Loading notification settings…</p>
          )}

          {prefMessage && <p className="text-xs font-medium text-ember">{prefMessage}</p>}
        </section>
      </div>
    </MemberWorkspace>
  );
}
