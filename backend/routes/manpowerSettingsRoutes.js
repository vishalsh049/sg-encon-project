const express = require("express");
const router = express.Router();

const { authMiddleware } = require("../middleware/circleAccess");
const { requirePagePermission } = require("../middleware/pagePermission");
const {
  query,
  ensureManpowerTables,
  clearManpowerConfigCache,
  getManpowerConfigPayload,
} = require("../services/manpowerConfigService");

router.use(authMiddleware);

async function ensureReady(req, res, next) {
  try {
    await ensureManpowerTables();
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to initialize manpower settings" });
  }
}

router.use(ensureReady);

// Bootstrap payload every manpower page reads instead of hardcoding its own
// copy — open to any authenticated user, same as /api/designations and
// /api/circles were before this change.
router.get("/config", async (req, res) => {
  try {
    const data = await getManpowerConfigPayload();
    res.json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to load manpower settings" });
  }
});

const EDIT = requirePagePermission("Manpower Settings", "edit");
const DELETE = requirePagePermission("Manpower Settings", "delete");

/* ---------------------------- Main Profiles ---------------------------- */

router.post("/main-profiles", EDIT, async (req, res) => {
  try {
    const { roleKey, label, hasSignoffColumn = true, displayOrder = 0 } = req.body;
    if (!roleKey || !label) {
      return res.status(400).json({ success: false, message: "roleKey and label are required" });
    }

    const result = await query(
      `INSERT INTO manpower_main_profiles (role_key, label, has_signoff_column, display_order) VALUES (?, ?, ?, ?)`,
      [String(roleKey).trim(), String(label).trim(), hasSignoffColumn ? 1 : 0, Number(displayOrder) || 0]
    );
    clearManpowerConfigCache();
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error(error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "A Main Profile with that role key already exists" });
    }
    res.status(500).json({ success: false, message: "Failed to create Main Profile" });
  }
});

router.put("/main-profiles/:id", EDIT, async (req, res) => {
  try {
    const { label, hasSignoffColumn, displayOrder, isActive } = req.body;
    await query(
      `UPDATE manpower_main_profiles
       SET label = COALESCE(?, label),
           has_signoff_column = COALESCE(?, has_signoff_column),
           display_order = COALESCE(?, display_order),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        label ?? null,
        hasSignoffColumn === undefined ? null : hasSignoffColumn ? 1 : 0,
        displayOrder === undefined ? null : Number(displayOrder),
        isActive === undefined ? null : isActive ? 1 : 0,
        req.params.id,
      ]
    );
    clearManpowerConfigCache();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update Main Profile" });
  }
});

// Soft delete only — historical physical/new_joining/scrum/signoff data
// keeps referencing profiles by role_key, so a Main Profile is deactivated,
// never hard-deleted.
router.delete("/main-profiles/:id", DELETE, async (req, res) => {
  try {
    await query(`UPDATE manpower_main_profiles SET is_active = 0 WHERE id = ?`, [req.params.id]);
    clearManpowerConfigCache();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to deactivate Main Profile" });
  }
});

/* ---------------------------- Sub Profiles ---------------------------- */

router.post("/sub-profiles", EDIT, async (req, res) => {
  try {
    const { mainProfileId = null, designationLabel, matchType = "exact", sourceScope = "both" } = req.body;
    if (!designationLabel) {
      return res.status(400).json({ success: false, message: "designationLabel is required" });
    }

    const result = await query(
      `INSERT INTO manpower_sub_profiles (main_profile_id, designation_label, match_type, source_scope) VALUES (?, ?, ?, ?)`,
      [mainProfileId, String(designationLabel).trim(), matchType, sourceScope]
    );
    clearManpowerConfigCache();
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to create Sub Profile" });
  }
});

router.put("/sub-profiles/:id", EDIT, async (req, res) => {
  try {
    const { mainProfileId, designationLabel, matchType, sourceScope, isActive } = req.body;
    await query(
      `UPDATE manpower_sub_profiles
       SET main_profile_id = COALESCE(?, main_profile_id),
           designation_label = COALESCE(?, designation_label),
           match_type = COALESCE(?, match_type),
           source_scope = COALESCE(?, source_scope),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        mainProfileId === undefined ? null : mainProfileId,
        designationLabel ?? null,
        matchType ?? null,
        sourceScope ?? null,
        isActive === undefined ? null : isActive ? 1 : 0,
        req.params.id,
      ]
    );
    clearManpowerConfigCache();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update Sub Profile" });
  }
});

router.delete("/sub-profiles/:id", DELETE, async (req, res) => {
  try {
    await query(`UPDATE manpower_sub_profiles SET is_active = 0 WHERE id = ?`, [req.params.id]);
    clearManpowerConfigCache();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to deactivate Sub Profile" });
  }
});

/* ------------------------------- Circles ------------------------------- */

router.post("/circles", EDIT, async (req, res) => {
  try {
    const { name, aliases = [], displayOrder = 0 } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: "name is required" });
    }

    const result = await query(
      `INSERT INTO manpower_circles (name, aliases, display_order) VALUES (?, ?, ?)`,
      [String(name).trim(), JSON.stringify(aliases || []), Number(displayOrder) || 0]
    );
    clearManpowerConfigCache();
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error(error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "A circle with that name already exists" });
    }
    res.status(500).json({ success: false, message: "Failed to create circle" });
  }
});

router.put("/circles/:id", EDIT, async (req, res) => {
  try {
    const { name, aliases, displayOrder, isActive } = req.body;
    await query(
      `UPDATE manpower_circles
       SET name = COALESCE(?, name),
           aliases = COALESCE(?, aliases),
           display_order = COALESCE(?, display_order),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        name ?? null,
        aliases === undefined ? null : JSON.stringify(aliases),
        displayOrder === undefined ? null : Number(displayOrder),
        isActive === undefined ? null : isActive ? 1 : 0,
        req.params.id,
      ]
    );
    clearManpowerConfigCache();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update circle" });
  }
});

router.delete("/circles/:id", DELETE, async (req, res) => {
  try {
    await query(`UPDATE manpower_circles SET is_active = 0 WHERE id = ?`, [req.params.id]);
    clearManpowerConfigCache();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to deactivate circle" });
  }
});

/* -------------------------------- CMPs --------------------------------- */

router.post("/cmps", EDIT, async (req, res) => {
  try {
    const { circleId, name, aliases = [], displayOrder = 0 } = req.body;
    if (!circleId || !name) {
      return res.status(400).json({ success: false, message: "circleId and name are required" });
    }

    const result = await query(
      `INSERT INTO manpower_cmps (circle_id, name, aliases, display_order) VALUES (?, ?, ?, ?)`,
      [circleId, String(name).trim(), JSON.stringify(aliases || []), Number(displayOrder) || 0]
    );
    clearManpowerConfigCache();
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error(error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "That CMP already exists under this circle" });
    }
    res.status(500).json({ success: false, message: "Failed to create CMP" });
  }
});

router.put("/cmps/:id", EDIT, async (req, res) => {
  try {
    const { circleId, name, aliases, displayOrder, isActive } = req.body;
    await query(
      `UPDATE manpower_cmps
       SET circle_id = COALESCE(?, circle_id),
           name = COALESCE(?, name),
           aliases = COALESCE(?, aliases),
           display_order = COALESCE(?, display_order),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        circleId ?? null,
        name ?? null,
        aliases === undefined ? null : JSON.stringify(aliases),
        displayOrder === undefined ? null : Number(displayOrder),
        isActive === undefined ? null : isActive ? 1 : 0,
        req.params.id,
      ]
    );
    clearManpowerConfigCache();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update CMP" });
  }
});

router.delete("/cmps/:id", DELETE, async (req, res) => {
  try {
    await query(`UPDATE manpower_cmps SET is_active = 0 WHERE id = ?`, [req.params.id]);
    clearManpowerConfigCache();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to deactivate CMP" });
  }
});

/* --------------------------- Validation Rules --------------------------- */

router.post("/validation-rules", EDIT, async (req, res) => {
  try {
    const { fieldKey, ruleType, ruleValue, errorMessage = null, appliesTo = [] } = req.body;
    if (!fieldKey || !ruleType || ruleValue === undefined) {
      return res.status(400).json({ success: false, message: "fieldKey, ruleType and ruleValue are required" });
    }

    const storedValue = typeof ruleValue === "string" ? ruleValue : JSON.stringify(ruleValue);
    const result = await query(
      `INSERT INTO manpower_validation_rules (field_key, rule_type, rule_value, error_message, applies_to) VALUES (?, ?, ?, ?, ?)`,
      [String(fieldKey).trim(), ruleType, storedValue, errorMessage, JSON.stringify(appliesTo || [])]
    );
    clearManpowerConfigCache();
    res.status(201).json({ success: true, id: result.insertId });
  } catch (error) {
    console.error(error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "That field already has a rule of this type" });
    }
    res.status(500).json({ success: false, message: "Failed to create validation rule" });
  }
});

router.put("/validation-rules/:id", EDIT, async (req, res) => {
  try {
    const { ruleValue, errorMessage, appliesTo, isActive } = req.body;
    const storedValue =
      ruleValue === undefined ? null : typeof ruleValue === "string" ? ruleValue : JSON.stringify(ruleValue);

    await query(
      `UPDATE manpower_validation_rules
       SET rule_value = COALESCE(?, rule_value),
           error_message = COALESCE(?, error_message),
           applies_to = COALESCE(?, applies_to),
           is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        storedValue,
        errorMessage ?? null,
        appliesTo === undefined ? null : JSON.stringify(appliesTo),
        isActive === undefined ? null : isActive ? 1 : 0,
        req.params.id,
      ]
    );
    clearManpowerConfigCache();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to update validation rule" });
  }
});

router.delete("/validation-rules/:id", DELETE, async (req, res) => {
  try {
    await query(`UPDATE manpower_validation_rules SET is_active = 0 WHERE id = ?`, [req.params.id]);
    clearManpowerConfigCache();
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to deactivate validation rule" });
  }
});

module.exports = router;
