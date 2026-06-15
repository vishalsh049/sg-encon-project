# Quick Testing Guide - Penalty Pages Fix

## Pre-Test Requirements
- Frontend server running (or run `npm run dev` in frontend directory)
- Backend server running (optional, PlaceholderPage doesn't need it)
- User logged in with valid authentication token

---

## Test Scenario 1: KPI Penalty Page Navigation

### Steps
1. Open application and ensure you're logged in
2. Look at sidebar → Find "Billing" section
3. Click on "KPIs Penalty" menu item
4. Expected: Page displays PlaceholderPage (not Login redirect)

### Verification
- ✅ URL changes to `/dashboard/billing/penalties/kpis`
- ✅ Page content loads (PlaceholderPage component)
- ✅ No 404 errors in browser console
- ✅ User remains authenticated
- ✅ Token still present in localStorage

---

## Test Scenario 2: General Penalties Page Navigation

### Steps
1. Ensure you're still logged in on the dashboard
2. Click on "General Penalties" menu item in Billing section
3. Expected: Page displays PlaceholderPage (not Login redirect)

### Verification
- ✅ URL changes to `/dashboard/billing/penalties/general`
- ✅ Page content loads (PlaceholderPage component)
- ✅ No 404 errors in browser console
- ✅ User remains authenticated

---

## Test Scenario 3: Direct URL Navigation

### Steps
1. While logged in, manually type in browser address bar:
   - `http://localhost:5173/dashboard/billing/penalties/kpis`
   - Or: `http://localhost:5173/dashboard/billing/penalties/general`
2. Expected: Page loads correctly

### Verification
- ✅ Page loads without redirect
- ✅ PlaceholderPage component renders
- ✅ URL is correct

---

## Test Scenario 4: Logout and Access (Permission Check)

### Steps
1. Logout of application
2. Try to access `/dashboard/billing/penalties/kpis` directly
3. Expected: Redirect to Login page

### Verification
- ✅ Unauthenticated users are redirected to Login
- ✅ ProtectedRoute component working correctly

---

## Browser Console Check

### No Errors Should Appear
```
❌ Resource not found (penalty routes)
❌ "Cannot read property 'map' of undefined"
❌ "ProtectedRoute" is not defined

✅ Page loads cleanly
✅ token found in localStorage
✅ User object loaded in context
```

### Check Authentication
```javascript
// In browser console, verify:
localStorage.getItem('token')        // Should return token string
localStorage.getItem('user')         // Should return user JSON
localStorage.getItem('role')         // Should return role
```

---

## Network Tab Check (F12)

### Expected Requests
```
✅ GET /dashboard/billing/penalties/kpis - 200 OK (HTML)
✅ GET /manifest.json - 200 OK or 404 (expected)
✅ GET /logo.png - 200 OK or 404 (expected)

❌ GET /dashboard/billing/penalties/kpis - 404 Not Found
❌ Redirect to /login - should NOT happen for logged-in users
```

---

## Permission Test (For Different User Roles)

### Admin User
- Should see both penalty menu items
- Should be able to access both pages
- AccessDenied should NOT appear

### Limited Permission User
- If user doesn't have "KPIs Penalty" permission:
  - Menu item may not appear
  - Direct URL access shows AccessDenied page
  - NOT redirected to Login (permission denied, not auth failed)

### No Permission User
- Menu items should not appear in sidebar
- Direct URL access shows AccessDenied component
- Message: "You do not have permission to view KPIs Penalty"

---

## Troubleshooting

### Issue: Still Getting Redirect to Login
**Solution:**
1. Clear browser cache and localStorage: `localStorage.clear()`
2. Refresh page (Ctrl+Shift+R)
3. Logout and login again
4. Check token is valid and not expired

### Issue: 404 Error in Console
**Solution:**
1. Verify App.jsx has the two new routes
2. Check route paths exactly match sidebar paths
3. Rebuild/restart frontend server
4. Check that /dashboard route is nested correctly

### Issue: PlaceholderPage Shows Loading Forever
**Solution:**
1. Check user object is loading: `localStorage.getItem('user')`
2. Verify authentication context is working
3. Check UserContext.jsx is properly implemented
4. Look for errors in browser console

---

## Success Criteria

All of the following should be TRUE:

- [ ] KPI Penalty menu item navigates to `/dashboard/billing/penalties/kpis`
- [ ] General Penalties menu item navigates to `/dashboard/billing/penalties/general`
- [ ] No Login redirect occurs for authenticated users
- [ ] PlaceholderPage component loads correctly
- [ ] No 404 errors in browser console
- [ ] Authentication token is maintained
- [ ] User object remains in localStorage
- [ ] Direct URL navigation works
- [ ] Logout/login cycle works normally
- [ ] Unauthorized users see AccessDenied, not Login redirect

---

## Quick Test Command

If running frontend in development:
```bash
# Terminal 1: Run frontend
cd frontend
npm run dev

# Terminal 2: In browser console, after logging in:
window.location.href = '/dashboard/billing/penalties/kpis'  # Should navigate successfully
```

