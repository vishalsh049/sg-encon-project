# Page-Based Permission System - Implementation Guide

## ✅ What's Been Implemented

Your page-based permission system is now fully functional! Here's what was changed:

### 1. **Sidebar Behavior** ✓
- **Shows ALL menus** regardless of user permissions
- Users can see and click on any menu item
- Pages they don't have access to will show "Access Denied"

### 2. **Access Control** ✓
- **Only permitted pages open** for the user
- Other pages display a professional "Access Denied" page
- Users can navigate back or go to dashboard

### 3. **Permission Flow** ✓
- Backend stores `page_permissions` as JSON for each user
- Login returns `pageAccess` array with page names
- Frontend checks permissions in real-time

---

## 🔄 How It Works

### Data Structure

**User Permissions (backend - users table):**
```json
{
  "page_permissions": "[{\"page\":\"Dashboard\"}, {\"page\":\"Billing\"}]"
}
```

**After Login (frontend receives):**
```javascript
{
  pageAccess: ["Dashboard", "Billing"],
  pagePermissions: [{page: "Dashboard"}, {page: "Billing"}]
}
```

### Permission Check Flow

```
1. User clicks menu item → navigates to route
2. Route wrapped with ProtectedRoute
3. ProtectedRoute calls hasAccess(user, pageName)
4. hasAccess checks if pageName is in user.pageAccess array
5. If ✓ allowed → render page content
6. If ✗ denied → render AccessDenied component
```

---

## 📝 How to Manage User Permissions

### Setting Permissions for a User

Users are created/updated in the **Users & Access** page with `pagePermissions` field.

**Structure for permissions array:**
```javascript
[
  { page: "Dashboard" },
  { page: "Billing Dashboard" },
  { page: "Billing Status" },
  { page: "Revenue" },
  { page: "Reports" },
  // ... add more page names as needed
]
```

### Available Page Names

```
Dashboard
Billing Dashboard
Billing Status
Revenue
KPIs Penalty
General Penalties
Physical
Scrum
Tower Reports
NSO Reports
Fiber Reports
Users
Add Data
Uptime Tower
Uptime Fiber
Uptime FTTx
Tower KPI
Fiber KPI
View Reports
```

---

## 🧪 Testing the System

### Test Case 1: User with Limited Access

**Setup:**
- Create user with `pagePermissions: [{page: "Dashboard"}, {page: "Reports"}]`

**Expected Behavior:**
1. User logs in → redirects to Dashboard (first allowed page)
2. Sidebar shows all menus
3. Click "Billing" → sees "You do not have access to this page"
4. Click "Reports" → page loads successfully

### Test Case 2: User with Full Access

**Setup:**
- Create user with empty `pagePermissions` array `[]`

**Expected Behavior:**
1. User can access ALL pages
2. No "Access Denied" errors
3. (Empty array = no restrictions = admin-like access)

### Test Case 3: User with Single Permission

**Setup:**
- Create user with `pagePermissions: [{page: "Dashboard"}]`

**Expected Behavior:**
1. Can only access Dashboard
2. All other pages show access denied
3. But all menus are still visible in sidebar

---

## 📂 Files Modified

1. **[src/utils/access.js](src/utils/access.js)**
   - Updated `hasAccess()` to check pageAccess array
   - Now case-insensitive and robust

2. **[src/components/AccessDenied.jsx](src/components/AccessDenied.jsx)** (NEW)
   - Beautiful access denied error page
   - Shows page name, error code, navigation buttons

3. **[src/components/ProtectedRoute.jsx](src/components/ProtectedRoute.jsx)**
   - Now uses AccessDenied component
   - Better error handling

4. **[src/components/Sidebar.jsx](src/components/Sidebar.jsx)**
   - Removed page-based filtering from `filterMenuByRole()`
   - Shows all menus regardless of permissions

5. **[src/context/UserContext.jsx](src/context/UserContext.jsx)**
   - Enhanced with initial load from sessionStorage
   - User persists across page reloads

---

## 🔐 Security Notes

**Frontend Only:**
- Permission checks on frontend are for UX only
- Always validate on backend before allowing data access

**Backend Always:**
- API endpoints should ALSO check permissions
- Frontend checks prevent unnecessary requests

---

## 🚀 Example: Complete User Setup

### Create User with Permission Management

```javascript
// Create a "Finance" user who can only access Billing pages
const financeUser = {
  name: "John Finance",
  email: "john@example.com",
  password: "secure_password",
  designation: "Finance Manager",
  circle: "Delhi",
  domain: "Commercial",
  status: "active",
  pagePermissions: [
    { page: "Billing Dashboard" },
    { page: "Billing Status" },
    { page: "Revenue" }
  ]
}
```

### Result:
- ✓ Can see: Dashboard, Billing, Reports, Manpower, Users menus
- ✓ Can access: Only Billing pages
- ✗ Cannot access: Other billing sub-pages, Reports, Manpower, etc.
- Shows "Access Denied" for unauthorized pages

---

## 💡 Key Features

✅ **Sidebar always shows all menus** - No hiding based on permissions
✅ **Professional access denied page** - Better UX than plain text
✅ **Case-insensitive matching** - Works with any capitalization
✅ **Admin/Super User bypass** - Empty pageAccess = full access
✅ **Persistent across reloads** - User stored in sessionStorage
✅ **Real-time enforcement** - Checks on every navigation
✅ **Backend integration ready** - Already using page_permissions field

---

## 🔧 Customization

### Add New Page

1. Add page name to `pageAccessList` in [UsersAccessPage.jsx](../pages/UsersAccessPage.jsx)
2. Use same name in ProtectedRoute's `page` prop
3. Users can now be assigned this permission

### Change Access Denied UI

Edit [AccessDenied.jsx](AccessDenied.jsx) to customize:
- Colors and styling
- Button text/behavior
- Error message

### Modify Permission Logic

Edit [access.js](access.js) `hasAccess()` function to:
- Add role-based overrides
- Check permission hierarchy
- Add custom business logic

---

## ✨ What's Next?

1. **Test the system** with different user permission sets
2. **Verify backend APIs** also check permissions
3. **Customize AccessDenied page** if needed
4. **Add audit logging** for unauthorized access attempts
5. **Create permission templates** for common roles

---

## ❓ Troubleshooting

**Issue**: User can access pages they shouldn't
- Check `pageAccess` array is properly set in user object
- Verify backend is returning correct pageAccess in /api/me
- Check browser console for errors

**Issue**: All pages show access denied
- User object not loading - check localStorage for token
- pageAccess array might be undefined - log user object
- Check if user has any permissions assigned

**Issue**: Sidebar not showing all menus
- Check if there are role-based filters affecting menu
- Verify `filterMenuByRole()` is not filtering by accessPage
- Check browser console for errors

---

## 📞 Support

For questions or issues with the permission system, check:
1. Browser console (F12) for errors
2. Backend logs for API issues
3. User object in browser DevTools → Application → SessionStorage
