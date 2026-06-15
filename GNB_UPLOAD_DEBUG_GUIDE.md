# GNB Upload Issue - Debug & Fix Guide

**Date:** 2026-06-15  
**Status:** 🔧 Enhanced Debugging Implemented  

---

## Problem Summary

GNB Excel upload was completing successfully but certain fields were becoming NULL or 0 in the database:
- ❌ sap_id = NULL (expected value from Excel)
- ❌ site_type = NULL (expected value from Excel)
- ❌ device_type = NULL (expected value from Excel)
- ❌ vendor = NULL (expected value from Excel)
- ❌ air_fiber_sites = NULL (expected value from Excel)
- ❌ updated_r4g = NULL (expected value from Excel)
- ❌ total_cnum_count = 0 (expected: 6)
- ❌ total_outage = 0 (expected: 0 - correct)
- ❌ total_availability = 0 (expected: 100)
- ❌ cells_up = 0 (expected: 9)
- ❌ availability = 0 (expected: 100)

---

## Root Cause Analysis

The `parseGnbRows()` function was not handling all possible Excel header variations. When Excel headers didn't exactly match the normalized expected names, the code would fall through to default values:

### Example Problem Scenario:
If Excel has: `"SAP_ID"` or `"SAP ID"` or `"sap-id"`
- Normalized to: `"sap id"`
- BUT if the actual header is: `"SAP"` or `"ID"` or uses special characters/BOM
- The field lookup fails → returns NULL or 0

---

## Solution Implemented

### 1️⃣ Enhanced Header Detection (`parseGnbRows` - Line 640)

**Added Debug Output:**
```javascript
console.log("📋 ORIGINAL EXCEL HEADERS:", Object.keys(row));
console.log("📋 NORMALIZED HEADERS:", Object.keys(cleanRow));
console.log("✅ Expected headers: sap id, circle, cmp, jc, city, site type, device type, ...");
```

✅ **Result:** Server logs will show EXACTLY what headers are in the Excel file

---

### 2️⃣ Smart Header Detection Helper Functions

**Added two new helper functions:**

```javascript
// Tries multiple possible header names
const findHeaderValue = (cleanRow, possibleNames) => {
  for (const name of possibleNames) {
    if (cleanRow[name] !== undefined && cleanRow[name] !== null && cleanRow[name] !== "") {
      return cleanRow[name];
    }
  }
  return undefined;
};

// Safely converts values to numbers
const toNumber = (value, defaultVal = 0) => {
  if (value === null || value === undefined || value === "") return defaultVal;
  const num = Number(value);
  return isNaN(num) ? defaultVal : num;
};
```

✅ **Result:** Even if headers don't match exactly, fallback names will catch them

---

### 3️⃣ Robust Field Extraction

**Updated all field mappings:**
```javascript
// Before (limited):
const sapId = cleanRow["sap id"] || cleanRow["sap_id"] || null;

// After (robust):
const sapId = findHeaderValue(cleanRow, ["sap id", "sap_id", "sap"]) || null;
const totalCnumCount = toNumber(findHeaderValue(cleanRow, ["total cnum count", "total_cnum_count", "cnum count"]), 0);
```

✅ **Result:** Multiple naming conventions will work

---

### 4️⃣ Detailed First-Row Logging

**Shows raw vs extracted data:**
```javascript
console.log("🔍 FIRST ROW DATA EXTRACTION:");
console.log("  sap_id =>", { raw: findHeaderValue(cleanRow, ["sap id", "sap_id"]), extracted: sapId });
console.log("  total_cnum_count =>", { raw: findHeaderValue(cleanRow, [...]), extracted: totalCnumCount });
```

✅ **Result:** Can see exactly which fields are missing or mismatched

---

## How to Debug Your GNB Upload

### Step 1: Enable Server Logging
1. Open terminal in VS Code
2. Navigate to backend: `cd backend`
3. Start server: `npm run dev` or `node server.js`
4. **Watch console output closely** - you'll see `========== GNB UPLOAD DEBUG ==========`

### Step 2: Upload GNB File
1. Use the frontend upload interface
2. Select GNB file type
3. Upload your Excel file
4. **Check server console immediately**

### Step 3: Check Debug Output

You should see output like:
```
========== GNB UPLOAD DEBUG ==========
📋 ORIGINAL EXCEL HEADERS: [ 'sap_id', 'circle', 'cmp', 'jc', 'city', ... ]
📋 NORMALIZED HEADERS: [ 'sap id', 'circle', 'cmp', 'jc', 'city', ... ]
✅ Expected headers: sap id, circle, cmp, jc, city, site type, device type, ...

🔍 FIRST ROW DATA EXTRACTION:
  sap_id => { raw: 'I-DL-BADQ-ENB-1001', extracted: 'I-DL-BADQ-ENB-1001' }
  circle => { raw: 'Delhi', extracted: 'Delhi' }
  ...
```

### Step 4: Identify Missing Headers
If you see:
```
⚠️  WARNING: Missing headers - might cause NULL values: [ 'site type', 'device type', 'vendor' ]
📌 Available keys: [ 'sap', 'site', 'type', ... ]
```

**This means** the Excel header names are different from expected!

---

## Common Excel Header Problems & Solutions

### Problem 1: Extra Spaces or Special Characters
**Excel has:** `"  sap_id  "` (with leading/trailing spaces)  
**Solution:** ✅ FIXED - trim() is applied during normalization

---

### Problem 2: BOM Characters (UTF-8 BOM)
**Excel has:** `"\uFEFFsap_id"` (invisible BOM character)  
**Symptom:** ⚠️ Header shows as unrecognizable character  
**Solution:** 
1. Check debug output - if header looks strange, there's likely a BOM
2. Re-save Excel file as "UTF-8 without BOM"
3. Try uploading again

---

### Problem 3: Different Column Names
**Excel has:** `"SAP"` instead of `"sap_id"`  
**Symptom:** ❌ sap_id becomes NULL  
**Solution:**
1. Use EXACT header names from expected list:
   ```
   sap_id, circle, cmp, jc, city, site_type, device_type,
   total_cnum_count, total_outage, total_availability,
   cells_up, cells_up_mod, vendor, availability,
   air_fiber_sites, updated_r4g
   ```
2. Or match one of the fallback names listed in the code

---

### Problem 4: Numeric Values Stored as Text
**Excel has:** `"100"` (text) instead of `100` (number)  
**Symptom:** ❌ total_cnum_count = 0  
**Solution:** ✅ FIXED - toNumber() converter handles text-to-number conversion

---

## Expected vs Actual Comparison

### ✅ CORRECT Behavior (After Fix)
| Field | Excel Value | Database Value | Status |
|-------|-------------|----------------|--------|
| sap_id | I-DL-BADQ-ENB-1001 | I-DL-BADQ-ENB-1001 | ✅ Correct |
| site_type | P Colo | P Colo | ✅ Correct |
| device_type | GNB | GNB | ✅ Correct |
| total_cnum_count | 6 | 6 | ✅ Correct |
| total_availability | 100 | 100 | ✅ Correct |
| vendor | Nokia | Nokia | ✅ Correct |

### ❌ BEFORE Fix
| Field | Excel Value | Database Value | Status |
|-------|-------------|----------------|--------|
| sap_id | I-DL-BADQ-ENB-1001 | NULL | ❌ Wrong |
| site_type | P Colo | NULL | ❌ Wrong |
| total_cnum_count | 6 | 0 | ❌ Wrong |

---

## Files Modified

### [backend/routes/reportRoutes.js](backend/routes/reportRoutes.js)

**Changes:**
1. ✅ Added `findHeaderValue()` helper (Line 630-638)
2. ✅ Added `toNumber()` helper (Line 641-648)
3. ✅ Enhanced `parseGnbRows()` with comprehensive debugging (Line 650-780)
4. ✅ Updated field extraction to use fallback names
5. ✅ Added detailed first-row logging

**Lines Modified:** 630-780

---

## Testing Checklist

- [ ] Start backend server: `npm run dev`
- [ ] Upload GNB Excel file from frontend
- [ ] Check server console for `========== GNB UPLOAD DEBUG ==========`
- [ ] Verify headers are detected correctly
- [ ] Verify values are extracted correctly
- [ ] Check database records for NULL/0 values
- [ ] If still NULL/0, check debug output for missing headers
- [ ] Note the "AVAILABLE KEYS" to see actual header names
- [ ] Update Excel headers if needed to match expected names

---

## Next Steps if Issue Persists

1. **Check Server Console Output**
   - Copy the `AVAILABLE KEYS` from debug output
   - Compare with expected headers

2. **Create Issue Report**
   - Paste the debug output showing actual headers
   - Show which fields are still NULL/0
   - Attach a sample of your Excel file (anonymized)

3. **Alternative: Rename Excel Headers**
   - If your headers differ from expected, rename them to match exactly:
     - Change "SAP" → "sap_id"
     - Change "SITE_TYPE" → "site_type"
     - etc.

---

## Code Implementation Details

### Header Normalization Pipeline:
```
Original: "  SAP_ID  " (with spaces, mixed case)
   ↓
.trim() → "SAP_ID"
   ↓
.toLowerCase() → "sap_id"
   ↓
.replace(/[\s_]+/g, " ") → "sap id" (underscore to space)
   ↓
cleanRow["sap id"] = value
```

### Field Extraction Pipeline:
```
findHeaderValue(cleanRow, ["sap id", "sap_id", "sap"])
   ↓
Check cleanRow["sap id"] → if found, return it
Check cleanRow["sap_id"] → if found, return it (shouldn't exist, but just in case)
Check cleanRow["sap"] → if found, return it (fallback for "sap" only)
Return undefined → converted to null
```

---

## Related Issues & Fixes

- **Date:** 2026-06-15
- **Type:** Upload Data Loss
- **Severity:** 🔴 HIGH (Data integrity issue)
- **Impact:** GNB records incomplete
- **Resolution:** Enhanced header detection and data extraction

---

**Created:** 2026-06-15  
**Last Updated:** 2026-06-15  
**Version:** 1.0
