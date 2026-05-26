"use client";

import { useEffect } from "react";

const REFERRAL_STORAGE_KEY = "skilledge_referral_code";

export default function ReferralTracker() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");

    if (!ref) return;

    const normalizedRef = ref.trim().toUpperCase();

    if (normalizedRef.length < 4) return;

    localStorage.setItem(REFERRAL_STORAGE_KEY, normalizedRef);
    document.cookie = `${REFERRAL_STORAGE_KEY}=${encodeURIComponent(
      normalizedRef
    )}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  }, []);

  return null;
}