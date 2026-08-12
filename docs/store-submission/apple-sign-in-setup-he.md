# הגדרת Sign in with Apple

## מזהים קבועים

- App ID / Bundle ID: `com.sogrimhashbon.app`
- Services ID מומלץ: `com.sogrimhashbon.app.web`
- Supabase project ref: `isdaozthehplneapkfwd`
- Website domain ב-Apple: `isdaozthehplneapkfwd.supabase.co`
- Return URL ב-Apple: `https://isdaozthehplneapkfwd.supabase.co/auth/v1/callback`

## Apple Developer

1. ליצור Explicit App ID בשם `סוגרים חשבון` עם Bundle ID `com.sogrimhashbon.app`.
2. להפעיל `Sign in with Apple` כ-Primary App ID ואת `Associated Domains`.
3. ליצור Services ID בשם `סוגרים חשבון Web` עם המזהה `com.sogrimhashbon.app.web`.
4. ב-Configure של Services ID לבחור את ה-App ID, להזין את הדומיין ואת Return URL שמופיעים למעלה.
5. ליצור Key עם יכולת Sign in with Apple, להוריד את `AuthKey_*.p8` ולשמור אותו במקום פרטי. הקובץ ניתן להורדה פעם אחת בלבד.

אין להגדיר Server-to-Server Notification URL עבור Supabase.

## יצירת Client Secret מקומית

ב-PowerShell, לאחר שיש Team ID, Key ID וקובץ `.p8`:

```powershell
$env:APPLE_TEAM_ID="XXXXXXXXXX"
$env:APPLE_KEY_ID="XXXXXXXXXX"
$env:APPLE_SERVICES_ID="com.sogrimhashbon.app.web"
$env:APPLE_PRIVATE_KEY_PATH="C:\path\AuthKey_XXXXXXXXXX.p8"
npm.cmd run native:ios:apple-secret
```

הסוד נכתב אל `.apple-client-secret.txt`, שמוחרג מ-Git. יש להדביק אותו רק בשדה Secret של Apple Provider ב-Supabase ולמחוק אותו לאחר השימוש.

## Supabase

ב-Authentication > Providers > Apple:

- Enable Apple provider: פעיל.
- Client IDs: `com.sogrimhashbon.app.web,com.sogrimhashbon.app` כאשר Services ID מופיע ראשון.
- Secret: תוכן `.apple-client-secret.txt`.

Apple מחייבת להחליף את ה-client secret של OAuth לפני פקיעתו, לכל היותר כל שישה חודשים. יש ליצור תזכורת קבועה לחידוש חמישה חודשים לאחר ההפעלה.
