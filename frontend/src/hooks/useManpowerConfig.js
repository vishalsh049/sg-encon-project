import { useCallback, useEffect, useState } from "react";
import { fetchManpowerConfig, invalidateManpowerConfig } from "../lib/manpowerSettings";

// Shared Manpower Settings config (Main Profiles, Sub Profiles, Circles/CMPs,
// Validation Rules), fetched once from the backend (GET
// /api/manpower-settings/config) and reused by every manpower page so they
// can never drift apart. Call refresh() after an edit on the Manpower
// Settings page to pick up changes without a full reload.
export default function useManpowerConfig() {
  const [config, setConfig] = useState({
    mainProfiles: [],
    subProfiles: [],
    circles: [],
    cmps: [],
    validationRules: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const applyResult = useCallback((promise) => {
    return promise
      .then((data) => {
        setConfig(data);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load manpower settings:", err);
        setError(err);
      })
      .finally(() => setLoading(false));
  }, []);

  // No setLoading(true) here: `loading` already starts true, and the effect
  // body's first statement is the fetch itself (not a synchronous setState),
  // so a mount-time fetch never triggers a same-render cascading update.
  useEffect(() => {
    applyResult(fetchManpowerConfig());
  }, [applyResult]);

  const refresh = useCallback(() => {
    invalidateManpowerConfig();
    setLoading(true);
    return applyResult(fetchManpowerConfig());
  }, [applyResult]);

  const activeMainProfiles = config.mainProfiles
    .filter((p) => p.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const subProfilesByMainProfile = (roleKey) =>
    config.subProfiles.filter((sp) => sp.mainProfileRoleKey === roleKey && sp.isActive);

  const activeCircles = config.circles.filter((c) => c.isActive).sort((a, b) => a.displayOrder - b.displayOrder);

  const cmpsForCircle = (circleName) =>
    config.cmps
      .filter((cmp) => cmp.circleName === circleName && cmp.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder);

  const getValidationRule = (fieldKey, ruleType) =>
    config.validationRules.find((r) => r.fieldKey === fieldKey && r.ruleType === ruleType && r.isActive);

  return {
    config,
    loading,
    error,
    refresh,
    activeMainProfiles,
    subProfilesByMainProfile,
    activeCircles,
    cmpsForCircle,
    getValidationRule,
  };
}
